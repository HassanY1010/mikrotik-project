import 'dart:typed_data';
import 'package:dio/dio.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/api_client.dart';
import '../../../core/services/backup_downloader.dart';
import '../models/auto_provisioning_models.dart';

class AutoProvisioningService {
  final ApiClient apiClient;

  AutoProvisioningService({required this.apiClient});

  dynamic _unwrap(dynamic raw) {
    if (raw is Map<String, dynamic> && raw.containsKey('data')) {
      return raw['data'];
    }
    return raw;
  }

  Map<String, dynamic> _asMap(dynamic raw) {
    final val = _unwrap(raw);
    if (val is Map<String, dynamic>) return val;
    if (val is Map) return Map<String, dynamic>.from(val);
    return <String, dynamic>{};
  }

  List<Map<String, dynamic>> _asList(dynamic raw) {
    final val = _unwrap(raw);
    if (val is List) {
      return val
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    }
    return const [];
  }

  String _extractDioError(Object e, String fallback) {
    if (e is DioException) {
      final data = e.response?.data;
      if (data is Map) {
        final msg = data['message'];
        if (msg is String && msg.trim().isNotEmpty) return msg;
        if (msg is List && msg.isNotEmpty) return msg.first.toString();
      }
      if (e.message != null && e.message!.isNotEmpty) {
        return e.message!;
      }
    }
    return fallback;
  }

  Future<AutoProvisionDiscoveryReport> discoverRouter(
    String deviceId, {
    bool forceRefresh = false,
  }) async {
    try {
      final res = await apiClient.dio.post(
        ApiEndpoints.autoProvisionDiscover(deviceId),
        queryParameters: forceRefresh ? {'refresh': 'true'} : null,
      );
      return AutoProvisionDiscoveryReport.fromJson(_asMap(res.data));
    } catch (e) {
      throw Exception(_extractDioError(e, 'فشل اكتشاف إمكانيات وإعدادات الراوتر.'));
    }
  }

  Future<AutoProvisionCapabilities> getCapabilities(
    String deviceId, {
    bool forceRefresh = false,
  }) async {
    try {
      final res = await apiClient.dio.get(
        ApiEndpoints.autoProvisionCapabilities(deviceId),
        queryParameters: forceRefresh ? {'refresh': 'true'} : null,
      );
      final map = _asMap(res.data);
      final caps = map['capabilities'] is Map<String, dynamic>
          ? map['capabilities'] as Map<String, dynamic>
          : map;
      return AutoProvisionCapabilities.fromJson(caps);
    } catch (e) {
      throw Exception(_extractDioError(e, 'فشل جلب مصفوفة قدرات الراوتر.'));
    }
  }

  Future<AutoProvisionPlanPreview> buildPlanPreview(
    String deviceId,
    Map<String, dynamic> configPayload,
  ) async {
    try {
      final res = await apiClient.dio.post(
        ApiEndpoints.autoProvisionPreview(deviceId),
        data: configPayload,
      );
      return AutoProvisionPlanPreview.fromJson(_asMap(res.data));
    } catch (e) {
      throw Exception(_extractDioError(e, 'فشل توليد معاينة خطة البرمجة والتحقق من الأمان.'));
    }
  }

  Future<AutoProvisionOperationModel> applyProvisioning(
    String deviceId,
    Map<String, dynamic> applyPayload, {
    bool syncExecution = false,
  }) async {
    try {
      final res = await apiClient.dio.post(
        ApiEndpoints.autoProvisionApply(deviceId),
        queryParameters: syncExecution ? {'sync': 'true'} : null,
        data: applyPayload,
      );
      return AutoProvisionOperationModel.fromJson(_asMap(res.data));
    } catch (e) {
      throw Exception(_extractDioError(e, 'فشل بدء تنفيذ خطة البرمجة التلقائية.'));
    }
  }

  Future<AutoProvisionOperationModel> getOperationStatus(String operationId) async {
    try {
      final res = await apiClient.dio.get(
        ApiEndpoints.autoProvisionOperation(operationId),
      );
      return AutoProvisionOperationModel.fromJson(_asMap(res.data));
    } catch (e) {
      throw Exception(_extractDioError(e, 'تعذر تحديث حالة التنفيذ الحالية.'));
    }
  }

  Future<Map<String, dynamic>> cancelOperation(String operationId) async {
    try {
      final res = await apiClient.dio.post(
        ApiEndpoints.autoProvisionOperationCancel(operationId),
      );
      return _asMap(res.data);
    } catch (e) {
      throw Exception(_extractDioError(e, 'تعذر إرسال طلب الإيقاف الآمن.'));
    }
  }

  Future<List<AutoProvisionOperationModel>> listOperations(String deviceId) async {
    try {
      final res = await apiClient.dio.get(
        ApiEndpoints.autoProvisionOperations(deviceId),
      );
      return _asList(res.data)
          .map(AutoProvisionOperationModel.fromJson)
          .toList();
    } catch (e) {
      throw Exception(_extractDioError(e, 'تعذر تحميل سجل عمليات البرمجة السابقة.'));
    }
  }

  Future<List<AutoProvisionBackupItem>> listBackups(String deviceId) async {
    try {
      final res = await apiClient.dio.get(
        ApiEndpoints.autoProvisionBackups(deviceId),
      );
      return _asList(res.data)
          .map(AutoProvisionBackupItem.fromJson)
          .toList();
    } catch (e) {
      throw Exception(_extractDioError(e, 'تعذر تحميل قائمة النسخ الاحتياطية.'));
    }
  }

  Future<Map<String, dynamic>> createBackupBundle(
    String deviceId, {
    String? backupName,
    String? password,
    bool includeRscExport = true,
  }) async {
    try {
      final res = await apiClient.dio.post(
        ApiEndpoints.autoProvisionBackup(deviceId),
        data: {
          if (backupName != null && backupName.trim().isNotEmpty)
            'backupName': backupName.trim(),
          if (password != null && password.trim().isNotEmpty)
            'password': password.trim(),
          'includeRscExport': includeRscExport,
        },
      );
      return _asMap(res.data);
    } catch (e) {
      throw Exception(_extractDioError(e, 'فشل إنشاء النسخة الاحتياطية قبل التعديل.'));
    }
  }

  Future<String> downloadAndSaveBackup(AutoProvisionBackupItem backup) async {
    try {
      final response = await apiClient.dio.get<List<int>>(
        ApiEndpoints.autoProvisionBackupDownload(backup.id),
        options: Options(responseType: ResponseType.bytes),
      );
      final bytes = Uint8List.fromList(response.data ?? const <int>[]);
      return await saveBackupLocally(backup.fileName, bytes);
    } catch (e) {
      throw Exception(_extractDioError(e, 'تعذر تنزيل وحفظ النسخة الاحتياطية على الجهاز.'));
    }
  }

  Future<void> shareDownloadedBackup(String filePath, String fileName) async {
    await shareBackupFile(filePath, fileName);
  }

  Future<Map<String, dynamic>> restoreBackup(
    String deviceId, {
    required String backupId,
    String? password,
    bool acknowledgeCompatibilityRisk = false,
  }) async {
    try {
      final res = await apiClient.dio.post(
        ApiEndpoints.autoProvisionRestore(deviceId),
        data: {
          'backupId': backupId,
          if (password != null && password.trim().isNotEmpty) 'password': password.trim(),
          'confirmed': true,
          'acknowledgeReboot': true,
          'acknowledgeDisconnect': true,
          'acknowledgeCompatibilityRisk': acknowledgeCompatibilityRisk,
        },
      );
      return _asMap(res.data);
    } catch (e) {
      throw Exception(_extractDioError(e, 'فشل بدء استعادة النسخة الاحتياطية.'));
    }
  }
}
