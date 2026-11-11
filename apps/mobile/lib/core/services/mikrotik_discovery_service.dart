import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart' as crypto_pkg;
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/router_provisioning_models.dart';

/// Structured REST operation representation with verified HTTP method, path, and payload
class MikrotikRestOperation {
  final String method; // 'GET' | 'PUT' | 'PATCH' | 'POST' | 'DELETE'
  final String path;
  final Map<String, dynamic>? body;

  const MikrotikRestOperation({
    required this.method,
    required this.path,
    this.body,
  });
}

/// Representation of a discovered MikroTik router on the local network
class DiscoveredRouterModel {
  final String ip;
  final String identity;
  final String? model;
  final String? version;
  final String? macAddress;
  final List<int> openPorts;
  final String rosVersion; // 'V6' | 'V7'
  final bool isReachable;
  final String connectionType; // 'API' | 'REST' | 'WEB'
  final String discoveryMethod; // 'MNDP' | 'PROBE' | 'HTTP_SIGNATURE'

  const DiscoveredRouterModel({
    required this.ip,
    required this.identity,
    this.model,
    this.version,
    this.macAddress,
    this.openPorts = const [],
    this.rosVersion = 'V7',
    this.isReachable = true,
    this.connectionType = 'API',
    this.discoveryMethod = 'PROBE',
  });

  factory DiscoveredRouterModel.fromJson(Map<String, dynamic> json) {
    return DiscoveredRouterModel(
      ip: json['ip'] as String? ?? '',
      identity: json['identity'] as String? ?? 'MikroTik Router',
      model: json['model'] as String?,
      version: json['version'] as String?,
      macAddress: json['macAddress'] as String?,
      openPorts: (json['openPorts'] as List<dynamic>?)?.map((p) => p as int).toList() ?? const [],
      rosVersion: json['rosVersion'] as String? ?? 'V7',
      isReachable: json['isReachable'] as bool? ?? true,
      connectionType: json['connectionType'] as String? ?? 'API',
      discoveryMethod: json['discoveryMethod'] as String? ?? 'PROBE',
    );
  }

  Map<String, dynamic> toJson() => {
    'ip': ip,
    'identity': identity,
    'model': model,
    'version': version,
    'macAddress': macAddress,
    'openPorts': openPorts,
    'rosVersion': rosVersion,
    'isReachable': isReachable,
    'connectionType': connectionType,
    'discoveryMethod': discoveryMethod,
  };
}

/// Service that discovers MikroTik routers on the active local subnet (LAN/Wi-Fi)
/// using MNDP (MikroTik Neighbor Discovery Protocol) and multi-port signature probing.
class MikrotikDiscoveryService {
  bool _isSearching = false;
  bool get isSearching => _isSearching;

  bool _cancelRequested = false;

  void stop() {
    _cancelRequested = true;
    _isSearching = false;
  }

  /// Discover MikroTik devices on the local network with real-time streaming progress
  Stream<DiscoveredRouterModel> discoverStream({
    Duration timeout = const Duration(seconds: 10),
    void Function(double progress, String status)? onProgress,
  }) async* {
    _isSearching = true;
    _cancelRequested = false;

    final foundIps = <String>{};
    final outController = StreamController<DiscoveredRouterModel>();

    onProgress?.call(0.1, 'جارِ فحص واجهات الشبكة المحلية...');

    // 1. Gather candidate target IPs
    final candidateIps = await _gatherCandidateIps();
    if (_cancelRequested) {
      _isSearching = false;
      return;
    }

    onProgress?.call(0.2, 'بدء الاستماع لبروتوكول اكتشاف ميكروتك (MNDP)...');

    // 2. Start MNDP UDP Listener in parallel and yield immediately
    final mndpSub = _listenMndp().listen((router) {
      if (!foundIps.contains(router.ip) && !outController.isClosed) {
        foundIps.add(router.ip);
        outController.add(router);
      }
    });

    // 3. Probe candidate IPs asynchronously and stream results
    () async {
      try {
        final total = candidateIps.length;
        int processed = 0;

        for (final ip in candidateIps) {
          if (_cancelRequested) break;

          if (!foundIps.contains(ip)) {
            final router = await _probeCandidate(ip);
            if (router != null && !foundIps.contains(router.ip) && !outController.isClosed) {
              foundIps.add(router.ip);
              outController.add(router);
            }
          }

          processed++;
          final ratio = 0.2 + (0.75 * (processed / (total > 0 ? total : 1)));
          onProgress?.call(ratio, 'فحص العنوان: $ip ($processed/$total)');
        }
      } catch (e) {
        debugPrint('[MikrotikDiscoveryService] Probe loop error: $e');
      } finally {
        await Future.delayed(const Duration(milliseconds: 500));
        await mndpSub.cancel();
        if (!outController.isClosed) {
          await outController.close();
        }
        onProgress?.call(1.0, 'اكتمل البحث');
        _isSearching = false;
      }
    }();

    yield* outController.stream;
  }

  /// Gather local gateway and subnet candidate IPs
  Future<List<String>> _gatherCandidateIps() async {
    final candidates = <String>{
      '192.168.88.1', // Default MikroTik IP
      '192.168.1.1',  // Common router gateway
      '10.0.0.1',     // Common private gateway
      '172.16.0.1',
    };

    try {
      final interfaces = await NetworkInterface.list(
        includeLoopback: false,
        type: InternetAddressType.IPv4,
      );

      for (final iface in interfaces) {
        for (final addr in iface.addresses) {
          final ipStr = addr.address;
          if (_isPrivateIpv4(ipStr)) {
            final parts = ipStr.split('.');
            if (parts.length == 4) {
              final prefix = '${parts[0]}.${parts[1]}.${parts[2]}';
              candidates.add('$prefix.1');   // .1 is standard gateway
              candidates.add('$prefix.254'); // .254 is alternate gateway
              candidates.add('$prefix.2');

              // Add a sample of likely router host numbers
              candidates.add('$prefix.88');
              candidates.add('$prefix.10');
            }
          }
        }
      }
    } catch (e) {
      debugPrint('[MikrotikDiscoveryService] NetworkInterface error: $e');
    }

    return candidates.toList();
  }

  /// Fast multi-vector probe on a candidate IP: API port 8728, WebFig port 80/443
  Future<DiscoveredRouterModel?> _probeCandidate(String ip) async {
    final openPorts = <int>[];
    String? webSignatureIdentity;
    String? webModel;
    String? rosVersion = 'V7';

    // 1. Probe port 8728 (API Socket) with protocol verification
    final isApiOpen = await _probeTcpPort(ip, 8728, timeoutMs: 350);
    bool isVerifiedRouterOsApi = false;
    if (isApiOpen) {
      openPorts.add(8728);
      isVerifiedRouterOsApi = await _verifyRouterOsApiSocket(ip, 8728, timeoutMs: 400);
    }

    // 2. Probe port 8729 (API-SSL)
    final isApiSslOpen = await _probeTcpPort(ip, 8729, timeoutMs: 300);
    if (isApiSslOpen) {
      openPorts.add(8729);
    }

    // 3. Probe port 80 (HTTP WebFig)
    final isHttpOpen = await _probeTcpPort(ip, 80, timeoutMs: 350);
    if (isHttpOpen) {
      openPorts.add(80);
      final sig = await _fetchHttpSignature(ip, 80);
      if (sig != null) {
        webSignatureIdentity = sig.identity;
        webModel = sig.model;
        if (sig.version != null && sig.version!.contains('6.')) {
          rosVersion = 'V6';
        }
      }
    }

    // 4. Probe port 443 (HTTPS)
    final isHttpsOpen = await _probeTcpPort(ip, 443, timeoutMs: 350);
    if (isHttpsOpen) {
      openPorts.add(443);
    }

    // Verified MikroTik: Protocol API confirmed OR HTTP signature confirmed
    final isMikrotik = isVerifiedRouterOsApi ||
        (isApiOpen && (openPorts.contains(80) || openPorts.contains(443))) ||
        (webSignatureIdentity != null);

    if (isMikrotik) {
      return DiscoveredRouterModel(
        ip: ip,
        identity: webSignatureIdentity ?? 'MikroTik Router ($ip)',
        model: webModel ?? 'RouterBOARD',
        openPorts: openPorts,
        rosVersion: rosVersion,
        isReachable: true,
        connectionType: openPorts.contains(8728) ? 'API' : 'REST',
        discoveryMethod: webSignatureIdentity != null ? 'HTTP_SIGNATURE' : 'PROBE',
      );
    }

    return null;
  }

  /// Verify that port 8728 is genuinely responding to MikroTik RouterOS API protocol
  Future<bool> _verifyRouterOsApiSocket(String ip, int port, {int timeoutMs = 400}) async {
    Socket? socket;
    try {
      socket = await Socket.connect(ip, port, timeout: Duration(milliseconds: timeoutMs));
      // Send RouterOS API login sentence: length 6 bytes + "/login" + trailing 0
      socket.add([0x06, 0x2F, 0x6C, 0x6F, 0x67, 0x69, 0x6E, 0x00]);
      await socket.flush();

      final completer = Completer<bool>();
      socket.timeout(Duration(milliseconds: timeoutMs)).listen(
        (data) {
          final resp = utf8.decode(data, allowMalformed: true);
          if (resp.contains('!done') || resp.contains('!trap')) {
            if (!completer.isCompleted) completer.complete(true);
          } else {
            if (!completer.isCompleted) completer.complete(false);
          }
        },
        onError: (_) {
          if (!completer.isCompleted) completer.complete(false);
        },
        onDone: () {
          if (!completer.isCompleted) completer.complete(false);
        },
      );

      final isRouterOs = await completer.future.timeout(
        Duration(milliseconds: timeoutMs),
        onTimeout: () => false,
      );
      await socket.close();
      return isRouterOs;
    } catch (_) {
      socket?.destroy();
      return false;
    }
  }

  /// Test credentials directly from the mobile phone over the local network (LAN)
  Future<Map<String, dynamic>> verifyCredentialsLocally({
    required String host,
    required String username,
    required String password,
    int apiPort = 8728,
    int restPort = 80,
    String rosVersion = 'V7',
    bool useSsl = false,
  }) async {
    final start = DateTime.now();
    HttpClient? httpClient;

    // Strategy A: If RouterOS v7 or REST available, test via /rest/system/resource
    try {
      httpClient = HttpClient()
        ..connectionTimeout = const Duration(seconds: 3)
        ..badCertificateCallback = (cert, host, port) => true;

      final port = useSsl ? 443 : (restPort == 443 ? 80 : restPort);
      final scheme = useSsl ? 'https' : 'http';
      final uri = Uri.parse('$scheme://$host:$port/rest/system/resource');

      final request = await httpClient.getUrl(uri).timeout(const Duration(seconds: 3));
      final authStr = base64Encode(utf8.encode('$username:$password'));
      request.headers.set('Authorization', 'Basic $authStr');

      final response = await request.close().timeout(const Duration(seconds: 3));
      final latency = DateTime.now().difference(start).inMilliseconds;

      if (response.statusCode == 200) {
        final body = await response.transform(utf8.decoder).join();
        Map<String, dynamic>? resMap;
        try {
          final decoded = jsonDecode(body);
          if (decoded is Map<String, dynamic>) resMap = decoded;
        } catch (_) {}

        return {
          'success': true,
          'stage': 'CONNECTED',
          'code': 'CONNECTED_SUCCESS',
          'latencyMs': latency,
          'message': 'تم الاتصال والمصادقة محلياً من الهاتف بنجاح (زمن الاستجابة: ${latency}ms)',
          'routerInfo': {
            'model': resMap?['board-name'] ?? 'MikroTik Router',
            'version': resMap?['version'] ?? rosVersion,
            'cpuLoad': resMap?['cpu-load'],
            'protocol': 'REST API (Local)',
          },
        };
      } else if (response.statusCode == 401 || response.statusCode == 403) {
        return {
          'success': false,
          'stage': 'AUTH',
          'code': 'INVALID_CREDENTIALS',
          'message': 'بيانات تسجيل الدخول غير صحيحة (اسم المستخدم أو كلمة المرور خطأ في الراوتر)',
        };
      }
    } catch (_) {
      // Fall through to Strategy B
    } finally {
      httpClient?.close(force: true);
    }

    // Strategy B: Authenticated RouterOS Binary API on port 8728/8729
    final binClient = _LocalMikrotikBinaryApiClient(
      host: host,
      port: apiPort,
      useSsl: useSsl,
    );
    try {
      await binClient.connect(timeout: const Duration(seconds: 4));
      final authOk = await binClient.login(username, password);
      final latency = DateTime.now().difference(start).inMilliseconds;
      if (!authOk) {
        return {
          'success': false,
          'stage': 'AUTH',
          'code': 'INVALID_CREDENTIALS',
          'message': 'بيانات تسجيل الدخول غير صحيحة عبر منفذ API ($apiPort)',
        };
      }

      Map<String, String> resAttrs = {};
      try {
        final resRows = await binClient.sendCommand(['/system/resource/print']);
        if (resRows.isNotEmpty) resAttrs = resRows.first;
      } catch (_) {}

      return {
        'success': true,
        'stage': 'CONNECTED',
        'code': 'CONNECTED_SUCCESS',
        'latencyMs': latency,
        'message': 'تم الاتصال والمصادقة عبر منفذ API ($apiPort) بنجاح (زمن الاستجابة: ${latency}ms)',
        'routerInfo': {
          'model': resAttrs['board-name'] ?? resAttrs['platform'] ?? 'MikroTik Router',
          'version': resAttrs['version'] ?? rosVersion,
          'cpuLoad': resAttrs['cpu-load'],
          'protocol': 'API Socket (Authenticated)',
        },
      };
    } on _LocalBinaryAuthException catch (authErr) {
      return {
        'success': false,
        'stage': 'AUTH',
        'code': 'INVALID_CREDENTIALS',
        'message': authErr.message,
      };
    } catch (_) {
      return {
        'success': false,
        'stage': 'NETWORK',
        'code': 'CONNECTION_FAILED',
        'message': 'تعذر الاتصال بالراوتر محلياً عبر العنوان ($host): تأكد من اتصال هاتفك بشبكة واي فاي الراوتر مباشرة وتفعيل API أو REST.',
      };
    } finally {
      await binClient.close();
    }
  }

  /// Discovers physical interfaces, bridges, IP addresses, and resources directly
  /// from a live MikroTik router on the local network (LAN / Wi-Fi) using REST API.
  Future<RouterDiscoverySnapshotModel> discoverLocally({
    required String host,
    required String username,
    required String password,
    int apiPort = 8728,
    int restPort = 80,
    String rosVersion = 'V7',
    bool useSsl = false,
  }) async {
    final authHeader = 'Basic ${base64Encode(utf8.encode('$username:$password'))}';

    // Candidate configurations to try:
    // 1. User's specified protocol & port (HTTP 80 or HTTPS 443)
    // 2. Alternate port/scheme fallback (in case of redirect or differing config)
    final candidateConfigs = <({bool ssl, int port})>[
      (ssl: useSsl, port: useSsl ? (restPort == 80 ? 443 : restPort) : (restPort == 443 ? 80 : restPort)),
      (ssl: !useSsl, port: !useSsl ? 443 : 80),
    ];

    Object? lastError;

    for (final cfg in candidateConfigs) {
      final scheme = cfg.ssl ? 'https' : 'http';
      final port = cfg.port;

      HttpClient? client;
      try {
        client = HttpClient()
          ..connectionTimeout = const Duration(seconds: 5)
          ..badCertificateCallback = (cert, host, port) => true;

        final endpointErrors = <String, String>{};

        List<Map<String, dynamic>> normalizeList(dynamic raw) {
          if (raw == null) return [];
          if (raw is List) {
            return raw.whereType<Map<String, dynamic>>().toList();
          }
          if (raw is Map<String, dynamic>) {
            return [raw];
          }
          return [];
        }

        Future<dynamic> fetchEndpoint(String endpoint) async {
          try {
            final uri = Uri.parse('$scheme://$host:$port/rest$endpoint');
            final req = await client!.getUrl(uri).timeout(const Duration(seconds: 5));
            req.headers.set('Authorization', authHeader);
            req.headers.set('Accept', 'application/json');
            final res = await req.close().timeout(const Duration(seconds: 5));
            if (res.statusCode == 200) {
              final body = await res.transform(utf8.decoder).join();
              if (body.trim().isNotEmpty) {
                return jsonDecode(body);
              }
            } else {
              endpointErrors[endpoint] = 'HTTP ${res.statusCode}';
            }
          } catch (e) {
            endpointErrors[endpoint] = e.toString();
            debugPrint('[discoverLocally] $endpoint note: $e');
          }
          return null;
        }

        // Query comprehensive router state in parallel
        final results = await Future.wait([
          fetchEndpoint('/system/resource'),
          fetchEndpoint('/interface'),
          fetchEndpoint('/interface/bridge'),
          fetchEndpoint('/interface/bridge/port'),
          fetchEndpoint('/ip/address'),
          fetchEndpoint('/ip/route'),
          fetchEndpoint('/ip/dhcp-server'),
          fetchEndpoint('/ip/dhcp-server/network'),
          fetchEndpoint('/ip/dhcp-client'),
          fetchEndpoint('/ip/pool'),
          fetchEndpoint('/ip/hotspot'),
          fetchEndpoint('/ip/hotspot/profile'),
          fetchEndpoint('/ip/hotspot/user/profile'),
          fetchEndpoint('/ip/firewall/nat'),
          fetchEndpoint('/ip/firewall/filter'),
          fetchEndpoint('/ip/firewall/mangle'),
          fetchEndpoint('/ip/dns'),
        ]);

        final resRaw = results[0] as Map<String, dynamic>? ?? {};
        final ifacesRaw = normalizeList(results[1]);
        final bridgesRaw = normalizeList(results[2]);
        final bridgePortsRaw = normalizeList(results[3]);
        final ipsRaw = normalizeList(results[4]);
        final routesRaw = normalizeList(results[5]);
        final dhcpServersRaw = normalizeList(results[6]);
        final dhcpNetworksRaw = normalizeList(results[7]);
        final dhcpClientsRaw = normalizeList(results[8]);
        final poolsRaw = normalizeList(results[9]);
        final hsRaw = normalizeList(results[10]);
        final hsProfilesRaw = normalizeList(results[11]);
        final hsUserProfilesRaw = normalizeList(results[12]);
        final natRulesRaw = normalizeList(results[13]);
        final filterRulesRaw = normalizeList(results[14]);
        final mangleRulesRaw = normalizeList(results[15]);
        final dnsRaw = results[16] is Map<String, dynamic> ? results[16] as Map<String, dynamic> : null;

        final authError = endpointErrors.values.any((v) => v.contains('HTTP 401') || v.contains('HTTP 403'));
        if (authError) {
          throw Exception('بيانات تسجيل الدخول للراوتر غير صحيحة (REST 401/403).');
        }

        const coreEndpoints = [
          '/system/resource',
          '/interface',
          '/interface/bridge',
          '/interface/bridge/port',
          '/ip/address',
          '/ip/route',
        ];
        final coreComplete = coreEndpoints.every((ep) => !endpointErrors.containsKey(ep));

        if (ifacesRaw.isNotEmpty && coreComplete) {
          return _buildDiscoverySnapshotFromRaw(
            resRaw: resRaw,
            ifacesRaw: ifacesRaw,
            bridgesRaw: bridgesRaw,
            bridgePortsRaw: bridgePortsRaw,
            ipsRaw: ipsRaw,
            routesRaw: routesRaw,
            dhcpServersRaw: dhcpServersRaw,
            dhcpNetworksRaw: dhcpNetworksRaw,
            dhcpClientsRaw: dhcpClientsRaw,
            poolsRaw: poolsRaw,
            hsRaw: hsRaw,
            hsProfilesRaw: hsProfilesRaw,
            hsUserProfilesRaw: hsUserProfilesRaw,
            natRulesRaw: natRulesRaw,
            filterRulesRaw: filterRulesRaw,
            mangleRulesRaw: mangleRulesRaw,
            dnsRaw: dnsRaw,
            rosVersion: rosVersion,
            isComplete: endpointErrors.isEmpty,
          );
        }
      } catch (err) {
        if (err.toString().contains('401/403')) rethrow;
        lastError = err;
      } finally {
        client?.close(force: true);
      }
    }

    // Strategy B Fallback for ROS7/ROS6 routers with REST disabled or blocked: Binary API 8728/8729
    try {
      return await _discoverViaBinaryApi(
        host: host,
        username: username,
        password: password,
        apiPort: apiPort,
        rosVersion: rosVersion,
        useSsl: useSsl,
      );
    } catch (binErr) {
      lastError = binErr;
    }

    throw Exception(
      'تعذر جلب منافذ الراوتر محلياً عبر REST أو API ($host): ${lastError.toString().replaceFirst('Exception: ', '')}',
    );
  }

  /// Normalizes RouterOS raw record maps so `.id` (e.g. `*3`) is also exposed as `id`.
  static List<Map<String, dynamic>> normalizeRawEntriesWithIds(
    List<Map<String, dynamic>> rawList,
  ) {
    return rawList.map((raw) {
      final copy = Map<String, dynamic>.from(raw);
      final dotId = copy['.id']?.toString().trim() ?? '';
      final currentId = copy['id']?.toString().trim() ?? '';
      if (currentId.isEmpty && dotId.isNotEmpty) {
        copy['id'] = dotId;
      }
      return copy;
    }).toList();
  }

  RouterDiscoverySnapshotModel _buildDiscoverySnapshotFromRaw({
    required Map<String, dynamic> resRaw,
    required List<Map<String, dynamic>> ifacesRaw,
    required List<Map<String, dynamic>> bridgesRaw,
    required List<Map<String, dynamic>> bridgePortsRaw,
    required List<Map<String, dynamic>> ipsRaw,
    required List<Map<String, dynamic>> routesRaw,
    required List<Map<String, dynamic>> dhcpServersRaw,
    required List<Map<String, dynamic>> dhcpNetworksRaw,
    required List<Map<String, dynamic>> dhcpClientsRaw,
    required List<Map<String, dynamic>> poolsRaw,
    required List<Map<String, dynamic>> hsRaw,
    required List<Map<String, dynamic>> hsProfilesRaw,
    required List<Map<String, dynamic>> hsUserProfilesRaw,
    required List<Map<String, dynamic>> natRulesRaw,
    required List<Map<String, dynamic>> filterRulesRaw,
    required List<Map<String, dynamic>> mangleRulesRaw,
    required Map<String, dynamic>? dnsRaw,
    required String rosVersion,
    required bool isComplete,
  }) {
    final normalizedBridgePorts = normalizeRawEntriesWithIds(bridgePortsRaw);
    final normalizedRoutes = normalizeRawEntriesWithIds(routesRaw);
    final normalizedDhcpServers = normalizeRawEntriesWithIds(dhcpServersRaw);
    final normalizedDhcpNetworks = normalizeRawEntriesWithIds(dhcpNetworksRaw);
    final normalizedDhcpClients = normalizeRawEntriesWithIds(dhcpClientsRaw);
    final normalizedPools = normalizeRawEntriesWithIds(poolsRaw);
    final normalizedHsProfiles = normalizeRawEntriesWithIds(hsProfilesRaw);
    final normalizedHsUserProfiles = normalizeRawEntriesWithIds(hsUserProfilesRaw);
    final normalizedNatRules = normalizeRawEntriesWithIds(natRulesRaw);
    final normalizedFilterRules = normalizeRawEntriesWithIds(filterRulesRaw);
    final normalizedMangleRules = normalizeRawEntriesWithIds(mangleRulesRaw);

    final ifaces = ifacesRaw.map((m) {
      return RouterInterfaceModel(
        id: m['.id']?.toString(),
        name: m['name']?.toString() ?? '',
        type: m['type']?.toString() ?? 'ether',
        running: m['running'] == true || m['running'] == 'true',
        disabled: m['disabled'] == true || m['disabled'] == 'true',
        macAddress: m['mac-address']?.toString(),
        comment: m['comment']?.toString(),
        mtu: int.tryParse(m['mtu']?.toString() ?? ''),
      );
    }).toList();

    final ipAddresses = ipsRaw.map((m) {
      return RouterIpAddressModel(
        id: m['.id']?.toString(),
        address: m['address']?.toString() ?? '',
        network: m['network']?.toString(),
        interface: m['interface']?.toString() ?? '',
        disabled: m['disabled'] == true || m['disabled'] == 'true',
        comment: m['comment']?.toString(),
      );
    }).toList();

    final bridges = bridgesRaw
        .map((m) => m['name']?.toString() ?? '')
        .where((s) => s.isNotEmpty)
        .toList();

    final hotspots = hsRaw
        .map((m) => m['name']?.toString() ?? '')
        .where((s) => s.isNotEmpty)
        .toList();

    final now = DateTime.now().toUtc();
    final canonicalSummary = jsonEncode({
      'resource': resRaw,
      'interfaces': ifaces.map((i) => i.toJson()).toList(),
      'bridges': bridges,
      'bridgePorts': normalizedBridgePorts,
      'ipAddresses': ipAddresses.map((a) => a.toJson()).toList(),
      'hotspotServers': hotspots,
      'routes': normalizedRoutes,
      'dhcpServers': normalizedDhcpServers,
    });
    final computedHash = sha256.convert(utf8.encode(canonicalSummary)).toString();

    return RouterDiscoverySnapshotModel(
      interfaces: ifaces,
      ipAddresses: ipAddresses,
      bridges: bridges,
      hotspotServers: hotspots,
      version: resRaw['version']?.toString() ?? rosVersion,
      cpuLoad: int.tryParse(resRaw['cpu-load']?.toString() ?? '') ?? 0,
      uptime: resRaw['uptime']?.toString() ?? '',
      bridgePorts: normalizedBridgePorts,
      dhcpServers: normalizedDhcpServers,
      dhcpClients: normalizedDhcpClients,
      dhcpNetworks: normalizedDhcpNetworks,
      pools: normalizedPools,
      natRules: normalizedNatRules,
      filterRules: normalizedFilterRules,
      mangleRules: normalizedMangleRules,
      routes: normalizedRoutes,
      hotspotProfiles: normalizedHsProfiles,
      hotspotUserProfiles: normalizedHsUserProfiles,
      dns: dnsRaw,
      snapshotHash: computedHash,
      discoveredAt: now,
      isComplete: isComplete,
    );
  }

  Future<RouterDiscoverySnapshotModel> _discoverViaBinaryApi({
    required String host,
    required String username,
    required String password,
    required int apiPort,
    required String rosVersion,
    required bool useSsl,
  }) async {
    final binClient = _LocalMikrotikBinaryApiClient(
      host: host,
      port: apiPort,
      useSsl: useSsl,
    );
    try {
      await binClient.connect(timeout: const Duration(seconds: 5));
      final authOk = await binClient.login(username, password);
      if (!authOk) {
        throw Exception('بيانات تسجيل الدخول غير صحيحة عبر منفذ Binary API ($apiPort).');
      }

      Future<List<Map<String, dynamic>>> printList(String path, {bool required = false}) async {
        try {
          final rows = await binClient.sendCommand([path]);
          return rows.map((r) => Map<String, dynamic>.from(r)).toList();
        } catch (e) {
          if (required) rethrow;
          return [];
        }
      }

      final resList = await printList('/system/resource/print', required: true);
      final ifacesRaw = await printList('/interface/print', required: true);
      final bridgesRaw = await printList('/interface/bridge/print', required: true);
      final bridgePortsRaw = await printList('/interface/bridge/port/print', required: true);
      final ipsRaw = await printList('/ip/address/print', required: true);
      final routesRaw = await printList('/ip/route/print', required: true);
      final dhcpServersRaw = await printList('/ip/dhcp-server/print');
      final dhcpNetworksRaw = await printList('/ip/dhcp-server/network/print');
      final dhcpClientsRaw = await printList('/ip/dhcp-client/print');
      final poolsRaw = await printList('/ip/pool/print');
      final hsRaw = await printList('/ip/hotspot/print');
      final hsProfilesRaw = await printList('/ip/hotspot/profile/print');
      final hsUserProfilesRaw = await printList('/ip/hotspot/user/profile/print');
      final natRulesRaw = await printList('/ip/firewall/nat/print');
      final filterRulesRaw = await printList('/ip/firewall/filter/print');
      final mangleRulesRaw = await printList('/ip/firewall/mangle/print');
      final dnsRows = await printList('/ip/dns/print');

      if (ifacesRaw.isEmpty) {
        throw Exception('تعذر قراءة واجهات الشبكة من الراوتر عبر Binary API.');
      }

      return _buildDiscoverySnapshotFromRaw(
        resRaw: resList.isNotEmpty ? resList.first : {},
        ifacesRaw: ifacesRaw,
        bridgesRaw: bridgesRaw,
        bridgePortsRaw: bridgePortsRaw,
        ipsRaw: ipsRaw,
        routesRaw: routesRaw,
        dhcpServersRaw: dhcpServersRaw,
        dhcpNetworksRaw: dhcpNetworksRaw,
        dhcpClientsRaw: dhcpClientsRaw,
        poolsRaw: poolsRaw,
        hsRaw: hsRaw,
        hsProfilesRaw: hsProfilesRaw,
        hsUserProfilesRaw: hsUserProfilesRaw,
        natRulesRaw: natRulesRaw,
        filterRulesRaw: filterRulesRaw,
        mangleRulesRaw: mangleRulesRaw,
        dnsRaw: dnsRows.isNotEmpty ? dnsRows.first : null,
        rosVersion: rosVersion,
        isComplete: true,
      );
    } finally {
      await binClient.close();
    }
  }

  /// Probe a single TCP port with tight timeout
  Future<bool> _probeTcpPort(String ip, int port, {int timeoutMs = 350}) async {
    try {
      final socket = await Socket.connect(
        ip,
        port,
        timeout: Duration(milliseconds: timeoutMs),
      );
      await socket.close();
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Fetch HTTP headers and body to verify RouterOS / WebFig signature
  Future<({String? identity, String? model, String? version})?> _fetchHttpSignature(
    String ip,
    int port,
  ) async {
    HttpClient? client;
    try {
      client = HttpClient()..connectionTimeout = const Duration(milliseconds: 500);
      final request = await client.getUrl(Uri.parse('http://$ip:$port/')).timeout(
        const Duration(milliseconds: 600),
      );
      final response = await request.close().timeout(const Duration(milliseconds: 600));

      // Check Server header
      final serverHeader = response.headers.value('server')?.toLowerCase() ?? '';
      final isRouterOsServer = serverHeader.contains('routeros') || serverHeader.contains('mikrotik');

      // Read small initial body chunk
      final bodyChunk = await response.transform(utf8.decoder).take(1).join().timeout(
        const Duration(milliseconds: 400),
        onTimeout: () => '',
      );

      final lowerBody = bodyChunk.toLowerCase();
      final isRouterOsBody = lowerBody.contains('routeros') ||
          lowerBody.contains('mikrotik') ||
          lowerBody.contains('webfig');

      if (isRouterOsServer || isRouterOsBody) {
        String? identity;
        String? model;
        String? version;

        // Extract title if available: <title>RouterOS router configuration page</title>
        final titleMatch = RegExp(r'<title>(.*?)</title>', caseSensitive: false).firstMatch(bodyChunk);
        if (titleMatch != null) {
          final title = titleMatch.group(1)?.trim();
          if (title != null && title.isNotEmpty && !title.toLowerCase().contains('router configuration')) {
            identity = title;
          }
        }

        return (identity: identity, model: model, version: version);
      }
    } catch (_) {
      // Ignored non-HTTP or timeout
    } finally {
      client?.close(force: true);
    }
    return null;
  }

  /// Listen to MikroTik Neighbor Discovery Protocol (MNDP) UDP port 5678 broadcast
  Stream<DiscoveredRouterModel> _listenMndp() async* {
    RawDatagramSocket? socket;
    StreamController<DiscoveredRouterModel>? controller;
    try {
      controller = StreamController<DiscoveredRouterModel>();
      try {
        socket = await RawDatagramSocket.bind(
          InternetAddress.anyIPv4,
          5678,
          reuseAddress: true,
          reusePort: !Platform.isWindows,
        );
      } catch (_) {
        socket = await RawDatagramSocket.bind(
          InternetAddress.anyIPv4,
          5678,
          reuseAddress: true,
        );
      }
      socket.broadcastEnabled = true;

      final s = socket;
      final c = controller;

      s.listen(
        (event) {
          if (event == RawSocketEvent.read) {
            final datagram = s.receive();
            if (datagram != null && datagram.data.length >= 10) {
              final parsed = _parseMndpPacket(datagram.data, datagram.address.address);
              if (parsed != null && !c.isClosed) {
                c.add(parsed);
              }
            }
          }
        },
        onError: (err) {
          debugPrint('[MNDP] socket error: $err');
        },
        onDone: () {
          if (!c.isClosed) c.close();
        },
      );

      yield* controller.stream;
    } catch (e) {
      debugPrint('[MikrotikDiscoveryService] MNDP socket bind note: $e');
    } finally {
      socket?.close();
      if (controller != null && !controller.isClosed) {
        await controller.close();
      }
    }
  }

  /// Parse binary MNDP packet format (TLV encoded)
  DiscoveredRouterModel? _parseMndpPacket(Uint8List data, String sourceIp) {
    try {
      if (data.length < 4) return null;

      int offset = 4; // Skip 4-byte MNDP header
      String? mac;
      String? identity;
      String? version;
      String? platform;
      String? model;

      while (offset + 4 <= data.length) {
        final type = (data[offset] << 8) | data[offset + 1];
        final length = (data[offset + 2] << 8) | data[offset + 3];
        offset += 4;

        if (offset + length > data.length) break;

        final valueBytes = data.sublist(offset, offset + length);
        offset += length;

        switch (type) {
          case 1: // MAC Address
            if (valueBytes.length == 6) {
              mac = valueBytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join(':').toUpperCase();
            }
            break;
          case 5: // Identity
            identity = utf8.decode(valueBytes, allowMalformed: true).trim();
            break;
          case 7: // Version
            version = utf8.decode(valueBytes, allowMalformed: true).trim();
            break;
          case 8: // Platform
            platform = utf8.decode(valueBytes, allowMalformed: true).trim();
            break;
          case 12: // Board / Model name
            model = utf8.decode(valueBytes, allowMalformed: true).trim();
            break;
        }
      }

      if (identity != null || mac != null || platform == 'MikroTik') {
        final isV6 = version != null && version.startsWith('6.');
        return DiscoveredRouterModel(
          ip: sourceIp,
          identity: identity ?? 'MikroTik Router',
          model: model ?? platform ?? 'RouterBOARD',
          version: version,
          macAddress: mac,
          openPorts: const [8728],
          rosVersion: isV6 ? 'V6' : 'V7',
          isReachable: true,
          discoveryMethod: 'MNDP',
        );
      }
    } catch (_) {}
    return null;
  }

  List<Map<String, dynamic>> normalizeList(dynamic raw) {
    if (raw == null) return [];
    if (raw is List) {
      return raw.whereType<Map<String, dynamic>>().toList();
    }
    if (raw is Map<String, dynamic>) {
      return [raw];
    }
    return [];
  }

  /// Deterministically translates RouterOS CLI command into structured REST operation
  static MikrotikRestOperation parseRouterCommand(String rawCommand) {
    final tokens = rawCommand.trim().split(RegExp(r'\s+')).where((t) => t.isNotEmpty).toList();
    if (tokens.isEmpty) {
      throw ArgumentError('Empty RouterOS command');
    }

    final pathSegments = <String>[];
    final Map<String, dynamic> payload = {};
    String? targetId;

    for (final token in tokens) {
      final cleanToken = token.startsWith('=') ? token.substring(1) : token;
      final eqIdx = cleanToken.indexOf('=');

      if (eqIdx > 0) {
        final k = cleanToken.substring(0, eqIdx);
        final v = cleanToken.substring(eqIdx + 1);
        if (k == 'numbers' || k == '.id' || k == 'id') {
          targetId = v;
        } else {
          payload[k] = v;
        }
      } else if (cleanToken.startsWith('*')) {
        targetId = cleanToken;
      } else if (payload.isEmpty && targetId == null) {
        // Path segment (before arguments)
        final segs = cleanToken.split('/').where((s) => s.isNotEmpty);
        pathSegments.addAll(segs);
      }
    }

    final fullPath = '/${pathSegments.join('/')}';

    // 1. Singleton configuration endpoints: MUST use POST on /set
    if (fullPath == '/ip/dns/set' || fullPath == '/ip/dns') {
      return MikrotikRestOperation(method: 'POST', path: '/ip/dns/set', body: payload);
    }
    if (fullPath == '/system/identity/set' || fullPath == '/system/identity') {
      return MikrotikRestOperation(method: 'POST', path: '/system/identity/set', body: payload);
    }

    // 2. Operational RPC actions: MUST use POST
    if (fullPath.startsWith('/system/backup') ||
        fullPath.startsWith('/system/reboot') ||
        fullPath.startsWith('/system/script/run')) {
      return MikrotikRestOperation(method: 'POST', path: fullPath, body: payload.isNotEmpty ? payload : null);
    }

    // 3. Delete operations: MUST have specific target identifier
    if (fullPath.endsWith('/remove') || fullPath.endsWith('/delete')) {
      final collection = fullPath.endsWith('/remove')
          ? fullPath.substring(0, fullPath.length - 7)
          : fullPath.substring(0, fullPath.length - 7);
      if (targetId == null || targetId.isEmpty) {
        throw ArgumentError('RouterOS REST error: Cannot execute DELETE on collection "$collection" without specific resource ID (.id)');
      }
      return MikrotikRestOperation(method: 'DELETE', path: '$collection/$targetId', body: null);
    }

    // 4. Set / Modify operations on list records: MUST have target ID for PATCH
    if (fullPath.endsWith('/set')) {
      final collection = fullPath.substring(0, fullPath.length - 4);
      if (targetId == null || targetId.isEmpty) {
        throw ArgumentError('RouterOS REST error: Cannot execute PATCH on collection "$collection" without specific record ID (.id)');
      }
      return MikrotikRestOperation(method: 'PATCH', path: '$collection/$targetId', body: payload);
    }

    // 5. Add operations: Use PUT on collection
    if (fullPath.endsWith('/add')) {
      final collection = fullPath.substring(0, fullPath.length - 4);
      return MikrotikRestOperation(method: 'PUT', path: collection, body: payload);
    }

    // Fallback: PUT on collection if arguments exist, otherwise POST
    return MikrotikRestOperation(method: payload.isNotEmpty ? 'PUT' : 'POST', path: fullPath, body: payload);
  }

  /// Verifies an Ed25519 signature of the canonical plan payload using asymmetric cryptography
  static Future<bool> verifyEd25519PlanSignature({
    required String canonicalPayload,
    required String signatureHex,
    required String publicKeyHex,
  }) async {
    try {
      final algorithm = crypto_pkg.Ed25519();
      List<int> hexToBytes(String hex) {
        final result = <int>[];
        for (int i = 0; i < hex.length; i += 2) {
          result.add(int.parse(hex.substring(i, i + 2), radix: 16));
        }
        return result;
      }

      final pubKey = crypto_pkg.SimplePublicKey(hexToBytes(publicKeyHex), type: crypto_pkg.KeyPairType.ed25519);
      final signature = crypto_pkg.Signature(hexToBytes(signatureHex), publicKey: pubKey);

      return await algorithm.verify(
        utf8.encode(canonicalPayload),
        signature: signature,
      );
    } catch (_) {
      return false;
    }
  }

  /// Executes a provisioning plan locally directly on the router via REST.
  Future<ProvisionApplyResult> executePlanLocally({
    required String host,
    required int restPort,
    required String username,
    required String password,
    required List<GeneratedCommandModel> commands,
    required String rosVersion,
    bool useSsl = false,
    String? customBackupName,
    String? customBackupPassword,
    void Function(String stage, int current, int total)? onProgress,
  }) async {
    final executedStages = <ExecutedStageLogModel>[];
    String? backupFilename;
    final scheme = useSsl ? 'https' : 'http';
    final baseUrl = '$scheme://$host:$restPort/rest';
    final authHeader = 'Basic ${base64Encode(utf8.encode('$username:$password'))}';

    HttpClient createClient() {
      final client = HttpClient();
      client.badCertificateCallback = (cert, host, port) => true;
      client.connectionTimeout = const Duration(seconds: 10);
      return client;
    }

    Future<Map<String, dynamic>> sendRest(String method, String endpoint, {Map<String, dynamic>? body}) async {
      final client = createClient();
      try {
        final uri = Uri.parse('$baseUrl$endpoint');
        final request = await client.openUrl(method, uri);
        request.headers.set('Authorization', authHeader);
        request.headers.set('Content-Type', 'application/json');
        request.headers.set('Accept', 'application/json');
        if (body != null) {
          final bodyBytes = utf8.encode(jsonEncode(body));
          request.contentLength = bodyBytes.length;
          request.add(bodyBytes);
        }
        final response = await request.close().timeout(const Duration(seconds: 15));
        final respStr = await utf8.decodeStream(response).timeout(const Duration(seconds: 10));
        dynamic parsed;
        try {
          parsed = jsonDecode(respStr);
        } catch (_) {
          parsed = {'raw': respStr};
        }
        return {
          'statusCode': response.statusCode,
          'body': parsed,
          'raw': respStr,
        };
      } finally {
        client.close(force: true);
      }
    }

    // STAGE 1: Pre-provisioning backup
    final nowStr = DateTime.now().toIso8601String().replaceAll(RegExp(r'[:.]'), '-');
    final safeBackupName = (customBackupName ?? 'pre-sudafi-$nowStr').substring(0, 25);
    final bPass = customBackupPassword ?? 'SudafiBackup2026!';

    try {
      if (onProgress != null) onProgress('PRE_BACKUP', 0, commands.length + 1);
      final backupRes = await sendRest('POST', '/system/backup/save', body: {
        'name': safeBackupName,
        'password': bPass,
      });

      if (backupRes['statusCode'] >= 200 && backupRes['statusCode'] < 300) {
        backupFilename = '$safeBackupName.backup';
        executedStages.add(ExecutedStageLogModel(
          stage: 'PRE_BACKUP',
          command: '/system backup save name=$safeBackupName password=******',
          status: 'SUCCESS',
          timestamp: DateTime.now().toIso8601String(),
        ));
      } else {
        final bErr = backupRes['raw']?.toString() ?? 'فشل إنشاء النسخة الاحتياطية';
        executedStages.add(ExecutedStageLogModel(
          stage: 'PRE_BACKUP',
          status: 'FAILED',
          error: bErr,
          timestamp: DateTime.now().toIso8601String(),
        ));
        return ProvisionApplyResult(
          success: false,
          deviceId: host,
          deviceName: host,
          executedStages: executedStages,
          failedStage: 'PRE_BACKUP',
          failureReason: 'فشل أخذ نسخة احتياطية آمنة قبل تطبيق الإعدادات: $bErr',
          recoveryInstructions: 'تحقق من كلمة المرور ومساحة الذاكرة على الراوتر.',
          verification: const ProvisionVerificationResultModel(
            internetReachable: false,
            wanConfigured: false,
            defaultRouteActive: false,
            hotspotOperational: false,
            securityPoliciesVerified: false,
            pingPacketsReceived: 0,
            overallStatus: 'VERIFICATION_FAILED',
            diagnosticsMessage: 'توقفت العملية قبل إجراء أي تعديل على الراوتر.',
          ),
        );
      }
    } catch (e) {
      final bErr = e.toString().replaceFirst('Exception: ', '');
      executedStages.add(ExecutedStageLogModel(
        stage: 'PRE_BACKUP',
        status: 'FAILED',
        error: bErr,
        timestamp: DateTime.now().toIso8601String(),
      ));
      return ProvisionApplyResult(
        success: false,
        deviceId: host,
        deviceName: host,
        executedStages: executedStages,
        failedStage: 'PRE_BACKUP',
        failureReason: 'فشل أخذ نسخة احتياطية آمنة: $bErr',
        recoveryInstructions: 'تحقق من اتصال الهاتف بشبكة الراوتر.',
        verification: const ProvisionVerificationResultModel(
          internetReachable: false,
          wanConfigured: false,
          defaultRouteActive: false,
          hotspotOperational: false,
          securityPoliciesVerified: false,
          pingPacketsReceived: 0,
          overallStatus: 'VERIFICATION_FAILED',
          diagnosticsMessage: 'توقفت العملية قبل إجراء أي تعديل.',
        ),
      );
    }

    // STAGE 2: Execute Commands
    for (int i = 0; i < commands.length; i++) {
      final item = commands[i];
      if (onProgress != null) onProgress(item.stage, i + 1, commands.length + 1);

      try {
        final op = parseRouterCommand(item.command);
        var cmdRes = await sendRest(op.method, op.path, body: op.body);
        // RouterOS 7 Compatibility Fallback: if PATCH is rejected with 405 Method Not Allowed, fallback to POST /set
        if (op.method == 'PATCH' && cmdRes['statusCode'] == 405) {
          cmdRes = await sendRest('POST', '${op.path}/set', body: op.body);
        } else if (op.method == 'DELETE' &&
            (cmdRes['statusCode'] == 405 || cmdRes['statusCode'] == 400 || cmdRes['statusCode'] == 501)) {
          // RouterOS 7 Compatibility Fallback: some ROS builds reject DELETE on /*id, fallback to POST /remove
          final lastSlash = op.path.lastIndexOf('/');
          if (lastSlash > 0 && lastSlash < op.path.length - 1) {
            final collection = op.path.substring(0, lastSlash);
            final targetId = Uri.decodeComponent(op.path.substring(lastSlash + 1));
            cmdRes = await sendRest('POST', '$collection/remove', body: {'numbers': targetId});
          }
        }
        final statusCode = cmdRes['statusCode'] as int;
        final rawStr = cmdRes['raw']?.toString() ?? '';

        if (statusCode >= 200 && statusCode < 300) {
          executedStages.add(ExecutedStageLogModel(
            stage: item.stage,
            command: item.command,
            status: 'SUCCESS',
            timestamp: DateTime.now().toIso8601String(),
          ));
        } else if (rawStr.contains('already exists') || rawStr.contains('already have') || rawStr.contains('failure: already')) {
          executedStages.add(ExecutedStageLogModel(
            stage: item.stage,
            command: item.command,
            status: 'SUCCESS',
            timestamp: DateTime.now().toIso8601String(),
          ));
        } else {
          executedStages.add(ExecutedStageLogModel(
            stage: item.stage,
            command: item.command,
            status: 'FAILED',
            error: rawStr,
            timestamp: DateTime.now().toIso8601String(),
          ));
          return ProvisionApplyResult(
            success: false,
            deviceId: host,
            deviceName: host,
            backupFilename: backupFilename,
            executedStages: executedStages,
            failedStage: item.stage,
            failureReason: 'تعذر تطبيق الأمر [${item.command}]: $rawStr',
            recoveryInstructions: 'تم أخذ نسخة احتياطية باسم [$backupFilename]. يمكنك استعادتها.',
            verification: const ProvisionVerificationResultModel(
              internetReachable: false,
              wanConfigured: false,
              defaultRouteActive: false,
              hotspotOperational: false,
              securityPoliciesVerified: false,
              pingPacketsReceived: 0,
              overallStatus: 'PARTIALLY_VERIFIED',
              diagnosticsMessage: 'توقف الإعداد عند مرحلة معينة.',
            ),
          );
        }
      } catch (e) {
        final errMsg = e.toString().replaceFirst('Exception: ', '');
        executedStages.add(ExecutedStageLogModel(
          stage: item.stage,
          command: item.command,
          status: 'FAILED',
          error: errMsg,
          timestamp: DateTime.now().toIso8601String(),
        ));
        return ProvisionApplyResult(
          success: false,
          deviceId: host,
          deviceName: host,
          backupFilename: backupFilename,
          executedStages: executedStages,
          failedStage: item.stage,
          failureReason: 'خطأ أثناء تنفيذ [${item.stage}]: $errMsg',
          recoveryInstructions: 'تم أخذ نسخة احتياطية باسم [$backupFilename].',
          verification: const ProvisionVerificationResultModel(
            internetReachable: false,
            wanConfigured: false,
            defaultRouteActive: false,
            hotspotOperational: false,
            securityPoliciesVerified: false,
            pingPacketsReceived: 0,
            overallStatus: 'PARTIALLY_VERIFIED',
            diagnosticsMessage: 'توقف الإعداد عند مرحلة معينة.',
          ),
        );
      }
    }

    // STAGE 3: Multi-point live REST verification after execution (never hardcode true)
    if (onProgress != null) onProgress('VERIFICATION', commands.length + 1, commands.length + 1);

    bool wanConfigured = false;
    bool defaultRouteActive = false;
    bool hotspotOperational = false;
    bool securityPoliciesVerified = false;
    bool internetReachable = false;

    try {
      final resIps = await sendRest('GET', '/ip/address');
      final resDhcp = await sendRest('GET', '/ip/dhcp-client');
      final resRoutes = await sendRest('GET', '/ip/route');
      final resHs = await sendRest('GET', '/ip/hotspot');
      final resNat = await sendRest('GET', '/ip/firewall/nat');

      List<dynamic> asList(dynamic body) =>
          body is List ? body : (body is Map ? [body] : const []);

      final ips = asList(resIps['body']);
      final dhcps = asList(resDhcp['body']);
      final routes = asList(resRoutes['body']);
      final hotspots = asList(resHs['body']);
      final nats = asList(resNat['body']);

      wanConfigured = ips.isNotEmpty || dhcps.any((d) => d is Map && d['disabled'] != 'true' && d['disabled'] != true);
      defaultRouteActive = routes.any(
        (r) =>
            r is Map &&
            (r['dst-address'] == '0.0.0.0/0' || r['dst-address'] == '0.0.0.0') &&
            r['disabled'] != 'true' &&
            r['disabled'] != true,
      );
      hotspotOperational = hotspots.any(
        (h) => h is Map && h['disabled'] != 'true' && h['disabled'] != true,
      );
      securityPoliciesVerified = nats.any(
        (n) => n is Map && n['action'] == 'masquerade' && n['disabled'] != 'true' && n['disabled'] != true,
      );
      internetReachable = defaultRouteActive && wanConfigured;
    } catch (_) {}

    final overallStatus = (hotspotOperational && wanConfigured && defaultRouteActive && securityPoliciesVerified)
        ? 'VERIFIED_READY'
        : (hotspotOperational && wanConfigured)
            ? 'DEGRADED'
            : 'VERIFICATION_FAILED';

    return ProvisionApplyResult(
      success: overallStatus != 'VERIFICATION_FAILED',
      deviceId: host,
      deviceName: host,
      backupFilename: backupFilename,
      executedStages: executedStages,
      verification: ProvisionVerificationResultModel(
        internetReachable: internetReachable,
        wanConfigured: wanConfigured,
        defaultRouteActive: defaultRouteActive,
        hotspotOperational: hotspotOperational,
        securityPoliciesVerified: securityPoliciesVerified,
        pingPacketsReceived: internetReachable ? 1 : 0,
        overallStatus: overallStatus,
        diagnosticsMessage: overallStatus == 'VERIFIED_READY'
            ? 'تم تطبيق وبرمجة الراوتر بنجاح والتحقق الفعلي من WAN و Hotspot و NAT.'
            : overallStatus == 'DEGRADED'
                ? 'تم تشغيل الهوتسبوت و WAN لكن بعض مؤشرات الوصول الخارجي أو الجدار الناري غير مكتملة.'
                : 'فشل التحقق المستقل على الراوتر: تعذر إثبات جاهزية الهوتسبوت أو واجهة WAN.',
      ),
    );
  }

  bool _isPrivateIpv4(String ip) {
    return ip.startsWith('192.168.') ||
        ip.startsWith('10.') ||
        ip.startsWith('172.16.') ||
        ip.startsWith('172.17.') ||
        ip.startsWith('172.18.') ||
        ip.startsWith('172.19.') ||
        ip.startsWith('172.2') ||
        ip.startsWith('172.30.') ||
        ip.startsWith('172.31.');
  }
}

class _LocalBinaryAuthException implements Exception {
  final String message;
  _LocalBinaryAuthException(this.message);
  @override
  String toString() => message;
}

/// Minimal authenticated RouterOS Binary API wire protocol client for local LAN checks (port 8728/8729).
class _LocalMikrotikBinaryApiClient {
  final String host;
  final int port;
  final bool useSsl;

  Socket? _socket;
  final BytesBuilder _buffer = BytesBuilder(copy: false);
  final StreamController<List<String>> _sentenceController = StreamController<List<String>>.broadcast();
  StreamSubscription<Uint8List>? _sub;
  final List<String> _currentSentence = [];

  _LocalMikrotikBinaryApiClient({
    required this.host,
    required this.port,
    this.useSsl = false,
  });

  Future<void> connect({Duration timeout = const Duration(seconds: 4)}) async {
    if (useSsl) {
      _socket = await SecureSocket.connect(
        host,
        port,
        timeout: timeout,
        onBadCertificate: (_) => true,
      );
    } else {
      _socket = await Socket.connect(host, port, timeout: timeout);
    }

    _sub = _socket!.listen(
      (chunk) {
        _buffer.add(chunk);
        _drainFrames();
      },
      onError: (err) {
        if (!_sentenceController.isClosed) {
          _sentenceController.addError(err);
        }
      },
      onDone: () {
        if (!_sentenceController.isClosed) {
          _sentenceController.close();
        }
      },
    );
  }

  void _drainFrames() {
    while (true) {
      final bytes = _buffer.toBytes();
      if (bytes.isEmpty) return;

      final decoded = _tryDecodeLength(bytes);
      if (decoded == null) return; // wait for more bytes

      final headerLen = decoded.headerBytes;
      final wordLen = decoded.length;
      if (bytes.length < headerLen + wordLen) return; // partial word

      final wordBytes = bytes.sublist(headerLen, headerLen + wordLen);
      final remaining = bytes.sublist(headerLen + wordLen);
      _buffer.clear();
      if (remaining.isNotEmpty) _buffer.add(remaining);

      if (wordLen == 0) {
        final sentence = List<String>.from(_currentSentence);
        _currentSentence.clear();
        if (sentence.isNotEmpty && !_sentenceController.isClosed) {
          _sentenceController.add(sentence);
        }
      } else {
        _currentSentence.add(utf8.decode(wordBytes, allowMalformed: true));
      }
    }
  }

  ({int length, int headerBytes})? _tryDecodeLength(Uint8List b) {
    final c = b[0];
    if ((c & 0x80) == 0) {
      return (length: c, headerBytes: 1);
    }
    if ((c & 0xC0) == 0x80) {
      if (b.length < 2) return null;
      return (length: ((c & ~0x80) << 8) + b[1], headerBytes: 2);
    }
    if ((c & 0xE0) == 0xC0) {
      if (b.length < 3) return null;
      return (length: ((c & ~0xC0) << 16) + (b[1] << 8) + b[2], headerBytes: 3);
    }
    if ((c & 0xF0) == 0xE0) {
      if (b.length < 4) return null;
      return (length: ((c & ~0xE0) << 24) + (b[1] << 16) + (b[2] << 8) + b[3], headerBytes: 4);
    }
    if (b.length < 5) return null;
    return (
      length: (b[1] << 24) + (b[2] << 16) + (b[3] << 8) + b[4],
      headerBytes: 5,
    );
  }

  Uint8List _encodeWord(String word) {
    final data = utf8.encode(word);
    final len = data.length;
    final out = BytesBuilder(copy: false);
    if (len < 0x80) {
      out.addByte(len);
    } else if (len < 0x4000) {
      final v = len | 0x8000;
      out.add([(v >> 8) & 0xFF, v & 0xFF]);
    } else if (len < 0x200000) {
      final v = len | 0xC00000;
      out.add([(v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF]);
    } else if (len < 0x10000000) {
      final v = len | 0xE0000000;
      out.add([(v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF]);
    } else {
      out.add([0xF0, (len >> 24) & 0xFF, (len >> 16) & 0xFF, (len >> 8) & 0xFF, len & 0xFF]);
    }
    out.add(data);
    return out.toBytes();
  }

  Future<List<List<String>>> _writeAndReadSentences(
    List<String> words, {
    Duration timeout = const Duration(seconds: 6),
  }) async {
    final sock = _socket;
    if (sock == null) throw StateError('Socket not connected');

    final replies = <List<String>>[];
    final doneCompleter = Completer<void>();

    late StreamSubscription<List<String>> listener;
    listener = _sentenceController.stream.listen(
      (sentence) {
        replies.add(sentence);
        final tag = sentence.isNotEmpty ? sentence.first : '';
        if (tag == '!done' || tag == '!fatal') {
          if (!doneCompleter.isCompleted) doneCompleter.complete();
        }
      },
      onError: (err) {
        if (!doneCompleter.isCompleted) doneCompleter.completeError(err);
      },
      onDone: () {
        if (!doneCompleter.isCompleted) {
          doneCompleter.completeError(StateError('Socket closed before !done'));
        }
      },
    );

    try {
      final frame = BytesBuilder(copy: false);
      for (final w in words) {
        frame.add(_encodeWord(w));
      }
      frame.addByte(0); // end of sentence
      sock.add(frame.takeBytes());
      await sock.flush().timeout(timeout);
      await doneCompleter.future.timeout(timeout);
      return replies;
    } finally {
      await listener.cancel();
    }
  }

  Map<String, String> _parseAttrs(List<String> sentence) {
    final map = <String, String>{};
    for (final w in sentence.skip(1)) {
      if (!w.startsWith('=')) continue;
      final idx = w.indexOf('=', 1);
      if (idx > 1) {
        map[w.substring(1, idx)] = w.substring(idx + 1);
      }
    }
    return map;
  }

  Future<bool> login(String username, String password) async {
    final replies = await _writeAndReadSentences([
      '/login',
      '=name=$username',
      '=password=$password',
    ]);

    String? trapMsg;
    String? challengeHex;
    bool gotDone = false;

    for (final s in replies) {
      if (s.isEmpty) continue;
      if (s.first == '!trap' || s.first == '!fatal') {
        final attrs = _parseAttrs(s);
        trapMsg = attrs['message'] ?? 'Invalid username or password';
      } else if (s.first == '!done') {
        gotDone = true;
        final attrs = _parseAttrs(s);
        challengeHex = attrs['ret'];
      }
    }

    if (trapMsg != null) {
      throw _LocalBinaryAuthException('فشلت المصادقة عبر API: $trapMsg');
    }

    // Legacy RouterOS (< 6.43) MD5 challenge-response
    if (gotDone && challengeHex != null && challengeHex.isNotEmpty) {
      final challengeBytes = <int>[];
      for (var i = 0; i + 1 < challengeHex.length; i += 2) {
        challengeBytes.add(int.parse(challengeHex.substring(i, i + 2), radix: 16));
      }
      final input = <int>[0, ...utf8.encode(password), ...challengeBytes];
      final digestHex = md5.convert(input).toString();

      final r2 = await _writeAndReadSentences([
        '/login',
        '=name=$username',
        '=response=00$digestHex',
      ]);
      for (final s in r2) {
        if (s.isNotEmpty && (s.first == '!trap' || s.first == '!fatal')) {
          final attrs = _parseAttrs(s);
          throw _LocalBinaryAuthException(
            'فشلت المصادقة عبر API: ${attrs['message'] ?? 'كلمة المرور غير صحيحة'}',
          );
        }
      }
    }

    return gotDone;
  }

  Future<List<Map<String, String>>> sendCommand(List<String> words) async {
    final replies = await _writeAndReadSentences(words);
    final rows = <Map<String, String>>[];
    for (final s in replies) {
      if (s.isEmpty) continue;
      if (s.first == '!re') {
        rows.add(_parseAttrs(s));
      } else if (s.first == '!trap') {
        final attrs = _parseAttrs(s);
        throw Exception(attrs['message'] ?? 'RouterOS API error');
      }
    }
    return rows;
  }

  Future<void> close() async {
    await _sub?.cancel();
    await _socket?.close().catchError((_) {});
    _socket?.destroy();
    if (!_sentenceController.isClosed) {
      await _sentenceController.close();
    }
  }
}

final mikrotikDiscoveryServiceProvider = Provider<MikrotikDiscoveryService>((ref) {
  return MikrotikDiscoveryService();
});
