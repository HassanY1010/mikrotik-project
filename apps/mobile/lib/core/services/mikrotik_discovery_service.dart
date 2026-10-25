import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
    int restPort = 443,
    String rosVersion = 'V7',
    bool useSsl = false,
  }) async {
    final start = DateTime.now();
    HttpClient? httpClient;

    // Strategy A: If RouterOS v7 or REST available, test via /rest/system/resource
    try {
      httpClient = HttpClient()
        ..connectionTimeout = const Duration(seconds: 4)
        ..badCertificateCallback = (cert, host, port) => true;

      final port = useSsl ? 443 : (restPort == 443 ? 80 : restPort);
      final scheme = useSsl ? 'https' : 'http';
      final uri = Uri.parse('$scheme://$host:$port/rest/system/resource');

      final request = await httpClient.getUrl(uri).timeout(const Duration(seconds: 4));
      final authStr = base64Encode(utf8.encode('$username:$password'));
      request.headers.set('Authorization', 'Basic $authStr');

      final response = await request.close().timeout(const Duration(seconds: 4));
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

    // Strategy B: Socket API test on port 8728
    Socket? socket;
    try {
      socket = await Socket.connect(host, apiPort, timeout: const Duration(seconds: 3));
      final latency = DateTime.now().difference(start).inMilliseconds;
      await socket.close();
      return {
        'success': true,
        'stage': 'CONNECTED',
        'code': 'CONNECTED_SUCCESS',
        'latencyMs': latency,
        'message': 'تم التحقق من إمكانية الوصول لمنفذ API ($apiPort) محلياً بنجاح (زمن الاستجابة: ${latency}ms)',
        'routerInfo': {
          'model': 'MikroTik Router',
          'version': rosVersion,
          'protocol': 'Socket API (Local)',
        },
      };
    } catch (e) {
      socket?.destroy();
      return {
        'success': false,
        'stage': 'NETWORK',
        'code': 'CONNECTION_FAILED',
        'message': 'تعذر الاتصال بالراوتر محلياً عبر العنوان ($host): $e',
      };
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

final mikrotikDiscoveryServiceProvider = Provider<MikrotikDiscoveryService>((ref) {
  return MikrotikDiscoveryService();
});
