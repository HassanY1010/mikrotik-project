import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../constants/api_endpoints.dart';
import '../models/router_provisioning_models.dart';
import '../network/api_client.dart';
import '../providers.dart';

class RouterProvisioningService {
  final ApiClient _apiClient;

  RouterProvisioningService(this._apiClient);

  /// 1. Discover live interfaces, IP addresses, bridges, and services on the router
  Future<RouterDiscoverySnapshotModel> discover(String deviceId) async {
    try {
      final res = await _apiClient.get(ApiEndpoints.deviceProvisionDiscover(deviceId));
      final raw = res.data;
      if (raw is Map<String, dynamic>) {
        return RouterDiscoverySnapshotModel.fromJson(raw);
      }
      throw Exception('استجابة غير متوقعة من الخادم أثناء استكشاف الراوتر');
    } catch (e) {
      throw _parseError(e, defaultMsg: 'فشل استكشاف منافذ وشبكة الراوتر');
    }
  }

  /// 2. Generate a non-destructive preview with conflict checks and RouterOS commands
  Future<ProvisionPreviewResponse> preview(
    String deviceId,
    Map<String, dynamic> payload,
  ) async {
    try {
      final res = await _apiClient.post(
        ApiEndpoints.deviceProvisionPreview(deviceId),
        data: payload,
      );
      final raw = res.data;
      if (raw is Map<String, dynamic>) {
        return ProvisionPreviewResponse.fromJson(raw);
      }
      throw Exception('استجابة غير متوقعة أثناء توليد المعاينة');
    } catch (e) {
      throw _parseError(e, defaultMsg: 'فشل فحص إعدادات المعاينة وكشف التعارضات');
    }
  }

  /// 3. Safely execute router provisioning with pre-backup and multi-point verification
  Future<ProvisionApplyResult> apply(
    String deviceId,
    Map<String, dynamic> payload,
  ) async {
    try {
      final res = await _apiClient.post(
        ApiEndpoints.deviceProvisionApply(deviceId),
        data: payload,
      );
      final raw = res.data;
      if (raw is Map<String, dynamic>) {
        return ProvisionApplyResult.fromJson(raw);
      }
      throw Exception('استجابة غير متوقعة أثناء تطبيق البرمجة على الراوتر');
    } catch (e) {
      throw _parseError(e, defaultMsg: 'فشل تنفيذ إعدادات وبرمجة الراوتر');
    }
  }

  Exception _parseError(dynamic e, {required String defaultMsg}) {
    if (e is DioException) {
      final statusCode = e.response?.statusCode;
      final data = e.response?.data;

      String serverMessage = '';
      if (data is Map) {
        serverMessage = data['message']?.toString() ??
            (data['error'] is Map ? data['error']['message']?.toString() : data['error']?.toString()) ??
            '';
      }

      if (statusCode == 401) {
        return Exception('انتهت جلسة تسجيل الدخول. يرجى إعادة تسجيل الدخول مجددًا.');
      } else if (statusCode == 403) {
        return Exception(serverMessage.isNotEmpty
            ? serverMessage
            : 'غير مصرح: باقة الاشتراك الحالية لا تسمح ببرمجة أو إضافة هذا الراوتر.');
      } else if (statusCode == 404) {
        return Exception('لم يتم العثور على جهاز الراوتر المحدد في النظام.');
      } else if (statusCode == 409) {
        return Exception(serverMessage.isNotEmpty
            ? serverMessage
            : 'يوجد تعارض في إعدادات الراوتر المختارة. راجع تفاصيل المعاينة.');
      } else if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.sendTimeout) {
        return Exception('انتهت مهلة الاتصال بالخادم. تحقق من اتصال الإنترنت ثم أعد المحاولة.');
      } else if (serverMessage.isNotEmpty) {
        return Exception(serverMessage);
      }
    }
    return Exception(e.toString().replaceFirst('Exception: ', defaultMsg.isNotEmpty ? '$defaultMsg: ' : ''));
  }
}

final routerProvisioningServiceProvider = Provider<RouterProvisioningService>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return RouterProvisioningService(apiClient);
});
