import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../constants/api_endpoints.dart';
import '../models/router_provisioning_models.dart';
import '../network/api_client.dart';
import '../providers.dart';

class RouterProvisioningService {
  final ApiClient _apiClient;

  RouterProvisioningService(this._apiClient);

  /// Unwraps NestJS TransformInterceptor `{ success, data, timestamp }` response
  /// envelopes cleanly while preserving direct/unwrapped payloads.
  Map<String, dynamic>? _unwrapResponseMap(dynamic raw) {
    dynamic normalized = raw;
    if (normalized is String && normalized.trim().isNotEmpty) {
      try {
        normalized = jsonDecode(normalized);
      } catch (_) {
        return null;
      }
    }
    if (normalized is! Map) return null;

    final outer = Map<String, dynamic>.from(normalized);
    if (outer.containsKey('data')) {
      final inner = outer['data'];
      if (inner is Map) {
        return Map<String, dynamic>.from(inner);
      }
      return null;
    }
    return outer;
  }

  /// 1. Discover live interfaces, IP addresses, bridges, and services on the router
  Future<RouterDiscoverySnapshotModel> discover(String deviceId) async {
    try {
      final res = await _apiClient.get(ApiEndpoints.deviceProvisionDiscover(deviceId));
      final payloadMap = _unwrapResponseMap(res.data);
      if (payloadMap != null) {
        return RouterDiscoverySnapshotModel.fromJson(payloadMap);
      }
      throw Exception('استجابة غير متوقعة من الخادم أثناء استكشاف الراوتر');
    } catch (e) {
      throw _parseError(e, defaultMsg: 'فشل استكشاف منافذ وشبكة الراوتر');
    }
  }

  /// 1.1 Sync client-discovered network snapshot to server cache
  Future<void> syncSnapshot(String deviceId, RouterDiscoverySnapshotModel snapshot) async {
    try {
      await _apiClient.post(
        ApiEndpoints.deviceProvisionDiscover(deviceId),
        data: snapshot.toJson(),
      );
    } catch (_) {
      // Non-blocking sync attempt
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
        options: Options(
          sendTimeout: const Duration(seconds: 60),
          receiveTimeout: const Duration(seconds: 60),
        ),
      );
      final payloadMap = _unwrapResponseMap(res.data);
      if (payloadMap != null) {
        return ProvisionPreviewResponse.fromJson(payloadMap);
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
        options: Options(
          sendTimeout: const Duration(seconds: 90),
          receiveTimeout: const Duration(seconds: 90),
        ),
      );
      final payloadMap = _unwrapResponseMap(res.data);
      if (payloadMap != null) {
        return ProvisionApplyResult.fromJson(payloadMap);
      }
      throw Exception('استجابة غير متوقعة أثناء تطبيق البرمجة على الراوتر');
    } catch (e) {
      throw _parseError(e, defaultMsg: 'فشل تنفيذ إعدادات وبرمجة الراوتر');
    }
  }

  Exception _parseError(dynamic e, {required String defaultMsg}) {
    if (e is DioException) {
      final statusCode = e.response?.statusCode;
      final parsed = parseApiError(
        e,
        fallback: defaultMsg,
        networkMessage:
            'تعذر الوصول إلى سيرفر النظام — تأكد من توفر اتصال بالإنترنت على الهاتف ثم أعد المحاولة.',
      );

      if (statusCode == 401) {
        return Exception('انتهت جلسة تسجيل الدخول. يرجى إعادة تسجيل الدخول مجددًا.');
      } else if (statusCode == 403) {
        return Exception(parsed.message != defaultMsg
            ? parsed.message
            : 'غير مصرح: باقة الاشتراك الحالية لا تسمح ببرمجة أو إضافة هذا الراوتر.');
      } else if (statusCode == 404) {
        return Exception('لم يتم العثور على جهاز الراوتر المحدد في النظام.');
      } else if (statusCode == 409) {
        return Exception(parsed.message != defaultMsg
            ? parsed.message
            : 'يوجد تعارض في إعدادات الراوتر المختارة. راجع تفاصيل المعاينة.');
      } else if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.sendTimeout) {
        return Exception(
          'استغرق فحص المعاينة وقتاً أطول من المتوقع (انتهت المهلة). '
          'إذا كان الراوتر مبرمجاً مسبقاً ويحتوي على جداول شبكية كبيرة، '
          'يرجى الضغط على "إعادة فحص المعاينة" لإعادة المحاولة.',
        );
      } else {
        return Exception(parsed.message);
      }
    }
    return Exception(e.toString().replaceFirst('Exception: ', defaultMsg.isNotEmpty ? '$defaultMsg: ' : ''));
  }
}

final routerProvisioningServiceProvider = Provider<RouterProvisioningService>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return RouterProvisioningService(apiClient);
});
