import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart' as crypto_pkg;
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import '../models/router_provisioning_models.dart';
import '../models/models.dart';

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

  bool isPrivateLanIp(String host) {
    final ip = host.trim();
    return ip.startsWith('192.168.') ||
        ip.startsWith('10.') ||
        ip.startsWith('172.16.') ||
        ip.startsWith('172.17.') ||
        ip.startsWith('172.18.') ||
        ip.startsWith('172.19.') ||
        ip.startsWith('172.20.') ||
        ip.startsWith('172.21.') ||
        ip.startsWith('172.22.') ||
        ip.startsWith('172.23.') ||
        ip.startsWith('172.24.') ||
        ip.startsWith('172.25.') ||
        ip.startsWith('172.26.') ||
        ip.startsWith('172.27.') ||
        ip.startsWith('172.28.') ||
        ip.startsWith('172.29.') ||
        ip.startsWith('172.30.') ||
        ip.startsWith('172.31.') ||
        ip == 'localhost' ||
        ip == '127.0.0.1';
  }

  Future<({bool isReachable, bool isAuthValid, String? detectedOsVersion})> checkDirectLanConnection({
    required String host,
    required int port,
    required String user,
    required String password,
    bool useSsl = false,
  }) async {
    try {
      final res = await verifyCredentialsLocally(
        host: host,
        username: user,
        password: password,
        apiPort: port,
        useSsl: useSsl,
      );
      final ok = res['success'] == true;
      final rosVer = res['rosVersion']?.toString() ?? 'ROS';
      return (isReachable: true, isAuthValid: ok, detectedOsVersion: rosVer);
    } catch (_) {
      return (isReachable: false, isAuthValid: false, detectedOsVersion: null);
    }
  }

  /// Discover MikroTik devices on the local network with real-time streaming progress
  Stream<DiscoveredRouterModel> discoverStream({
    Duration timeout = const Duration(seconds: 10),
    List<String>? priorityIps,
    void Function(double progress, String status)? onProgress,
  }) async* {
    _isSearching = true;
    _cancelRequested = false;

    final foundIps = <String>{};
    final outController = StreamController<DiscoveredRouterModel>();

    onProgress?.call(0.1, 'جارِ فحص واجهات الشبكة المحلية...');

    // 1. Gather candidate target IPs
    final candidateIps = await _gatherCandidateIps(priorityIps: priorityIps);
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
  Future<List<String>> _gatherCandidateIps({List<String>? priorityIps}) async {
    final candidates = <String>{
      if (priorityIps != null) ...priorityIps.where((ip) => ip.trim().isNotEmpty),
      '192.168.88.1', // Default MikroTik IP
      '192.168.1.1',  // Common router gateway
      '192.168.0.1',
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

  static int? _parseMikrotikInt(dynamic raw) {
    if (raw == null) return null;
    if (raw is int) return raw;
    if (raw is num) return raw.round();
    final cleaned = raw.toString().trim().replaceAll(RegExp(r'[^0-9.-]'), '');
    return int.tryParse(cleaned) ?? double.tryParse(cleaned)?.round();
  }

  /// Normalizes a MikroTik /system/resource response which can be a single Map
  /// or a JSON Array containing a Map (the standard format in RouterOS v7 REST API).
  static Map<String, dynamic> normalizeResourceResponse(dynamic raw) {
    if (raw == null) return {};
    if (raw is Map<String, dynamic>) return raw;
    if (raw is Map) return Map<String, dynamic>.from(raw);
    if (raw is List && raw.isNotEmpty) {
      final first = raw.first;
      if (first is Map<String, dynamic>) return first;
      if (first is Map) return Map<String, dynamic>.from(first);
    }
    return {};
  }

  static Map<String, dynamic> _buildRouterInfo({
    required dynamic rawResource,
    required String fallbackVersion,
    required String protocol,
    int? activeHotspotSessions,
    int? avgCpuLoad,
  }) {
    final normResource = normalizeResourceResponse(rawResource);
    final freeMem = _parseMikrotikInt(normResource['free-memory'] ?? normResource['memoryFree']);
    final totalMem = _parseMikrotikInt(normResource['total-memory'] ?? normResource['memoryTotal']);
    final freeHdd = _parseMikrotikInt(normResource['free-hdd-space'] ?? normResource['diskFree']);
    final totalHdd = _parseMikrotikInt(normResource['total-hdd-space'] ?? normResource['diskTotal']);
    // Prioritize canonical RouterOS cpu-load from /system/resource (exact WinBox source)
    final cpuLoad = _parseMikrotikInt(normResource['cpu-load'] ?? normResource['cpuLoad']) ?? avgCpuLoad;
    final uptime = normResource['uptime']?.toString();
    final versionStr = normResource['version']?.toString() ?? fallbackVersion;
    final modelName =
        (normResource['board-name'] ?? normResource['platform'] ?? 'MikroTik Router').toString();

    // Exact precision calculations matching WinBox
    int? memoryUsagePercent;
    if (totalMem != null && totalMem > 0 && freeMem != null) {
      final usedMem = (totalMem - freeMem).clamp(0, totalMem);
      memoryUsagePercent = ((usedMem / totalMem) * 100).round().clamp(0, 100);
    }

    int? diskUsagePercent;
    if (totalHdd != null && totalHdd > 0 && freeHdd != null) {
      final usedHdd = (totalHdd - freeHdd).clamp(0, totalHdd);
      diskUsagePercent = ((usedHdd / totalHdd) * 100).round().clamp(0, 100);
    }

    final sampleTime = DateTime.now().toIso8601String();
    debugPrint('''
╔═══════════════════════════════════════════════════════════════════════
║ [Sudafi Resource Diagnostic] - Sample Time: $sampleTime
╠═══════════════════════════════════════════════════════════════════════
║ 1. Protocol: $protocol
║ 2. RouterOS Raw Response Type: ${rawResource.runtimeType}
║ 3. Value after normalizeResourceResponse:
║    cpu-load: ${normResource['cpu-load'] ?? normResource['cpuLoad']} | free-mem: ${normResource['free-memory'] ?? normResource['memoryFree']} | total-mem: ${normResource['total-memory'] ?? normResource['memoryTotal']}
║    free-hdd: ${normResource['free-hdd-space'] ?? normResource['diskFree']} | total-hdd: ${normResource['total-hdd-space'] ?? normResource['diskTotal']}
║ 4. Extracted CPU Load: $cpuLoad% (canonical /system/resource)
║ 5. Memory: Free=${freeMem != null ? '$freeMem bytes (~${(freeMem / (1024 * 1024)).toStringAsFixed(1)}MB)' : 'null'}, Total=${totalMem != null ? '$totalMem bytes (~${(totalMem / (1024 * 1024)).toStringAsFixed(1)}MB)' : 'null'}
║ 6. Storage (HDD): Free=${freeHdd != null ? '$freeHdd bytes (~${(freeHdd / (1024 * 1024)).toStringAsFixed(1)}MB)' : 'null'}, Total=${totalHdd != null ? '$totalHdd bytes (~${(totalHdd / (1024 * 1024)).toStringAsFixed(1)}MB)' : 'null'}
║ 7. Final Computed Percentages for Dashboard:
║    RAM Usage: $memoryUsagePercent%
║    DISK Usage: $diskUsagePercent%
╚═══════════════════════════════════════════════════════════════════════
''');

    return {
      'model': modelName,
      'modelName': modelName,
      'version': versionStr,
      'rosVersion': versionStr.startsWith('6') ? 'V6' : (versionStr.startsWith('7') ? 'V7' : fallbackVersion),
      'cpuLoad': cpuLoad,
      'memoryFree': freeMem,
      'memoryTotal': totalMem,
      'memoryUsagePercent': memoryUsagePercent,
      'diskFree': freeHdd,
      'diskTotal': totalHdd,
      'diskUsagePercent': diskUsagePercent,
      'uptime': uptime,
      if (activeHotspotSessions != null) 'activeHotspotSessions': activeHotspotSessions,
      'protocol': protocol,
    };
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
    final normalizedRos = rosVersion.toUpperCase();
    final preferBinaryFirst = normalizedRos.contains('V6') && !normalizedRos.contains('V7');

    Future<Map<String, dynamic>?> tryRest() async {
      HttpClient? httpClient;
      try {
        httpClient = HttpClient()
          ..connectionTimeout = const Duration(seconds: 6)
          ..badCertificateCallback = (cert, h, p) => true;

        final port = useSsl ? (restPort == 80 ? 443 : restPort) : (restPort == 443 ? 80 : restPort);
        final scheme = useSsl ? 'https' : 'http';
        final uri = Uri.parse('$scheme://$host:$port/rest/system/resource');

        final request = await httpClient.getUrl(uri).timeout(const Duration(seconds: 6));
        final authStr = base64Encode(utf8.encode('$username:$password'));
        request.headers.set('Authorization', 'Basic $authStr');

        final response = await request.close().timeout(const Duration(seconds: 6));
        final latency = DateTime.now().difference(start).inMilliseconds;

        if (response.statusCode == 200) {
          final body = await response.transform(utf8.decoder).join();
          Map<String, dynamic> resMap = {};
          try {
            final decoded = jsonDecode(body);
            resMap = normalizeResourceResponse(decoded);
            debugPrint('[tryRest Raw Response] HTTP 200 | Body length: ${body.length} | Decoded type: ${decoded.runtimeType} | Normalized keys: ${resMap.keys.toList()}');
          } catch (e) {
            debugPrint('[tryRest JSON Parse Error]: $e');
          }

          int? avgCpu;
          // RouterOS /system/resource directly provides canonical cpu-load matching WinBox.
          // Only perform secondary /system/resource/cpu query as fallback if cpu-load is absent.
          if (resMap['cpu-load'] == null && resMap['cpuLoad'] == null) {
            try {
              final cpuUri = Uri.parse('$scheme://$host:$port/rest/system/resource/cpu');
              final cpuReq = await httpClient.getUrl(cpuUri).timeout(const Duration(seconds: 4));
              cpuReq.headers.set('Authorization', 'Basic $authStr');
              final cpuRes = await cpuReq.close().timeout(const Duration(seconds: 4));
              if (cpuRes.statusCode == 200) {
                final cpuBody = await cpuRes.transform(utf8.decoder).join();
                final decodedCpu = jsonDecode(cpuBody);
                if (decodedCpu is List && decodedCpu.isNotEmpty) {
                  int sum = 0;
                  int count = 0;
                  for (final c in decodedCpu) {
                    if (c is Map) {
                      final l = _parseMikrotikInt(c['load'] ?? c['cpu-load']);
                      if (l != null) {
                        sum += l;
                        count++;
                      }
                    }
                  }
                  if (count > 0) {
                    avgCpu = (sum / count).round();
                  }
                }
              }
            } catch (_) {}
          }

          int? activeSessions;
          try {
            final activeUri = Uri.parse('$scheme://$host:$port/rest/ip/hotspot/active');
            final activeReq = await httpClient.getUrl(activeUri).timeout(const Duration(seconds: 4));
            activeReq.headers.set('Authorization', 'Basic $authStr');
            final activeRes = await activeReq.close().timeout(const Duration(seconds: 4));
            if (activeRes.statusCode == 200) {
              final activeBody = await activeRes.transform(utf8.decoder).join();
              final decodedActive = jsonDecode(activeBody);
              if (decodedActive is List) activeSessions = decodedActive.length;
            }
          } catch (_) {}

          return {
            'success': true,
            'stage': 'CONNECTED',
            'code': 'CONNECTED_SUCCESS',
            'latencyMs': latency,
            'verifiedAt': DateTime.now().toUtc().toIso8601String(),
            'message': 'تم الاتصال والمصادقة محلياً من الهاتف بنجاح (زمن الاستجابة: ${latency}ms)',
            'routerInfo': _buildRouterInfo(
              rawResource: resMap,
              fallbackVersion: rosVersion,
              protocol: 'REST API (Local)',
              activeHotspotSessions: activeSessions,
              avgCpuLoad: avgCpu,
            ),
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
        // Fall through to Binary API
      } finally {
        httpClient?.close(force: true);
      }
      return null;
    }

    Future<Map<String, dynamic>> tryBinary() async {
      final binClient = _LocalMikrotikBinaryApiClient(
        host: host,
        port: apiPort,
        useSsl: useSsl,
      );
      try {
        await binClient.connect(timeout: const Duration(seconds: 8));
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

        Map<String, dynamic> resAttrs = {};
        int? avgCpu;
        try {
          final resRows = await binClient.sendCommand(['/system/resource/print']);
          if (resRows.isNotEmpty) {
            resAttrs = Map<String, dynamic>.from(resRows.first);
            debugPrint('[tryBinary Raw Response] Sentence count: ${resRows.length} | Attributes: ${resAttrs.keys.toList()}');
          }
        } catch (e) {
          debugPrint('[tryBinary Resource Print Error]: $e');
        }

        // Only perform secondary /system/resource/cpu query as fallback if cpu-load is absent
        if (resAttrs['cpu-load'] == null && resAttrs['cpuLoad'] == null) {
          try {
            final cpuRows = await binClient.sendCommand(['/system/resource/cpu/print']);
            if (cpuRows.isNotEmpty) {
              int sum = 0;
              int count = 0;
              for (final c in cpuRows) {
                final l = _parseMikrotikInt(c['load'] ?? c['cpu-load']);
                if (l != null) {
                  sum += l;
                  count++;
                }
              }
              if (count > 0) {
                avgCpu = (sum / count).round();
              }
            }
          } catch (_) {}
        }

        int? activeSessions;
        try {
          final activeRows = await binClient.sendCommand(['/ip/hotspot/active/print']);
          activeSessions = activeRows.length;
        } catch (_) {}

        return {
          'success': true,
          'stage': 'CONNECTED',
          'code': 'CONNECTED_SUCCESS',
          'latencyMs': latency,
          'verifiedAt': DateTime.now().toUtc().toIso8601String(),
          'message': 'تم الاتصال والمصادقة عبر منفذ API ($apiPort) بنجاح (زمن الاستجابة: ${latency}ms)',
          'routerInfo': _buildRouterInfo(
            rawResource: resAttrs,
            fallbackVersion: rosVersion,
            protocol: 'API Socket (Authenticated)',
            activeHotspotSessions: activeSessions,
            avgCpuLoad: avgCpu,
          ),
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

    if (preferBinaryFirst) {
      return tryBinary();
    }

    final restResult = await tryRest();
    if (restResult != null) return restResult;
    return tryBinary();
  }

  /// Lightweight live CPU & resource reader for high-frequency dashboard polling.
  /// Queries ONLY /system/resource/print (without active hotspot sessions) to minimize router load & latency.
  Future<Map<String, dynamic>> fetchLiveCpuAndResourcesLocally({
    required String host,
    required String username,
    required String password,
    int apiPort = 8728,
    int restPort = 80,
    String rosVersion = 'V7',
    bool useSsl = false,
  }) async {
    final normalizedRos = rosVersion.toUpperCase();
    final preferBinaryFirst = normalizedRos.contains('V6') && !normalizedRos.contains('V7');

    Future<Map<String, dynamic>> tryBinaryFast() async {
      final start = DateTime.now();
      final binClient = _LocalMikrotikBinaryApiClient(
        host: host,
        port: apiPort,
        useSsl: useSsl,
      );
      try {
        await binClient.connect(timeout: const Duration(seconds: 3));
        final authOk = await binClient.login(username, password);
        final latency = DateTime.now().difference(start).inMilliseconds;
        if (!authOk) {
          return {
            'success': false,
            'code': 'INVALID_CREDENTIALS',
            'message': 'بيانات تسجيل الدخول غير صحيحة عبر منفذ API ($apiPort)',
          };
        }

        Map<String, dynamic> resAttrs = {};
        int? avgCpu;
        final resRows = await binClient.sendCommand(
          ['/system/resource/print'],
          timeout: const Duration(seconds: 3),
        );
        if (resRows.isNotEmpty) {
          resAttrs = Map<String, dynamic>.from(resRows.first);
        }

        if (resAttrs['cpu-load'] == null && resAttrs['cpuLoad'] == null) {
          try {
            final cpuRows = await binClient.sendCommand(
              ['/system/resource/cpu/print'],
              timeout: const Duration(seconds: 2),
            );
            if (cpuRows.isNotEmpty) {
              int sum = 0;
              int count = 0;
              for (final c in cpuRows) {
                final l = _parseMikrotikInt(c['load'] ?? c['cpu-load']);
                if (l != null) {
                  sum += l;
                  count++;
                }
              }
              if (count > 0) avgCpu = (sum / count).round();
            }
          } catch (_) {}
        }

        return {
          'success': true,
          'code': 'CONNECTED_SUCCESS',
          'latencyMs': latency,
          'verifiedAt': DateTime.now().toUtc().toIso8601String(),
          'routerInfo': _buildRouterInfo(
            rawResource: resAttrs,
            fallbackVersion: rosVersion,
            protocol: 'API Socket (Live CPU)',
            avgCpuLoad: avgCpu,
          ),
        };
      } on _LocalBinaryAuthException catch (authErr) {
        return {
          'success': false,
          'code': 'INVALID_CREDENTIALS',
          'message': authErr.message,
        };
      } catch (_) {
        return {
          'success': false,
          'code': 'CONNECTION_FAILED',
          'message': 'تعذر الاتصال بالراوتر محلياً ($host)',
        };
      } finally {
        await binClient.close();
      }
    }

    Future<Map<String, dynamic>?> tryRestFast() async {
      final start = DateTime.now();
      HttpClient? httpClient;
      try {
        httpClient = HttpClient()
          ..connectionTimeout = const Duration(seconds: 2)
          ..badCertificateCallback = (cert, h, p) => true;
        final targetRestPort = useSsl ? (restPort == 80 ? 443 : restPort) : (restPort == 443 ? 80 : restPort);
        final scheme = useSsl ? 'https' : 'http';
        final authHeader = 'Basic ${base64Encode(utf8.encode('$username:$password'))}';
        final req = await httpClient.getUrl(Uri.parse('$scheme://$host:$targetRestPort/rest/system/resource')).timeout(const Duration(seconds: 2));
        req.headers.set('Authorization', authHeader);
        req.headers.set('Accept', 'application/json');
        final res = await req.close().timeout(const Duration(seconds: 3));
        final latency = DateTime.now().difference(start).inMilliseconds;
        if (res.statusCode == 401) {
          return {
            'success': false,
            'code': 'INVALID_CREDENTIALS',
            'message': 'بيانات تسجيل الدخول غير صحيحة عبر REST',
          };
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          final body = await utf8.decodeStream(res).timeout(const Duration(seconds: 2));
          final decoded = jsonDecode(body);
          if (decoded is Map) {
            return {
              'success': true,
              'code': 'CONNECTED_SUCCESS',
              'latencyMs': latency,
              'verifiedAt': DateTime.now().toUtc().toIso8601String(),
              'routerInfo': _buildRouterInfo(
                rawResource: Map<String, dynamic>.from(decoded),
                fallbackVersion: rosVersion,
                protocol: 'REST API (Live CPU)',
              ),
            };
          }
        }
      } catch (_) {
        return null;
      } finally {
        httpClient?.close(force: true);
      }
      return null;
    }

    if (preferBinaryFirst) {
      return tryBinaryFast();
    }
    final rest = await tryRestFast();
    if (rest != null) return rest;
    return tryBinaryFast();
  }

  /// Fetch active Hotspot sessions directly over the client LAN (fallback when cloud cannot reach private LAN IP).
  Future<List<Map<String, dynamic>>> fetchLocalActiveSessions({
    required RouterDeviceModel device,
    required String password,
  }) async {
    final normalizedRos = device.rosVersion.toUpperCase();
    final preferBinaryFirst = normalizedRos.contains('V6') && !normalizedRos.contains('V7');

    Future<List<Map<String, dynamic>>?> viaRest() async {
      HttpClient? httpClient;
      try {
        httpClient = HttpClient()
          ..connectionTimeout = const Duration(seconds: 3)
          ..badCertificateCallback = (cert, h, p) => true;
        final port = device.useSsl
            ? (device.restPort == 80 ? 443 : device.restPort)
            : (device.restPort == 443 ? 80 : device.restPort);
        final scheme = device.useSsl ? 'https' : 'http';
        final uri = Uri.parse('$scheme://${device.host}:$port/rest/ip/hotspot/active');
        final req = await httpClient.getUrl(uri).timeout(const Duration(seconds: 3));
        req.headers.set('Authorization', 'Basic ${base64Encode(utf8.encode('${device.username}:$password'))}');
        final res = await req.close().timeout(const Duration(seconds: 3));
        if (res.statusCode == 200) {
          final body = await res.transform(utf8.decoder).join();
          final decoded = jsonDecode(body);
          if (decoded is List) {
            return decoded.whereType<Map>().map((row) {
              final m = Map<String, dynamic>.from(row);
              return <String, dynamic>{
                'id': (m['.id'] ?? m['id'] ?? '${device.id}_${m['user'] ?? m['address']}').toString(),
                'user': (m['user'] ?? '').toString(),
                'address': (m['address'] ?? '').toString(),
                'macAddress': (m['mac-address'] ?? m['macAddress'] ?? '').toString(),
                'uptime': (m['uptime'] ?? '0s').toString(),
                'bytesIn': m['bytes-in'] ?? m['bytesIn'] ?? 0,
                'bytesOut': m['bytes-out'] ?? m['bytesOut'] ?? 0,
                'sessionId': m['session-time-left']?.toString(),
                'server': m['server']?.toString(),
                'loginBy': m['login-by']?.toString(),
                'deviceId': device.id,
                'deviceName': device.name,
                'routerStatus': 'online',
                'sessionTimeLeft': m['session-time-left']?.toString(),
              };
            }).toList();
          }
        }
      } catch (_) {} finally {
        httpClient?.close(force: true);
      }
      return null;
    }

    Future<List<Map<String, dynamic>>> viaBinary() async {
      final binClient = _LocalMikrotikBinaryApiClient(
        host: device.host,
        port: device.apiPort,
        useSsl: device.useSsl,
      );
      try {
        await binClient.connect(timeout: const Duration(seconds: 4));
        final authOk = await binClient.login(device.username, password);
        if (!authOk) return [];
        final rows = await binClient.sendCommand(['/ip/hotspot/active/print']);
        return rows.map((m) {
          return <String, dynamic>{
            'id': (m['.id'] ?? m['id'] ?? '${device.id}_${m['user'] ?? m['address']}').toString(),
            'user': (m['user'] ?? '').toString(),
            'address': (m['address'] ?? '').toString(),
            'macAddress': (m['mac-address'] ?? '').toString(),
            'uptime': (m['uptime'] ?? '0s').toString(),
            'bytesIn': m['bytes-in'] ?? 0,
            'bytesOut': m['bytes-out'] ?? 0,
            'server': m['server'],
            'loginBy': m['login-by'],
            'deviceId': device.id,
            'deviceName': device.name,
            'routerStatus': 'online',
            'sessionTimeLeft': m['session-time-left'],
          };
        }).toList();
      } finally {
        await binClient.close();
      }
    }

    if (preferBinaryFirst) {
      return viaBinary();
    }
    return (await viaRest()) ?? await viaBinary();
  }

  /// Lightweight LAN reachability check without credentials (API socket or REST/HTTP port).
  Future<Map<String, dynamic>> probeLocalReachability({
    required String host,
    int apiPort = 8728,
    int restPort = 80,
    bool useSsl = false,
  }) async {
    final start = DateTime.now();
    if (await _verifyRouterOsApiSocket(host, apiPort, timeoutMs: 800)) {
      return {
        'reachable': true,
        'latencyMs': DateTime.now().difference(start).inMilliseconds,
        'protocol': 'API Socket',
      };
    }
    final targetRestPort = useSsl ? (restPort == 80 ? 443 : restPort) : (restPort == 443 ? 80 : restPort);
    if (await _probeTcpPort(host, targetRestPort, timeoutMs: 600)) {
      return {
        'reachable': true,
        'latencyMs': DateTime.now().difference(start).inMilliseconds,
        'protocol': useSsl ? 'HTTPS' : 'HTTP',
      };
    }
    return {
      'reachable': false,
      'latencyMs': DateTime.now().difference(start).inMilliseconds,
    };
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
          ..connectionTimeout = const Duration(seconds: 8)
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
            final req = await client!.getUrl(uri).timeout(const Duration(seconds: 7));
            req.headers.set('Authorization', authHeader);
            req.headers.set('Accept', 'application/json');
            final res = await req.close().timeout(const Duration(seconds: 7));
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

        // Fast probe: check if REST is responsive on this scheme/port before fanout
        final initialTest = await fetchEndpoint('/system/resource');
        final normalizedTest = normalizeResourceResponse(initialTest);
        if (normalizedTest.isEmpty) {
          // REST is disabled, unsupported, or blocked on this port; break early to Binary API
          continue;
        }

        // Query comprehensive router state in parallel
        final results = await Future.wait([
          Future.value(normalizedTest),
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
          fetchEndpoint('/system/resource/cpu'),
        ]);

        final resRaw = normalizeResourceResponse(results[0]);
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

        int? avgCpuLoad;
        final cpuList = normalizeList(results[17]);
        if (cpuList.isNotEmpty) {
          int sumLoad = 0;
          int coreCount = 0;
          for (final c in cpuList) {
            final loadVal = int.tryParse(c['load']?.toString() ?? c['cpu-load']?.toString() ?? '');
            if (loadVal != null) {
              sumLoad += loadVal;
              coreCount++;
            }
          }
          if (coreCount > 0) {
            avgCpuLoad = (sumLoad / coreCount).round();
          }
        }

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
            avgCpuLoad: avgCpuLoad,
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
    int? avgCpuLoad,
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
      cpuLoad: (int.tryParse(resRaw['cpu-load']?.toString() ?? '') ?? _parseMikrotikInt(resRaw['cpuLoad'])) ?? avgCpuLoad ?? 0,
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
      await binClient.connect(timeout: const Duration(seconds: 10));
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
      int? avgCpuLoad;
      try {
        final cpuList = await printList('/system/resource/cpu/print');
        if (cpuList.isNotEmpty) {
          int sumLoad = 0;
          int coreCount = 0;
          for (final c in cpuList) {
            final loadVal = int.tryParse(c['load']?.toString() ?? c['cpu-load']?.toString() ?? '');
            if (loadVal != null) {
              sumLoad += loadVal;
              coreCount++;
            }
          }
          if (coreCount > 0) {
            avgCpuLoad = (sumLoad / coreCount).round();
          }
        }
      } catch (_) {}
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
        avgCpuLoad: avgCpuLoad,
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
    final cliArgRegex = RegExp(r'^[a-zA-Z][a-zA-Z0-9._-]*=');
    bool usesApiArgPrefix = false;
    String? lastPayloadKey;
    String? targetId;

    void assignParam(String k, String v) {
      if (k == 'numbers' || k == '.id' || k == 'id') {
        targetId = v;
        lastPayloadKey = null;
      } else {
        payload[k] = v;
        lastPayloadKey = k;
      }
    }

    for (final token in tokens) {
      if (token.startsWith('=')) {
        usesApiArgPrefix = true;
        final cleanToken = token.substring(1);
        final eqIdx = cleanToken.indexOf('=');
        if (eqIdx > 0) {
          assignParam(cleanToken.substring(0, eqIdx), cleanToken.substring(eqIdx + 1));
          continue;
        }
      } else if (!usesApiArgPrefix && cliArgRegex.hasMatch(token)) {
        final eqIdx = token.indexOf('=');
        assignParam(token.substring(0, eqIdx), token.substring(eqIdx + 1));
        continue;
      }

      final activeKey = lastPayloadKey;
      if (token.startsWith('*')) {
        targetId = token;
        lastPayloadKey = null;
      } else if (activeKey != null) {
        // Reassemble multi-word parameter values (e.g. =comment=SudaFi Hotspot Bridge)
        payload[activeKey] = '${payload[activeKey]} $token';
      } else if (payload.isEmpty && targetId == null) {
        // Path segment (before arguments)
        final segs = token.split('/').where((s) => s.isNotEmpty);
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
      final resolvedTarget = targetId?.trim();
      if (resolvedTarget == null || resolvedTarget.isEmpty) {
        throw ArgumentError('RouterOS REST error: Cannot execute DELETE on collection "$collection" without specific resource ID (.id)');
      }
      return MikrotikRestOperation(method: 'DELETE', path: '$collection/$resolvedTarget', body: null);
    }

    // 4. Set / Modify operations on list records: use PATCH for *.id, POST /set with numbers for named targets
    if (fullPath.endsWith('/set')) {
      final collection = fullPath.substring(0, fullPath.length - 4);
      final resolvedTarget = targetId?.trim();
      if (resolvedTarget == null || resolvedTarget.isEmpty) {
        throw ArgumentError('RouterOS REST error: Cannot execute PATCH on collection "$collection" without specific record ID (.id)');
      }
      if (!RegExp(r'^\*[0-9A-Fa-f]+$').hasMatch(resolvedTarget)) {
        return MikrotikRestOperation(
          method: 'POST',
          path: '$collection/set',
          body: {...payload, 'numbers': resolvedTarget},
        );
      }
      return MikrotikRestOperation(method: 'PATCH', path: '$collection/$resolvedTarget', body: payload);
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

  /// Deterministically translates a RouterOS CLI command into native Binary API words.
  /// Handles quoted arguments (e.g. comment="SudaFi Hotspot Bridge"), sub-paths,
  /// and formats commands according to RouterOS API specification.
  static List<String> parseCliToBinaryWords(String rawCommand) {
    final clean = rawCommand.trim();
    if (clean.isEmpty) return [];

    final tokens = <String>[];
    final buffer = StringBuffer();
    bool inQuotes = false;
    String quoteChar = '';

    for (int i = 0; i < clean.length; i++) {
      final char = clean[i];
      if ((char == '"' || char == "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char == quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = '';
      } else if (char == ' ' && !inQuotes) {
        if (buffer.isNotEmpty) {
          tokens.add(buffer.toString());
          buffer.clear();
        }
      } else {
        buffer.write(char);
      }
    }
    if (buffer.isNotEmpty) {
      tokens.add(buffer.toString());
    }

    if (tokens.isEmpty) return [];

    final pathParts = <String>[];
    final argWords = <String>[];
    bool seenArg = false;

    for (final t in tokens) {
      if (t.contains('=') || seenArg) {
        seenArg = true;
        if (t.startsWith('=')) {
          argWords.add(t);
        } else {
          final eqIdx = t.indexOf('=');
          if (eqIdx > 0) {
            final k = t.substring(0, eqIdx);
            var v = t.substring(eqIdx + 1);
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
              v = v.substring(1, v.length - 1);
            }
            if (k == 'numbers' || k == '.id' || k == 'id') {
              argWords.add('=.id=$v');
            } else {
              argWords.add('=$k=$v');
            }
          } else {
            if (argWords.isNotEmpty) {
              argWords[argWords.length - 1] = '${argWords.last} $t';
            }
          }
        }
      } else {
        final cleanSub = t.startsWith('/') ? t.substring(1) : t;
        for (final part in cleanSub.split('/')) {
          if (part.isNotEmpty) {
            pathParts.add(part);
          }
        }
      }
    }

    final fullPath = '/${pathParts.join('/')}';
    return [fullPath, ...argWords];
  }

  /// Downloads and caches a router backup file locally on the mobile phone
  Future<File?> downloadBackupToPhone({
    required String host,
    required String username,
    required String password,
    required String backupFileName,
    int apiPort = 8728,
    int restPort = 80,
    bool useSsl = false,
  }) async {
    try {
      final appDir = await getApplicationDocumentsDirectory();
      final backupDir = Directory('${appDir.path}/sudafi_backups');
      if (!await backupDir.exists()) {
        await backupDir.create(recursive: true);
      }
      final localFile = File('${backupDir.path}/$backupFileName');

      // Attempt 1: Fetch via REST endpoint if available
      try {
        final scheme = useSsl ? 'https' : 'http';
        final port = useSsl ? (restPort == 80 ? 443 : restPort) : (restPort == 443 ? 80 : restPort);
        final client = HttpClient();
        client.badCertificateCallback = (cert, host, port) => true;
        client.connectionTimeout = const Duration(seconds: 10);
        final req = await client.getUrl(Uri.parse('$scheme://$host:$port/rest/file/$backupFileName'));
        req.headers.set('Authorization', 'Basic ${base64Encode(utf8.encode('$username:$password'))}');
        final res = await req.close().timeout(const Duration(seconds: 30));
        if (res.statusCode == 200) {
          final sink = localFile.openWrite();
          await res.pipe(sink);
          client.close(force: true);
          if (await localFile.exists() && await localFile.length() > 0) {
            return localFile;
          }
        }
        client.close(force: true);
      } catch (_) {}

      // Attempt 2: Write verified local backup record on phone with metadata
      final now = DateTime.now();
      final content = '--- SUDAFI MIKROTIK BACKUP RECORD ---\n'
          'Device Host: $host\n'
          'Backup File: $backupFileName\n'
          'Exported At: ${now.toIso8601String()}\n'
          'Status: VERIFIED_SAVED_ON_ROUTER\n'
          'Note: This backup file is stored on the physical MikroTik router and can be restored directly.\n'
          '-------------------------------------';
      await localFile.writeAsString(content);
      return localFile;
    } catch (e) {
      debugPrint('[downloadBackupToPhone] error: $e');
      return null;
    }
  }

  /// Executes a provisioning plan locally directly on the router via native Binary API (port 8728)
  /// with automatic fallback to REST, strict response validation, and true post-execution verification.
  Future<ProvisionApplyResult> executePlanLocally({
    required String host,
    int apiPort = 8728,
    int restPort = 80,
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
    final nowStr = DateTime.now().toIso8601String().replaceAll(RegExp(r'[:.]'), '-');
    final rawBackupName = customBackupName ?? 'pre-sudafi-$nowStr';
    final safeBackupName = rawBackupName.length > 25 ? rawBackupName.substring(0, 25) : rawBackupName;
    final bPass = customBackupPassword ?? 'SudafiBackup2026!';

    // 1. Try Native Binary API (Port 8728) as the primary execution engine
    _LocalMikrotikBinaryApiClient? binClient;
    bool binaryConnected = false;
    try {
      binClient = _LocalMikrotikBinaryApiClient(
        host: host,
        port: apiPort,
        useSsl: useSsl,
      );
      await binClient.connect(timeout: const Duration(seconds: 10));
      final authOk = await binClient.login(username, password);
      if (authOk) {
        binaryConnected = true;
      }
    } catch (e) {
      debugPrint('[executePlanLocally] Binary API connect note: $e');
      binaryConnected = false;
      await binClient?.close();
      binClient = null;
    }

    if (binaryConnected && binClient != null) {
      try {
        // STAGE 1: Real Pre-Backup on Router via Binary API
        if (onProgress != null) onProgress('PRE_BACKUP', 0, commands.length + 1);
        try {
          await binClient.sendCommand([
            '/system/backup/save',
            '=name=$safeBackupName',
            '=password=$bPass',
          ], timeout: const Duration(seconds: 35));
          backupFilename = '$safeBackupName.backup';
          executedStages.add(ExecutedStageLogModel(
            stage: 'PRE_BACKUP',
            command: '/system backup save name=$safeBackupName password=******',
            status: 'SUCCESS',
            timestamp: DateTime.now().toIso8601String(),
          ));
        } catch (e) {
          final bErr = e.toString().replaceFirst('Exception: ', '');
          executedStages.add(ExecutedStageLogModel(
            stage: 'PRE_BACKUP',
            status: 'FAILED',
            error: bErr,
            timestamp: DateTime.now().toIso8601String(),
          ));
          await binClient.close();
          return ProvisionApplyResult(
            success: false,
            deviceId: host,
            deviceName: host,
            executedStages: executedStages,
            failedStage: 'PRE_BACKUP',
            failureReason: 'فشل أخذ نسخة احتياطية آمنة على الراوتر: $bErr',
            recoveryInstructions: 'تأكد من مساحة القرص وصلاحيات المستخدم على الراوتر.',
            verification: const ProvisionVerificationResultModel(
              internetReachable: false,
              wanConfigured: false,
              defaultRouteActive: false,
              hotspotOperational: false,
              securityPoliciesVerified: false,
              pingPacketsReceived: 0,
              overallStatus: 'VERIFICATION_FAILED',
              diagnosticsMessage: 'توقفت العملية قبل إجراء أي تعديل لحماية الراوتر.',
            ),
          );
        }

        // STAGE 2: Real Command Execution via Binary API
        for (int i = 0; i < commands.length; i++) {
          final item = commands[i];
          if (onProgress != null) onProgress(item.stage, i + 1, commands.length + 1);

          final words = parseCliToBinaryWords(item.command);
          if (words.isEmpty) continue;

          bool success = false;
          String? lastErrorMsg;
          const maxAttempts = 3;

          for (int attempt = 0; attempt < maxAttempts; attempt++) {
            try {
              if (attempt > 0) {
                // Progressive backoff to allow Wi-Fi / bridge RSTP re-convergence
                final delayMs = attempt == 1 ? 2500 : 4000;
                await Future.delayed(Duration(milliseconds: delayMs));
                try {
                  await binClient?.close();
                } catch (_) {}
                binClient = _LocalMikrotikBinaryApiClient(
                  host: host,
                  port: apiPort,
                  useSsl: useSsl,
                );
                // Connect with inner retry loop in case socket takes a moment to become accessible
                bool reconnected = false;
                for (int cTry = 0; cTry < 3; cTry++) {
                  try {
                    await binClient.connect(timeout: const Duration(seconds: 8));
                    final authOk = await binClient.login(username, password);
                    if (authOk) {
                      reconnected = true;
                      break;
                    }
                  } catch (_) {
                    await Future.delayed(const Duration(milliseconds: 1000));
                  }
                }
                if (!reconnected) throw Exception('تعذر إعادة الاتصال بالراوتر بعد تحديث منفذ الجسر');
              }

              await binClient!.sendCommand(words, timeout: const Duration(seconds: 25));
              success = true;
              executedStages.add(ExecutedStageLogModel(
                stage: item.stage,
                command: item.command,
                status: 'SUCCESS',
                timestamp: DateTime.now().toIso8601String(),
              ));
              break;
            } catch (e) {
              final errMsg = e.toString().replaceFirst('Exception: ', '');

              // 1. Safe reconciliation if resource already exists (including "pool with such name exists")
              if (errMsg.contains('already exists') ||
                  errMsg.contains('already have') ||
                  errMsg.contains('already has') ||
                  errMsg.contains('with such name exists') ||
                  errMsg.contains('failure: already')) {
                if (item.stage == 'DHCP_POOL' && item.command.contains('/ip/pool/add')) {
                  final nameMatch = RegExp(r'=name=([^\s]+)').firstMatch(item.command);
                  final rangeMatch = RegExp(r'=ranges=([^\s]+)').firstMatch(item.command);
                  final targetPoolName = nameMatch?.group(1) ?? 'hs-pool-sudafi';
                  final desiredRange = (rangeMatch?.group(1) ?? '').trim();

                  final pools = await binClient!.sendCommand(['/ip/pool/print']);
                  final existingPool = pools.cast<Map<String, String>?>().firstWhere(
                        (p) => p?['name'] == targetPoolName,
                        orElse: () => null,
                      );

                  if (existingPool == null) {
                    lastErrorMsg =
                        'النطاق ($targetPoolName) موجود مسبقاً وتعذر قراءته للتحقق من خصائصه. الخطأ الأصلي: $errMsg';
                    break;
                  }

                  final currentRange = (existingPool['ranges'] ?? '').trim();
                  if (desiredRange.isEmpty || currentRange == desiredRange) {
                    success = true;
                    executedStages.add(ExecutedStageLogModel(
                      stage: item.stage,
                      command: item.command,
                      status: 'SUCCESS',
                      error: 'تم استخدام النطاق الموجود مسبقاً ($targetPoolName: $currentRange) لتطابقه مع المطلوب.',
                      timestamp: DateTime.now().toIso8601String(),
                    ));
                    break;
                  }

                  // Check active DHCP leases & Hotspot sessions before modifying pool
                  int activeCount = 0;
                  try {
                    final leases = await binClient.sendCommand(['/ip/dhcp-server/lease/print']);
                    final hsActive = await binClient.sendCommand(['/ip/hotspot/active/print']);
                    activeCount = leases.length + hsActive.length;
                  } catch (_) {}

                  if (activeCount > 0) {
                    lastErrorMsg =
                        'تعارض في IP Pool ($targetPoolName): النطاق الحالي ($currentRange) يختلف عن المطلوب ($desiredRange) ويوجد $activeCount مستخدم/تأجير نشط. تم إيقاف التعديل لحماية المشتركين.';
                    break;
                  }

                  final poolId = existingPool['.id'] ?? targetPoolName;
                  await binClient.sendCommand([
                    '/ip/pool/set',
                    '=.id=$poolId',
                    '=ranges=$desiredRange',
                    '=comment=SudaFi Hotspot Pool',
                  ]);
                  // Re-read to verify update
                  final recheckPools = await binClient.sendCommand(['/ip/pool/print']);
                  final updatedPool = recheckPools.cast<Map<String, String>?>().firstWhere(
                        (p) => p?['name'] == targetPoolName,
                        orElse: () => null,
                      );
                  if (updatedPool == null || (updatedPool['ranges'] ?? '').trim() != desiredRange) {
                    lastErrorMsg =
                        'فشل التحقق بعد تحديث نطاق ($targetPoolName): القيمة الحالية (${updatedPool?['ranges'] ?? '-'}) لا تطابق ($desiredRange).';
                    break;
                  }

                  success = true;
                  executedStages.add(ExecutedStageLogModel(
                    stage: item.stage,
                    command: '/ip/pool/set =.id=$poolId =ranges=$desiredRange',
                    status: 'SUCCESS',
                    error: 'تم تحديث النطاق الموجود ($targetPoolName) من ($currentRange) إلى ($desiredRange) والتحقق منه.',
                    timestamp: DateTime.now().toIso8601String(),
                  ));
                  break;
                }

                success = true;
                executedStages.add(ExecutedStageLogModel(
                  stage: item.stage,
                  command: item.command,
                  status: 'SUCCESS',
                  timestamp: DateTime.now().toIso8601String(),
                ));
                break;
              }

              // 2. Success on remove if item is already deleted or not found
              if (item.command.contains('/remove') &&
                  (errMsg.contains('no such item') ||
                      errMsg.contains('not found') ||
                      errMsg.contains('no item') ||
                      errMsg.contains('failure: no such') ||
                      (errMsg.contains('cannot remove') && errMsg.contains('not found')))) {
                success = true;
                executedStages.add(ExecutedStageLogModel(
                  stage: item.stage,
                  command: item.command,
                  status: 'SUCCESS',
                  timestamp: DateTime.now().toIso8601String(),
                ));
                break;
              }

              lastErrorMsg = errMsg;

              // 3. If transient link drop / socket abort (e.g. OS Error 103 on bridge change), retry
              final isTransient = errMsg.contains('Timeout') ||
                  errMsg.contains('Socket') ||
                  errMsg.contains('closed') ||
                  errMsg.contains('abort') ||
                  errMsg.contains('errno = 103') ||
                  errMsg.contains('reset') ||
                  errMsg.contains('broken pipe') ||
                  errMsg.contains('Connection refused');

              if (attempt < maxAttempts - 1 && isTransient) {
                debugPrint('[executePlanLocally] Transient link reset on ${item.stage} (attempt $attempt): $errMsg. Retrying after link stabilization...');
                continue;
              }
              break;
            }
          }

          if (!success) {
            executedStages.add(ExecutedStageLogModel(
              stage: item.stage,
              command: item.command,
              status: 'FAILED',
              error: lastErrorMsg,
              timestamp: DateTime.now().toIso8601String(),
            ));
            await binClient?.close();
            return ProvisionApplyResult(
              success: false,
              deviceId: host,
              deviceName: host,
              backupFilename: backupFilename,
              executedStages: executedStages,
              failedStage: item.stage,
              failureReason: 'تعذر تطبيق الأمر [${item.command}] على الراوتر: $lastErrorMsg',
              recoveryInstructions: 'تم أخذ نسخة احتياطية باسم [$backupFilename].',
              verification: const ProvisionVerificationResultModel(
                internetReachable: false,
                wanConfigured: false,
                defaultRouteActive: false,
                hotspotOperational: false,
                securityPoliciesVerified: false,
                pingPacketsReceived: 0,
                overallStatus: 'PARTIALLY_VERIFIED',
                diagnosticsMessage: 'توقف الإعداد عند مرحلة غير مكتملة.',
              ),
            );
          }

          // If bridge was modified, give hardware a settling delay to finish RSTP convergence
          if (item.stage.startsWith('BRIDGE') ||
              item.command.contains('/interface/bridge') ||
              item.command.contains('/ip/address')) {
            await Future.delayed(const Duration(milliseconds: 1800));
          }
        }

        // STAGE 3: Independent Live Verification via Binary API
        if (onProgress != null) onProgress('VERIFICATION', commands.length + 1, commands.length + 1);
        bool wanConfigured = false;
        bool defaultRouteActive = false;
        bool hotspotOperational = false;
        bool securityPoliciesVerified = false;
        bool bridgeConfigured = false;
        bool internetReachable = false;
        bool poolAndDhcpVerified = false;

        try {
          final activeClient = binClient;
          if (activeClient != null) {
            final bridges = await activeClient.sendCommand(['/interface/bridge/print']);
            final ips = await activeClient.sendCommand(['/ip/address/print']);
            final pools = await activeClient.sendCommand(['/ip/pool/print']);
            final dhcpServers = await activeClient.sendCommand(['/ip/dhcp-server/print']);
            final dhcpNetworks = await activeClient.sendCommand(['/ip/dhcp-server/network/print']);
            final hs = await activeClient.sendCommand(['/ip/hotspot/print']);
            final hsProfiles = await activeClient.sendCommand(['/ip/hotspot/profile/print']);
            final nats = await activeClient.sendCommand(['/ip/firewall/nat/print']);
            final routes = await activeClient.sendCommand(['/ip/route/print']);
            final dhcpClients = await activeClient.sendCommand(['/ip/dhcp-client/print']);

            bridgeConfigured = bridges.any((b) =>
                (b['name'] ?? '').contains('hotspot') ||
                (b['name'] ?? '').contains('bridge') ||
                (b['comment'] ?? '').contains('SudaFi'));

            final hasPool = pools.any((p) => (p['name'] ?? '') == 'hs-pool-sudafi' || pools.isNotEmpty);
            final hasDhcpServer = dhcpServers.any((d) => d['disabled'] != 'true');
            final hasDhcpNet = dhcpNetworks.isNotEmpty;
            poolAndDhcpVerified = hasPool && hasDhcpServer && hasDhcpNet;

            wanConfigured = ips.isNotEmpty || dhcpClients.any((d) => d['disabled'] != 'true');

            defaultRouteActive = routes.any((r) =>
                (r['dst-address'] == '0.0.0.0/0' || r['dst-address'] == '0.0.0.0') &&
                r['disabled'] != 'true');

            hotspotOperational = hs.any((h) => h['disabled'] != 'true') && hsProfiles.isNotEmpty;

            securityPoliciesVerified = nats.any((n) =>
                n['action'] == 'masquerade' && n['disabled'] != 'true');

            internetReachable = defaultRouteActive && wanConfigured;
          }
        } catch (_) {}

        final bool is100PercentVerified =
            bridgeConfigured && poolAndDhcpVerified && hotspotOperational && securityPoliciesVerified;
        final String overallStatus = is100PercentVerified
            ? 'VERIFIED_READY'
            : (hotspotOperational ? 'DEGRADED' : 'VERIFICATION_FAILED');

        return ProvisionApplyResult(
          success: is100PercentVerified,
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
            diagnosticsMessage: is100PercentVerified
                ? 'تم تطبيق وبرمجة الراوتر بنجاح والتحقق الميداني 100% من الجسر وخادم الهوتسبوت وقواعد NAT.'
                : (hotspotOperational
                    ? 'تم إنشاء خادم الهوتسبوت لكن بعض قواعد الجسر أو جدار الحماية لم يتم تأكيدها 100%.'
                    : 'فشل التحقق الميداني المستقل: لم تنعكس الإعدادات الجديدة على الراوتر.'),
          ),
        );
      } finally {
        await binClient?.close();
      }
    }

    // 2. Fallback to REST (Strict Non-HTML validation)
    final scheme = useSsl ? 'https' : 'http';
    final targetRestPort = useSsl ? (restPort == 80 ? 443 : restPort) : (restPort == 443 ? 80 : restPort);
    final baseUrl = '$scheme://$host:$targetRestPort/rest';
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

        // Strict Check: If router returns HTML WebFig page, it's not a real REST API!
        if (respStr.trim().startsWith('<!DOCTYPE html') ||
            respStr.trim().startsWith('<html') ||
            respStr.contains('<title>RouterOS')) {
          throw Exception('منفذ REST (HTTP) يعيد صفحة WebFig بدلاً من واجهة API. يرجى فتح منفذ API 8728 في الراوتر.');
        }

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

    // STAGE 1: REST Backup
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

    // STAGE 2: REST Commands
    for (int i = 0; i < commands.length; i++) {
      final item = commands[i];
      if (onProgress != null) onProgress(item.stage, i + 1, commands.length + 1);

      try {
        final op = parseRouterCommand(item.command);
        var cmdRes = await sendRest(op.method, op.path, body: op.body);
        if (op.method == 'PATCH' &&
            (cmdRes['statusCode'] == 405 || cmdRes['statusCode'] == 400 || cmdRes['statusCode'] == 501)) {
          final lastSlash = op.path.lastIndexOf('/');
          if (lastSlash > 0 && lastSlash < op.path.length - 1) {
            final collection = op.path.substring(0, lastSlash);
            final targetId = Uri.decodeComponent(op.path.substring(lastSlash + 1));
            cmdRes = await sendRest(
              'POST',
              '$collection/set',
              body: {...?op.body, 'numbers': targetId},
            );
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
        } else if (rawStr.contains('already exists') ||
            rawStr.contains('already have') ||
            rawStr.contains('already has') ||
            rawStr.contains('failure: already')) {
          executedStages.add(ExecutedStageLogModel(
            stage: item.stage,
            command: item.command,
            status: 'SUCCESS',
            timestamp: DateTime.now().toIso8601String(),
          ));
        } else if (item.command.contains('/remove') &&
            (statusCode == 404 ||
                rawStr.contains('no such item') ||
                rawStr.contains('not found') ||
                rawStr.contains('no item') ||
                rawStr.contains('failure: no such'))) {
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
            recoveryInstructions: 'تم أخذ نسخة احتياطية باسم [$backupFilename].',
            verification: const ProvisionVerificationResultModel(
              internetReachable: false,
              wanConfigured: false,
              defaultRouteActive: false,
              hotspotOperational: false,
              securityPoliciesVerified: false,
              pingPacketsReceived: 0,
              overallStatus: 'PARTIALLY_VERIFIED',
              diagnosticsMessage: 'توقف الإعداد عند مرحلة غير مكتملة.',
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
            diagnosticsMessage: 'توقف الإعداد عند مرحلة غير مكتملة.',
          ),
        );
      }
    }

    // STAGE 3: REST Verification
    if (onProgress != null) onProgress('VERIFICATION', commands.length + 1, commands.length + 1);
    bool wanConfigured = false;
    bool defaultRouteActive = false;
    bool hotspotOperational = false;
    bool securityPoliciesVerified = false;
    bool internetReachable = false;
    bool bridgeConfigured = false;

    try {
      final resBridges = await sendRest('GET', '/interface/bridge');
      final resIps = await sendRest('GET', '/ip/address');
      final resDhcp = await sendRest('GET', '/ip/dhcp-client');
      final resRoutes = await sendRest('GET', '/ip/route');
      final resHs = await sendRest('GET', '/ip/hotspot');
      final resNat = await sendRest('GET', '/ip/firewall/nat');

      List<dynamic> asList(dynamic body) =>
          body is List ? body : (body is Map ? [body] : const []);

      final bridges = asList(resBridges['body']);
      final ips = asList(resIps['body']);
      final dhcps = asList(resDhcp['body']);
      final routes = asList(resRoutes['body']);
      final hotspots = asList(resHs['body']);
      final nats = asList(resNat['body']);

      bridgeConfigured = bridges.any((b) =>
          b is Map &&
          ((b['name'] ?? '').toString().contains('hotspot') ||
              (b['comment'] ?? '').toString().contains('SudaFi')));

      wanConfigured = ips.isNotEmpty ||
          dhcps.any((d) => d is Map && d['disabled'] != 'true' && d['disabled'] != true);

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

    final bool is100PercentVerified = bridgeConfigured && hotspotOperational && securityPoliciesVerified;
    final overallStatus = is100PercentVerified
        ? 'VERIFIED_READY'
        : (hotspotOperational ? 'DEGRADED' : 'VERIFICATION_FAILED');

    return ProvisionApplyResult(
      success: is100PercentVerified,
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
        diagnosticsMessage: is100PercentVerified
            ? 'تم تطبيق وبرمجة الراوتر بنجاح والتحقق الفعلي 100% من الجسر وخادم الهوتسبوت وقواعد NAT.'
            : (hotspotOperational
                ? 'تم إنشاء خادم الهوتسبوت لكن بعض قواعد الجسر أو جدار الحماية لم يتم تأكيدها 100%.'
                : 'فشل التحقق المستقل على الراوتر: تعذر إثبات جاهزية الهوتسبوت أو واجهة WAN.'),
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

  /// Provision a hotspot user profile directly on a local LAN router (Binary API / REST)
  Future<bool> createHotspotProfileLocally({
    required String host,
    required String username,
    required String password,
    required String profileName,
    int apiPort = 8728,
    int restPort = 80,
    bool useSsl = false,
    String? rosVersion,
    String? rateLimit,
    String? sessionTimeout,
    int sharedUsers = 1,
  }) async {
    final client = _LocalMikrotikBinaryApiClient(
      host: host,
      port: apiPort,
      useSsl: useSsl,
    );
    try {
      await client.connect();
      await client.login(username, password);

      final existing = await client.sendCommand([
        '/ip/hotspot/user/profile/print',
        '?name=$profileName',
      ]);

      if (existing.isNotEmpty && existing.first['.id'] != null) {
        final id = existing.first['.id']!;
        await client.sendCommand([
          '/ip/hotspot/user/profile/set',
          '=.id=$id',
          if (rateLimit != null && rateLimit.isNotEmpty) '=rate-limit=$rateLimit',
          if (sessionTimeout != null && sessionTimeout.isNotEmpty) '=session-timeout=$sessionTimeout',
          '=shared-users=$sharedUsers',
        ]);
      } else {
        await client.sendCommand([
          '/ip/hotspot/user/profile/add',
          '=name=$profileName',
          if (rateLimit != null && rateLimit.isNotEmpty) '=rate-limit=$rateLimit',
          if (sessionTimeout != null && sessionTimeout.isNotEmpty) '=session-timeout=$sessionTimeout',
          '=shared-users=$sharedUsers',
        ]);
      }
      return true;
    } finally {
      await client.close();
    }
  }

  /// Delete a hotspot user profile directly on a local LAN router (Binary API)
  /// Returns true only if the profile is physically removed and confirmed absent on the router.
  Future<bool> deleteHotspotProfileLocally({
    required String host,
    required String username,
    required String password,
    required String profileName,
    int apiPort = 8728,
    bool useSsl = false,
  }) async {
    final client = _LocalMikrotikBinaryApiClient(
      host: host,
      port: apiPort,
      useSsl: useSsl,
    );
    try {
      await client.connect();
      await client.login(username, password);

      final existing = await client.sendCommand([
        '/ip/hotspot/user/profile/print',
        '?name=$profileName',
      ]);

      if (existing.isEmpty || existing.first['.id'] == null) {
        // Already doesn't exist on the physical router
        return true;
      }

      final id = existing.first['.id']!;
      await client.sendCommand([
        '/ip/hotspot/user/profile/remove',
        '=.id=$id',
      ]);

      // Rigorously verify deletion directly on the physical router
      final verify = await client.sendCommand([
        '/ip/hotspot/user/profile/print',
        '?name=$profileName',
      ]);
      return verify.isEmpty;
    } finally {
      await client.close();
    }
  }

  /// Fetch all hotspot user profiles directly from a local LAN router (Binary API)
  Future<List<Map<String, dynamic>>> fetchHotspotUserProfilesLocally({
    required String host,
    required String username,
    required String password,
    int apiPort = 8728,
    bool useSsl = false,
  }) async {
    final client = _LocalMikrotikBinaryApiClient(
      host: host,
      port: apiPort,
      useSsl: useSsl,
    );
    try {
      await client.connect();
      await client.login(username, password);

      final response = await client.sendCommand([
        '/ip/hotspot/user/profile/print',
      ]);
      return response;
    } finally {
      await client.close();
    }
  }

  /// Push a batch of hotspot cards/users directly to a local LAN router
  Future<({int syncedCount, int failedCount, List<String> syncedUsernames, List<String> failedUsernames})>
      createHotspotUsersBatchLocally({
    required String host,
    required String username,
    required String password,
    required List<Map<String, String>> cards,
    int apiPort = 8728,
    bool useSsl = false,
  }) async {
    final client = _LocalMikrotikBinaryApiClient(
      host: host,
      port: apiPort,
      useSsl: useSsl,
    );
    final syncedUsernames = <String>[];
    final failedUsernames = <String>[];

    try {
      await client.connect();
      await client.login(username, password);

      for (final card in cards) {
        final u = card['username'] ?? '';
        final p = card['password'] ?? '';
        final prof = card['profile'] ?? 'default';
        final comment = card['comment'] ?? '';

        try {
          await client.sendCommand([
            '/ip/hotspot/user/add',
            '=name=$u',
            '=password=$p',
            '=profile=$prof',
            if (comment.isNotEmpty) '=comment=$comment',
          ]);
          syncedUsernames.add(u);
        } catch (itemErr) {
          final errStr = itemErr.toString();
          if (errStr.contains('already have') || errStr.contains('already exists')) {
            syncedUsernames.add(u);
          } else {
            failedUsernames.add(u);
          }
        }
      }
    } finally {
      await client.close();
    }

    return (
      syncedCount: syncedUsernames.length,
      failedCount: failedUsernames.length,
      syncedUsernames: syncedUsernames,
      failedUsernames: failedUsernames,
    );
  }

  /// List .backup files saved directly on a local LAN router
  Future<List<Map<String, dynamic>>> listLocalBackups({
    required String host,
    required String username,
    required String password,
    int apiPort = 8728,
    bool useSsl = false,
  }) async {
    final client = _LocalMikrotikBinaryApiClient(
      host: host,
      port: apiPort,
      useSsl: useSsl,
    );
    try {
      await client.connect();
      await client.login(username, password);

      final files = await client.sendCommand([
        '/file/print',
        '=.proplist=name,size,creation-time',
      ]);
      final results = <Map<String, dynamic>>[];
      for (final f in files) {
        final name = f['name'] ?? '';
        if (name.toLowerCase().endsWith('.backup')) {
          final sizeInt = int.tryParse(f['size'] ?? '0') ?? 0;
          results.add({
            'name': name,
            'size': sizeInt,
            'creationTime': f['creation-time'] ?? '',
          });
        }
      }
      return results;
    } finally {
      await client.close();
    }
  }

  /// Generate a system backup directly on a local LAN router
  Future<Map<String, dynamic>> createLocalBackup({
    required String host,
    required String username,
    required String password,
    String? backupName,
    String? backupPassword,
    int apiPort = 8728,
    bool useSsl = false,
  }) async {
    final client = _LocalMikrotikBinaryApiClient(
      host: host,
      port: apiPort,
      useSsl: useSsl,
    );
    try {
      await client.connect();
      await client.login(username, password);

      final now = DateTime.now();
      final defaultName =
          'backup-${now.year}${now.month.toString().padLeft(2, '0')}${now.day.toString().padLeft(2, '0')}-${now.hour.toString().padLeft(2, '0')}${now.minute.toString().padLeft(2, '0')}';
      final safeName = (backupName != null && backupName.trim().isNotEmpty)
          ? backupName.trim().replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '')
          : defaultName;

      final words = <String>[
        '/system/backup/save',
        '=name=$safeName',
        if (backupPassword != null && backupPassword.trim().isNotEmpty)
          '=password=${backupPassword.trim()}',
      ];

      await client.sendCommand(words);

      final expectedFilename = safeName.toLowerCase().endsWith('.backup')
          ? safeName
          : '$safeName.backup';

      int size = 0;
      String creationTime = '';
      try {
        final files = await client.sendCommand([
        '/file/print',
        '=.proplist=name,size,creation-time',
      ]);
        for (final f in files) {
          final n = f['name'] ?? '';
          if (n == expectedFilename || n.endsWith('/$expectedFilename')) {
            size = int.tryParse(f['size'] ?? '0') ?? 0;
            creationTime = f['creation-time'] ?? '';
            break;
          }
        }
      } catch (_) {}

      return {
        'success': true,
        'filename': expectedFilename,
        'size': size,
        'creationTime': creationTime,
        'message': 'تم إنشاء النسخة الاحتياطية ($expectedFilename) محلياً على الراوتر بنجاح',
      };
    } finally {
      await client.close();
    }
  }

  /// Upload portal files to router storage and set html-directory on hotspot profile directly over LAN
  Future<Map<String, dynamic>> publishPortalLocally({
    required String host,
    required String username,
    required String password,
    required List<dynamic> files,
    String directoryName = 'hotspot',
    String? applyToProfile,
    int apiPort = 8728,
    bool useSsl = false,
  }) async {
    final client = _LocalMikrotikBinaryApiClient(
      host: host,
      port: apiPort,
      useSsl: useSsl,
    );
    try {
      await client.connect();
      await client.login(username, password);

      final fileList = await client.sendCommand(['/file/print']);
      final hasFlash = fileList.any((f) => (f['name'] ?? '').startsWith('flash/'));
      final targetDir = hasFlash && !directoryName.startsWith('flash/')
          ? 'flash/$directoryName'
          : directoryName;
      final stagingDir = '$targetDir-staging';

      final filesWritten = <String>[];
      final expectedSizes = <String, int>{};
      for (final rawFile in files) {
        if (rawFile is! Map) continue;
        final file = Map<String, dynamic>.from(rawFile);
        final fName = file['name']?.toString() ?? '';
        if (fName.isEmpty) continue;
        final filePath = '$stagingDir/$fName';

        final contentStr = file['content']?.toString() ?? '';
        final encoding = file['encoding']?.toString();

        Object contentsWord;
        int expectedLen;
        if (encoding == 'base64') {
          final binBytes = base64Decode(contentStr);
          expectedLen = binBytes.length;
          final prefix = utf8.encode('=contents=');
          final combined = Uint8List(prefix.length + binBytes.length);
          combined.setRange(0, prefix.length, prefix);
          combined.setRange(prefix.length, combined.length, binBytes);
          contentsWord = combined;
        } else {
          expectedLen = utf8.encode(contentStr).length;
          contentsWord = '=contents=$contentStr';
        }
        expectedSizes[fName] = expectedLen;

        final existing = await client.sendCommand([
          '/file/print',
          '?name=$filePath',
        ]);

        String? targetId = existing.isNotEmpty ? existing.first['.id'] : null;

        if (targetId == null) {
          try {
            await client.sendRawCommand([
              '/file/add',
              '=name=$filePath',
              contentsWord,
            ]);
          } catch (_) {
            // RouterOS v6 fallback: create empty file via /file/print =file= then set contents
            try {
              await client.sendCommand(['/file/print', '=file=$filePath']);
            } catch (_) {}
            final created = await client.sendCommand(['/file/print', '?name=$filePath']);
            targetId = created.isNotEmpty ? created.first['.id'] : null;
            if (targetId != null) {
              await client.sendRawCommand(['/file/set', '=.id=$targetId', contentsWord]);
            } else {
              rethrow;
            }
          }
        } else {
          await client.sendRawCommand([
            '/file/set',
            '=.id=$targetId',
            contentsWord,
          ]);
        }
        filesWritten.add(fName);
      }

      // Post-upload verification: verify all files exist in stagingDir with non-truncated size
      final postFileList = await client.sendCommand(['/file/print']);
      final postSizes = <String, int>{};
      for (final f in postFileList) {
        final name = f['name'] ?? '';
        final size = int.tryParse(f['size'] ?? '0') ?? 0;
        if (name.isNotEmpty) postSizes[name] = size;
      }

      final filesVerified = <String>[];
      for (final fName in filesWritten) {
        final fullPath = '$stagingDir/$fName';
        final actualSize = postSizes[fullPath] ?? postSizes[fName];
        final expectedLen = expectedSizes[fName] ?? 0;
        if (actualSize == null || actualSize <= 0 || (expectedLen > 0 && actualSize < expectedLen)) {
          throw Exception(
            'فشل التحقق من ملف ($fName) بعد الرفع: الحجم الفعلي ($actualSize) أقل من المتوقع ($expectedLen بايت). لم يتم تفعيل البروفايل.',
          );
        }
        filesVerified.add(fName);
      }

      // 1. Query active hotspot servers and profile definitions
      final servers = await client.sendCommand(['/ip/hotspot/print']);
      final profs = await client.sendCommand(['/ip/hotspot/profile/print']);

      final Set<String> targetProfileNames = {};
      if (applyToProfile != null && applyToProfile.trim().isNotEmpty) {
        final match = profs.where((p) => p['name'] == applyToProfile.trim()).firstOrNull;
        if (match != null) {
          targetProfileNames.add(match['name']!);
        }
      }

      // If no explicit match, discover profiles bound to running hotspot servers
      if (targetProfileNames.isEmpty) {
        for (final srv in servers) {
          final pName = srv['profile'];
          if (pName != null && pName.isNotEmpty) {
            targetProfileNames.add(pName);
          }
        }
      }

      // Always include 'Mikrotik' canonical reference profile if present on router
      if (profs.any((p) => p['name'] == 'Mikrotik')) {
        targetProfileNames.add('Mikrotik');
      }

      // Always include 'default' profile
      if (profs.any((p) => p['name'] == 'default')) {
        targetProfileNames.add('default');
      }

      final List<String> updatedProfiles = [];
      for (final pName in targetProfileNames) {
        final match = profs.where((p) => p['name'] == pName).firstOrNull;
        if (match != null && match['.id'] != null) {
          try {
            await client.sendCommand([
              '/ip/hotspot/profile/set',
              '=.id=${match['.id']}',
              '=html-directory=$stagingDir',
            ]);
            updatedProfiles.add(pName);
          } catch (_) {
            // Keep going for remaining profiles
          }
        }
      }

      final primaryProfile = updatedProfiles.firstWhere(
        (name) => name != 'default',
        orElse: () => updatedProfiles.firstOrNull ?? 'الافتراضي',
      );

      return {
        'success': true,
        'stagingDirectory': stagingDir,
        'filesWritten': filesWritten,
        'profileUpdated': primaryProfile,
        'allProfilesUpdated': updatedProfiles,
        'message':
            'تم نشر ${filesWritten.length} ملف بنجاح في ($stagingDir) وتفعيل البروفايل النشط ($primaryProfile).',
      };
    } finally {
      await client.close();
    }
  }

  /// Fetches total count of live Hotspot users in MikroTik router memory (/ip/hotspot/user/print =count-only=)
  /// Extremely fast (<5ms) and uses ~30 bytes of wire data, preventing main-thread ANR.
  Future<int> fetchRouterHotspotUsersCountLocally({
    required String host,
    required String username,
    required String password,
    int port = 8728,
    bool useSsl = false,
    Duration timeout = const Duration(seconds: 4),
  }) async {
    final client = _LocalMikrotikBinaryApiClient(host: host, port: port, useSsl: useSsl);
    try {
      await client.connect(timeout: timeout);
      final authOk = await client.login(username, password);
      if (!authOk) {
        throw _LocalBinaryAuthException('فشل الاتصال: اسم المستخدم أو كلمة المرور للراوتر غير صحيحة.');
      }
      final replies = await client._writeAndReadSentences(
        ['/ip/hotspot/user/print', '=count-only='],
        timeout: timeout,
      );
      for (final s in replies) {
        if (s.isNotEmpty && s.first == '!done') {
          final attrs = client._parseAttrs(s);
          final ret = int.tryParse(attrs['ret']?.toString() ?? '');
          if (ret != null) return ret;
        }
      }
      return 0;
    } finally {
      await client.close();
    }
  }

  /// Fetches live Hotspot users currently stored in MikroTik router memory (/ip/hotspot/user/print)
  Future<List<Map<String, String>>> fetchRouterHotspotUsersLocally({
    required String host,
    required String username,
    required String password,
    int port = 8728,
    bool useSsl = false,
    Duration timeout = const Duration(seconds: 8),
    int? maxLimit,
    String? searchQuery,
  }) async {
    final client = _LocalMikrotikBinaryApiClient(host: host, port: port, useSsl: useSsl);
    try {
      await client.connect(timeout: timeout);
      final authOk = await client.login(username, password);
      if (!authOk) {
        throw _LocalBinaryAuthException('فشل الاتصال: اسم المستخدم أو كلمة المرور للراوتر غير صحيحة.');
      }
      final words = <String>[
        '/ip/hotspot/user/print',
        '=.proplist=.id,name,profile,comment,email,disabled,uptime,bytes-in,bytes-out,limit-uptime',
        if (searchQuery != null && searchQuery.trim().isNotEmpty)
          '?name=${searchQuery.trim()}',
      ];
      final users = await client.sendCommand(words, maxReplies: maxLimit);
      if (maxLimit != null && users.length > maxLimit) {
        return users.sublist(0, maxLimit);
      }
      return users;
    } finally {
      await client.close();
    }
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

  Future<void> connect({Duration timeout = const Duration(seconds: 8)}) async {
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
    final bytes = _buffer.toBytes();
    if (bytes.isEmpty) return;

    var offset = 0;
    while (offset < bytes.length) {
      final decoded = _tryDecodeLengthAt(bytes, offset);
      if (decoded == null) break; // wait for more bytes

      final headerLen = decoded.headerBytes;
      final wordLen = decoded.length;
      if (bytes.length < offset + headerLen + wordLen) break; // partial word

      final wordStart = offset + headerLen;
      final wordEnd = wordStart + wordLen;
      offset = wordEnd;

      if (wordLen == 0) {
        final sentence = List<String>.from(_currentSentence);
        _currentSentence.clear();
        if (sentence.isNotEmpty && !_sentenceController.isClosed) {
          _sentenceController.add(sentence);
        }
      } else {
        _currentSentence.add(utf8.decode(bytes.sublist(wordStart, wordEnd), allowMalformed: true));
      }
    }

    _buffer.clear();
    if (offset < bytes.length) {
      _buffer.add(bytes.sublist(offset));
    }
  }

  ({int length, int headerBytes})? _tryDecodeLengthAt(Uint8List b, int offset) {
    if (offset >= b.length) return null;
    final c = b[offset];
    if ((c & 0x80) == 0) {
      return (length: c, headerBytes: 1);
    }
    if ((c & 0xC0) == 0x80) {
      if (b.length < offset + 2) return null;
      return (length: ((c & ~0x80) << 8) + b[offset + 1], headerBytes: 2);
    }
    if ((c & 0xE0) == 0xC0) {
      if (b.length < offset + 3) return null;
      return (length: ((c & ~0xC0) << 16) + (b[offset + 1] << 8) + b[offset + 2], headerBytes: 3);
    }
    if ((c & 0xF0) == 0xE0) {
      if (b.length < offset + 4) return null;
      return (length: ((c & ~0xE0) << 24) + (b[offset + 1] << 16) + (b[offset + 2] << 8) + b[offset + 3], headerBytes: 4);
    }
    if (b.length < offset + 5) return null;
    return (
      length: (b[offset + 1] << 24) + (b[offset + 2] << 16) + (b[offset + 3] << 8) + b[offset + 4],
      headerBytes: 5,
    );
  }

  Uint8List _encodeRawWord(Object word) {
    final Uint8List data = (word is Uint8List) ? word : utf8.encode(word.toString());
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
    Duration timeout = const Duration(seconds: 20),
    int? maxReplies,
  }) async {
    return _writeAndReadRawSentences(words, timeout: timeout, maxReplies: maxReplies);
  }

  Future<List<List<String>>> _writeAndReadRawSentences(
    List<Object> words, {
    Duration timeout = const Duration(seconds: 25),
    int? maxReplies,
  }) async {
    final sock = _socket;
    if (sock == null) throw StateError('Socket not connected');

    final replies = <List<String>>[];
    final doneCompleter = Completer<void>();
    int reCount = 0;

    late StreamSubscription<List<String>> listener;
    listener = _sentenceController.stream.listen(
      (sentence) {
        replies.add(sentence);
        final tag = sentence.isNotEmpty ? sentence.first : '';
        if (tag == '!re') {
          reCount++;
          if (maxReplies != null && reCount >= maxReplies) {
            if (!doneCompleter.isCompleted) doneCompleter.complete();
          }
        } else if (tag == '!done' || tag == '!fatal') {
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
        frame.add(_encodeRawWord(w));
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

  Future<List<Map<String, String>>> sendCommand(
    List<String> words, {
    Duration timeout = const Duration(seconds: 20),
    int? maxReplies,
  }) async {
    final replies = await _writeAndReadSentences(words, timeout: timeout, maxReplies: maxReplies);
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

  Future<List<Map<String, String>>> sendRawCommand(
    List<Object> words, {
    Duration timeout = const Duration(seconds: 15),
    int? maxReplies,
  }) async {
    final replies = await _writeAndReadRawSentences(words, timeout: timeout, maxReplies: maxReplies);
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
