import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'models/models.dart';
import 'network/api_client.dart';
import 'storage/local_storage.dart';
import 'sync/offline_sync_manager.dart';
import 'constants/api_endpoints.dart';
import 'services/backup_downloader.dart';
import 'services/card_template_import_service.dart';

// Initialized at main startup
final localStorageProvider = Provider<LocalStorage>((ref) {
  throw UnimplementedError();
});

// App Theme Mode Notifier (supports 'dark', 'light', 'system', defaults to 'dark')
class ThemeModeNotifier extends Notifier<ThemeMode> {
  @override
  ThemeMode build() {
    final storage = ref.watch(localStorageProvider);
    final saved = storage.getThemeMode();
    switch (saved) {
      case 'light':
        return ThemeMode.light;
      case 'system':
        return ThemeMode.system;
      case 'dark':
      default:
        return ThemeMode.dark;
    }
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    state = mode;
    final storage = ref.read(localStorageProvider);
    final str = mode == ThemeMode.light
        ? 'light'
        : mode == ThemeMode.system
            ? 'system'
            : 'dark';
    await storage.setThemeMode(str);
  }

  Future<void> toggleTheme() async {
    if (state == ThemeMode.light) {
      await setThemeMode(ThemeMode.dark);
    } else {
      await setThemeMode(ThemeMode.light);
    }
  }
}

final themeModeProvider = NotifierProvider<ThemeModeNotifier, ThemeMode>(ThemeModeNotifier.new);

final apiClientProvider = Provider<ApiClient>((ref) {
  final storage = ref.watch(localStorageProvider);
  return ApiClient(
    localStorage: storage,
    onSessionExpired: () {
      ref.read(currentUserProvider.notifier).setUser(null);
    },
  );
});

final syncManagerProvider = Provider<OfflineSyncManager>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  final storage = ref.watch(localStorageProvider);
  return OfflineSyncManager(apiClient: apiClient, localStorage: storage);
});

// Auth user state notifier
class CurrentUserNotifier extends Notifier<AuthUser?> {
  @override
  AuthUser? build() {
    final storage = ref.watch(localStorageProvider);
    return storage.getUser();
  }

  void setUser(AuthUser? user) {
    state = user;
    if (user == null) {
      ref.invalidate(tenantQuotaProvider);
    }
  }

  Future<void> fetchMe() async {
    final apiClient = ref.read(apiClientProvider);
    final storage = ref.read(localStorageProvider);
    try {
      final res = await apiClient.get(ApiEndpoints.authMe);
      final raw = res.data;
      final data = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
      if (data is Map<String, dynamic>) {
        final updatedUser = AuthUser.fromJson(data);
        await storage.setUser(updatedUser);
        state = updatedUser;
        ref.read(tenantQuotaProvider.notifier).fetchFresh(updatedUser.tenantId);
      }
    } catch (_) {}
  }

  Future<Map<String, dynamic>> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.post(
        ApiEndpoints.changePassword,
        data: {
          'currentPassword': currentPassword,
          'newPassword': newPassword,
        },
      );
      final raw = res.data;
      if (raw is Map<String, dynamic>) {
        return raw;
      }
      return {'success': true, 'message': 'تم تغيير كلمة المرور بنجاح'};
    } catch (e) {
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        return {
          'success': false,
          'message': err['message']?.toString() ?? 'كلمة المرور الحالية غير صحيحة',
        };
      }
      return {
        'success': false,
        'message': 'تعذر الاتصال بالخادم لتغيير كلمة المرور',
      };
    }
  }

  Future<Map<String, dynamic>> deleteAccount({
    required String password,
    String? reason,
    bool? confirmDeleteOrganization,
  }) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.delete(
        ApiEndpoints.deleteAccount,
        data: {
          'password': password,
          if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
          if (confirmDeleteOrganization == true) 'confirmDeleteOrganization': true,
        },
      );
      final raw = res.data;
      if (raw is Map<String, dynamic>) {
        return raw;
      }
      return {'success': true, 'message': 'تم حذف الحساب بنجاح'};
    } catch (e) {
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        return {
          'success': false,
          'message': err['message']?.toString() ?? 'فشل حذف الحساب',
        };
      }
      return {
        'success': false,
        'message': 'تعذر الاتصال بالخادم لحذف الحساب',
      };
    }
  }
}

final currentUserProvider = NotifierProvider<CurrentUserNotifier, AuthUser?>(
  CurrentUserNotifier.new,
);

// Online / Offline mode state notifier
class IsOnlineModeNotifier extends Notifier<bool> {
  @override
  bool build() => true;

  void setMode(bool isOnline) {
    state = isOnline;
  }

  Future<bool> checkHealth() async {
    final syncManager = ref.read(syncManagerProvider);
    final isHealthy = await syncManager.checkServerHealth();
    state = isHealthy;
    return isHealthy;
  }
}

final isOnlineModeProvider = NotifierProvider<IsOnlineModeNotifier, bool>(
  IsOnlineModeNotifier.new,
);

// Reserved Cards list state notifier
class OfflineCardsNotifier extends Notifier<List<OfflineCardModel>> {
  @override
  List<OfflineCardModel> build() {
    final storage = ref.watch(localStorageProvider);
    return storage.getOfflineCards();
  }

  void refresh() {
    final storage = ref.read(localStorageProvider);
    state = storage.getOfflineCards();
  }

  void updateStatus(String cardId, String status) {
    final storage = ref.read(localStorageProvider);
    storage.updateCardStatus(cardId, status);
    refresh();
  }
}

final offlineCardsProvider = NotifierProvider<OfflineCardsNotifier, List<OfflineCardModel>>(
  OfflineCardsNotifier.new,
);

// Server available cards count state notifier
class ServerAvailableCardsNotifier extends Notifier<int> {
  @override
  int build() {
    final storage = ref.watch(localStorageProvider);
    return storage.getServerAvailableCards();
  }

  void refresh() {
    final storage = ref.read(localStorageProvider);
    state = storage.getServerAvailableCards();
  }

  void setCount(int count) {
    final storage = ref.read(localStorageProvider);
    storage.setServerAvailableCards(count);
    state = count;
  }
}

final serverAvailableCardsProvider = NotifierProvider<ServerAvailableCardsNotifier, int>(
  ServerAvailableCardsNotifier.new,
);

// Pending mutations list state notifier
class PendingMutationsNotifier extends Notifier<List<OfflineMutationModel>> {
  @override
  List<OfflineMutationModel> build() {
    final storage = ref.watch(localStorageProvider);
    return storage.getMutations();
  }

  void refresh() {
    final storage = ref.read(localStorageProvider);
    state = storage.getMutations();
  }
}

final pendingMutationsProvider = NotifierProvider<PendingMutationsNotifier, List<OfflineMutationModel>>(
  PendingMutationsNotifier.new,
);

// Cached profiles list state notifier
class CachedProfilesNotifier extends Notifier<List<HotspotProfileModel>> {
  @override
  List<HotspotProfileModel> build() {
    final storage = ref.watch(localStorageProvider);
    return storage.getCachedProfiles();
  }

  Future<void> fetchProfiles() async {
    final apiClient = ref.read(apiClientProvider);
    final storage = ref.read(localStorageProvider);
    try {
      final response = await apiClient.get(ApiEndpoints.hotspotProfiles);
      final raw = response.data;
      final payload = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
      List list = [];
      if (payload is List) {
        list = payload;
      } else if (raw is List) {
        list = raw;
      }

      if (list.isNotEmpty) {
        final profiles = list.map((p) => HotspotProfileModel.fromJson(p as Map<String, dynamic>)).toList();
        await storage.saveCachedProfiles(profiles);
        state = profiles;
        return;
      }
    } catch (_) {}

    try {
      final response = await apiClient.get(ApiEndpoints.syncPull);
      final raw = response.data;
      final payload = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
      List list = [];
      if (payload is Map && payload['profiles'] is List) {
        list = payload['profiles'] as List;
      } else if (raw is List) {
        list = raw;
      }

      if (list.isNotEmpty) {
        final profiles = list.map((p) => HotspotProfileModel.fromJson(p as Map<String, dynamic>)).toList();
        await storage.saveCachedProfiles(profiles);
        state = profiles;
        return;
      }
    } catch (_) {}

    final cached = storage.getCachedProfiles();
    if (cached.isNotEmpty) {
      state = cached;
    }
  }

  void refreshFromStorage() {
    final storage = ref.read(localStorageProvider);
    state = storage.getCachedProfiles();
  }

  Future<Map<String, dynamic>> createProfile({
    required String name,
    required String deviceId,
    String? displayName,
    String? rateLimit,
    String? sessionTimeout,
    String? validity,
    double? price,
    int? sharedUsers,
    double? dataLimitGb,
    double? dataLimitMb,
  }) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.post(
        ApiEndpoints.hotspotProfiles,
        data: {
          'name': name.trim(),
          'deviceId': deviceId,
          if (displayName != null && displayName.isNotEmpty) 'displayName': displayName.trim(),
          if (rateLimit != null && rateLimit.isNotEmpty) 'rateLimit': rateLimit.trim(),
          'sessionTimeout': sessionTimeout != null && sessionTimeout.isNotEmpty ? sessionTimeout.trim() : null,
          'validity': validity != null && validity.isNotEmpty ? validity.trim() : null,
          if (price != null) 'price': price,
          if (sharedUsers != null) 'sharedUsers': sharedUsers,
          if (dataLimitMb != null) 'dataLimitMb': dataLimitMb,
          if (dataLimitMb == null && dataLimitGb != null) 'dataLimitGb': dataLimitGb,
          if (dataLimitMb == null && dataLimitGb == null) 'dataLimitGb': null,
        },
      );
      await fetchProfiles();
      final raw = res.data;
      if (raw is Map<String, dynamic>) {
        return {'success': true, ...raw};
      }
      return {'success': true, 'message': 'تم إنشاء البروفايل ومزامنته مع الراوتر بنجاح'};
    } catch (e) {
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        final rawMsg = err['message'] ??
            (err['error'] is Map ? (err['error'] as Map)['message'] : null) ??
            err['error'];
        return {
          'success': false,
          'message': rawMsg?.toString() ?? 'فشل إنشاء البروفايل على الراوتر',
        };
      }
      return {
        'success': false,
        'message': 'تعذر الاتصال بالخادم لإنشاء البروفايل (${e.toString()})',
      };
    }
  }

  Future<Map<String, dynamic>> updateProfile({
    required String id,
    required String name,
    String? displayName,
    String? rateLimit,
    String? sessionTimeout,
    String? validity,
    double? price,
    int? sharedUsers,
    double? dataLimitGb,
    double? dataLimitMb,
    bool updateDataLimit = false,
  }) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.patch(
        ApiEndpoints.hotspotProfileItem(id),
        data: {
          'name': name.trim(),
          if (displayName != null) 'displayName': displayName.trim(),
          if (rateLimit != null) 'rateLimit': rateLimit.trim(),
          'sessionTimeout': sessionTimeout != null && sessionTimeout.isNotEmpty ? sessionTimeout.trim() : null,
          'validity': validity != null && validity.isNotEmpty ? validity.trim() : null,
          if (price != null) 'price': price,
          if (sharedUsers != null) 'sharedUsers': sharedUsers,
          if (updateDataLimit) ...{
            if (dataLimitMb != null) 'dataLimitMb': dataLimitMb,
            if (dataLimitMb == null) 'dataLimitGb': dataLimitGb,
          },
        },
      );
      await fetchProfiles();
      final raw = res.data;
      if (raw is Map<String, dynamic>) return {'success': true, ...raw};
      return {'success': true, 'message': 'تم تعديل البروفايل بنجاح'};
    } catch (e) {
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        final rawMsg = err['message'] ??
            (err['error'] is Map ? (err['error'] as Map)['message'] : null) ??
            err['error'];
        return {
          'success': false,
          'message': rawMsg?.toString() ?? 'فشل تعديل البروفايل',
        };
      }
      return {'success': false, 'message': 'تعذر الاتصال بالخادم'};
    }
  }

  Future<Map<String, dynamic>> deleteProfile(String id) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.delete(ApiEndpoints.hotspotProfileItem(id));
      await fetchProfiles();
      final raw = res.data;
      if (raw is Map<String, dynamic>) return {'success': true, ...raw};
      return {'success': true, 'message': 'تم حذف البروفايل بنجاح'};
    } catch (e) {
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        final rawMsg = err['message'] ??
            (err['error'] is Map ? (err['error'] as Map)['message'] : null) ??
            err['error'];
        return {
          'success': false,
          'message': rawMsg?.toString() ?? 'فشل حذف البروفايل',
        };
      }
      return {'success': false, 'message': 'تعذر الاتصال بالخادم لحذف البروفايل'};
    }
  }

  Future<Map<String, dynamic>> syncProfilesWithRouter(String deviceId) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.post('/devices/$deviceId/hotspot/profiles/sync');
      await fetchProfiles();
      final raw = res.data;
      if (raw is Map<String, dynamic>) return {'success': true, ...raw};
      return {'success': true, 'message': 'تمت مزامنة البروفايلات مع الراوتر بنجاح'};
    } catch (e) {
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        return {
          'success': false,
          'message': err['message']?.toString() ?? 'فشل مزامنة البروفايلات',
        };
      }
      return {'success': false, 'message': 'تعذر الاتصال بالخادم لمزامنة الراوتر'};
    }
  }
}

final profilesProvider = NotifierProvider<CachedProfilesNotifier, List<HotspotProfileModel>>(
  CachedProfilesNotifier.new,
);

// Selected Router ID state notifier
class SelectedRouterNotifier extends Notifier<String?> {
  @override
  String? build() {
    final storage = ref.watch(localStorageProvider);
    return storage.getSelectedRouterId();
  }

  void select(String? id) {
    state = id;
    final storage = ref.read(localStorageProvider);
    storage.setSelectedRouterId(id);
  }
}

final selectedRouterIdProvider = NotifierProvider<SelectedRouterNotifier, String?>(
  SelectedRouterNotifier.new,
);

// Routers List AsyncNotifier
class RoutersNotifier extends AsyncNotifier<List<RouterDeviceModel>> {
  bool _isUsingCachedData = false;
  bool get isUsingCachedData => _isUsingCachedData;

  @override
  Future<List<RouterDeviceModel>> build() async {
    return _fetch();
  }

  Future<List<RouterDeviceModel>> _fetch() async {
    final apiClient = ref.read(apiClientProvider);
    final storage = ref.read(localStorageProvider);
    final cached = storage.getCachedRouters();

    try {
      final res = await apiClient.get(ApiEndpoints.devices);
      final raw = res.data;
      final list = (raw is Map && raw['data'] != null) ? raw['data'] : (raw is List ? raw : []);
      if (list is List) {
        final devices = list.map((d) => RouterDeviceModel.fromJson(d as Map<String, dynamic>)).toList();
        await storage.saveCachedRouters(devices);
        _isUsingCachedData = false;

        // Reconcile active router selection
        final currentSelectedId = ref.read(selectedRouterIdProvider);
        if (devices.isNotEmpty) {
          final hasMatch = currentSelectedId != null && devices.any((d) => d.id == currentSelectedId);
          if (!hasMatch) {
            ref.read(selectedRouterIdProvider.notifier).select(devices.first.id);
          }
        } else if (devices.isEmpty && currentSelectedId != null) {
          ref.read(selectedRouterIdProvider.notifier).select(null);
        }

        return devices;
      }
    } catch (e) {
      // If it's a 401/403 Unauthorized, rethrow so session/auth handler processes it
      if (e is DioException && (e.response?.statusCode == 401 || e.response?.statusCode == 403)) {
        rethrow;
      }
      // If network or server error occurs, fallback to cached routers if present
      if (cached.isNotEmpty) {
        _isUsingCachedData = true;
        return cached;
      }
      rethrow;
    }
    _isUsingCachedData = false;
    return cached;
  }

  Future<void> refresh() async {
    try {
      final fresh = await _fetch();
      state = AsyncValue.data(fresh);
    } catch (e, st) {
      // If we already hold routers, preserve them non-destructively
      if (state.hasValue && state.value!.isNotEmpty) {
        // preserve current state without wiping out
      } else {
        state = AsyncValue.error(e, st);
      }
    }
  }

  Future<Map<String, dynamic>> testConnectionDirect(Map<String, dynamic> data) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.post(ApiEndpoints.deviceTestConnection, data: data);
      final raw = res.data;
      if (raw is Map<String, dynamic>) {
        return raw;
      }
      return {'success': true, 'message': 'تم الاتصال بنجاح'};
    } catch (e) {
      if (e is DioException && e.response?.data is Map) {
        return Map<String, dynamic>.from(e.response!.data as Map);
      }
      return {
        'success': false,
        'message': 'تعذر الاتصال بالخادم لاختبار الراوتر (${e.toString()})',
      };
    }
  }

  Future<Map<String, dynamic>> saveRouter(Map<String, dynamic> data, {String? id}) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = id != null
          ? await apiClient.patch(ApiEndpoints.deviceItem(id), data: data)
          : await apiClient.post(ApiEndpoints.devices, data: data);
      await refresh();
      return {'success': true, 'data': res.data};
    } catch (e) {
      String errorMsg = 'فشل حفظ بيانات الراوتر في السيرفر';
      if (e is DioException && e.response?.data is Map) {
        final map = e.response!.data as Map;
        errorMsg = map['message']?.toString() ?? errorMsg;
      }
      return {'success': false, 'message': errorMsg};
    }
  }

  Future<Map<String, dynamic>> toggleEmergencyLock(String deviceId, bool lock) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.post(
        ApiEndpoints.deviceEmergencyLock(deviceId),
        data: {'locked': lock, 'lock': lock},
      );
      await refresh();
      final resData = res.data;
      final msg = (resData is Map && resData['message'] != null)
          ? resData['message'].toString()
          : (lock ? 'تم تفعيل قفل الطوارئ بنجاح' : 'تم إلغاء قفل الطوارئ بنجاح');
      return {'success': true, 'message': msg};
    } catch (e) {
      String msg = 'فشل تطبيق قفل الطوارئ على الراوتر';
      if (e is DioException) {
        final d = e.response?.data;
        if (d is Map) {
          if (d['message'] != null) {
            msg = d['message'].toString();
          } else if (d['error'] != null) {
            msg = d['error'].toString();
          }
        }
      }
      return {'success': false, 'message': msg};
    }
  }

  Future<Map<String, dynamic>> toggleAntiTethering(String deviceId, bool enable) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.post(
        ApiEndpoints.deviceAntiTethering(deviceId),
        data: {'enabled': enable, 'enable': enable},
      );
      await refresh();
      final resData = res.data;
      final msg = (resData is Map && resData['message'] != null)
          ? resData['message'].toString()
          : (enable ? 'تم تفعيل حظر البث (TTL=1) بنجاح' : 'تم تعطيل حظر البث بنجاح');
      return {'success': true, 'message': msg};
    } catch (e) {
      String msg = 'فشل تطبيق قاعدة حظر البث على الراوتر';
      if (e is DioException) {
        final d = e.response?.data;
        if (d is Map) {
          if (d['message'] != null) {
            msg = d['message'].toString();
          } else if (d['error'] != null) {
            msg = d['error'].toString();
          }
        }
      }
      return {'success': false, 'message': msg};
    }
  }

  Future<Map<String, dynamic>> testConnection(String deviceId) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.post(ApiEndpoints.deviceTest(deviceId));
      await refresh();
      final data = res.data;
      final isSuccess = (data is Map && data['success'] == true) || res.statusCode == 200;
      final msg = (data is Map && data['message'] != null)
          ? data['message'].toString()
          : (isSuccess ? 'تم الاتصال بالراوتر بنجاح' : 'فشل فحص الاتصال بالراوتر');
      final latency = (data is Map && data['latencyMs'] != null) ? data['latencyMs'] : null;
      return {
        'success': isSuccess,
        'message': msg,
        'latencyMs': latency,
      };
    } catch (e) {
      String msg = 'تعذر الاتصال بالخادم لاختبار الراوتر';
      if (e is DioException && e.response?.data is Map) {
        final d = e.response!.data as Map;
        msg = d['message']?.toString() ?? msg;
      }
      return {'success': false, 'message': msg};
    }
  }

  Future<Map<String, dynamic>> createBackup(
    String deviceId, {
    String? backupName,
    String? password,
  }) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final payload = <String, dynamic>{};
      if (backupName != null && backupName.trim().isNotEmpty) {
        payload['name'] = backupName.trim();
      }
      if (password != null && password.trim().isNotEmpty) {
        payload['password'] = password.trim();
      }

      final res = await apiClient.post(
        ApiEndpoints.deviceBackup(deviceId),
        data: payload,
      );

      final data = res.data;
      final isSuccess = (data is Map && data['success'] == true) ||
          res.statusCode == 200 ||
          res.statusCode == 201;
      final msg = (data is Map && data['message'] != null)
          ? data['message'].toString()
          : (isSuccess ? 'تم إنشاء النسخة الاحتياطية بنجاح' : 'فشل إنشاء النسخة الاحتياطية');
      final backupInfo = (data is Map && data['backup'] is Map)
          ? Map<String, dynamic>.from(data['backup'] as Map)
          : null;

      return {
        'success': isSuccess,
        'message': msg,
        'backup': backupInfo,
      };
    } catch (e) {
      String msg = 'فشل إنشاء النسخة الاحتياطية للراوتر';
      if (e is DioException) {
        final d = e.response?.data;
        if (d is Map) {
          if (d['message'] != null) {
            msg = d['message'].toString();
          } else if (d['error'] != null) {
            final errObj = d['error'];
            msg = (errObj is Map && errObj['message'] != null)
                ? errObj['message'].toString()
                : errObj.toString();
          }
        } else if (e.message != null && e.message!.isNotEmpty) {
          msg = e.message!;
        }
      } else {
        msg = e.toString();
      }
      return {'success': false, 'message': msg};
    }
  }

  Future<List<Map<String, dynamic>>> listBackups(String deviceId) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.get(ApiEndpoints.deviceBackups(deviceId));
      final data = res.data;
      final list = (data is Map && data['data'] is List)
          ? data['data'] as List
          : (data is List ? data : []);
      return list.map((item) => Map<String, dynamic>.from(item as Map)).toList();
    } catch (e) {
      return [];
    }
  }

  Future<Map<String, dynamic>> downloadBackup(
    String deviceId,
    String filename,
  ) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.dio.get<List<int>>(
        ApiEndpoints.deviceBackupDownload(deviceId, filename),
        options: Options(responseType: ResponseType.bytes),
      );
      final bytes = res.data;
      if (bytes != null && bytes.isNotEmpty) {
        final savedPath = await saveBackupLocally(filename, bytes);
        return {
          'success': true,
          'bytes': bytes,
          'filename': filename,
          'path': savedPath,
          'size': bytes.length,
          'message': savedPath.contains('المتصفح')
              ? 'تم بدء تنزيل النسخة في المتصفح (${(bytes.length / 1024).toStringAsFixed(1)} KB)'
              : 'تم حفظ النسخة محليًا على الجهاز (${(bytes.length / 1024).toStringAsFixed(1)} KB)',
        };
      }
      return {
        'success': false,
        'message': 'ملف النسخة الاحتياطية فارغ أو لم يتم العثور عليه',
      };
    } catch (e) {
      String msg = 'تعذر تنزيل ملف النسخة الاحتياطية من الراوتر';
      if (e is DioException) {
        final d = e.response?.data;
        if (d is Map && d['message'] != null) {
          msg = d['message'].toString();
        } else if (e.response?.statusCode == 401) {
          msg = 'فشل المصادقة مع الراوتر: تحقق من اسم المستخدم وكلمة المرور';
        } else if (e.response?.statusCode == 403) {
          msg = 'تم رفض الوصول: المستخدم لا يمتلك صلاحيات إدارة النسخ (sensitive)';
        } else if (e.response?.statusCode == 404) {
          msg = 'الملف غير موجود على الراوتر';
        } else if (e.message != null && e.message!.isNotEmpty) {
          msg = e.message!;
        }
      } else {
        msg = e.toString().replaceFirst('Exception: ', '');
      }
      return {'success': false, 'message': msg};
    }
  }

  Future<Map<String, dynamic>> restoreBackup(
    String deviceId,
    String filename, {
    String? password,
    required bool confirmed,
  }) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.post(
        ApiEndpoints.deviceBackupRestore(deviceId),
        data: {
          'filename': filename,
          if (password != null && password.isNotEmpty) 'password': password,
          'confirmed': confirmed,
        },
      );
      final data = res.data;
      final payload = (data is Map && data['data'] is Map)
          ? data['data'] as Map
          : (data is Map ? data : {});
      return {
        'success': payload['success'] == true,
        'message': payload['message']?.toString() ??
            'تم إرسال أمر استعادة النسخة الاحتياطية بنجاح، جاري إعادة تشغيل الراوتر',
        'rebootTriggered': payload['rebootTriggered'] == true,
      };
    } catch (e) {
      String msg = 'تعذر استعادة النسخة الاحتياطية على الراوتر';
      if (e is DioException) {
        final d = e.response?.data;
        if (d is Map && d['message'] != null) {
          msg = d['message'].toString();
        } else if (e.response?.statusCode == 409) {
          msg = 'توجد عملية جارية حالياً على هذا الراوتر، يرجى الانتظار';
        } else if (e.response?.statusCode == 400) {
          msg = 'بيانات الاستعادة غير صالحة أو لم يتم تأكيد الاستبدال الصريح';
        } else if (e.message != null && e.message!.isNotEmpty) {
          msg = e.message!;
        }
      } else {
        msg = e.toString().replaceFirst('Exception: ', '');
      }
      return {'success': false, 'message': msg};
    }
  }

  Future<void> shareDownloadedBackup(String filePath, String filename) async {
    await shareBackupFile(filePath, filename);
  }
}

final routersProvider = AsyncNotifierProvider<RoutersNotifier, List<RouterDeviceModel>>(
  RoutersNotifier.new,
);

// Radar Last Updated and Router Status Providers
class RadarLastUpdatedNotifier extends Notifier<DateTime?> {
  @override
  DateTime? build() => null;
  void update(DateTime? dt) => state = dt;
}

final radarLastUpdatedProvider = NotifierProvider<RadarLastUpdatedNotifier, DateTime?>(
  RadarLastUpdatedNotifier.new,
);

class RadarRouterStatusesNotifier extends Notifier<List<RouterConnectionStatus>> {
  @override
  List<RouterConnectionStatus> build() => [];
  void update(List<RouterConnectionStatus> list) => state = list;
}

final radarRouterStatusesProvider = NotifierProvider<RadarRouterStatusesNotifier, List<RouterConnectionStatus>>(
  RadarRouterStatusesNotifier.new,
);

// Active Sessions AsyncNotifier (Radar)
class ActiveSessionsNotifier extends AsyncNotifier<List<ActiveSessionModel>> {
  bool _isFetching = false;

  @override
  Future<List<ActiveSessionModel>> build() async {
    final selectedId = ref.watch(selectedRouterIdProvider);
    return _fetch(selectedId);
  }

  Future<List<ActiveSessionModel>> _fetch(String? deviceId) async {
    if (_isFetching) {
      return state.value ?? [];
    }
    _isFetching = true;

    try {
      final apiClient = ref.read(apiClientProvider);
      final url = deviceId != null
          ? '${ApiEndpoints.hotspotSessions}?deviceId=$deviceId'
          : ApiEndpoints.hotspotSessions;
      final res = await apiClient.get(url);
      final raw = res.data;

      // Extract metadata if available
      if (raw is Map && raw['meta'] != null) {
        final meta = raw['meta'];
        if (meta is Map) {
          if (meta['lastUpdated'] != null) {
            final parsedDate = DateTime.tryParse(meta['lastUpdated'].toString());
            if (parsedDate != null) {
              ref.read(radarLastUpdatedProvider.notifier).update(parsedDate);
            }
          }
          if (meta['routers'] is List) {
            final routerList = (meta['routers'] as List)
                .map((r) => RouterConnectionStatus.fromJson(r as Map<String, dynamic>))
                .toList();
            ref.read(radarRouterStatusesProvider.notifier).update(routerList);
          }
        }
      } else {
        ref.read(radarLastUpdatedProvider.notifier).update(DateTime.now());
      }

      final list = (raw is Map && raw['data'] != null) ? raw['data'] : (raw is List ? raw : []);
      if (list is List) {
        return list.map((s) => ActiveSessionModel.fromJson(s as Map<String, dynamic>)).toList();
      }
      return [];
    } finally {
      _isFetching = false;
    }
  }

  Future<void> refresh() async {
    if (_isFetching) return;
    final selectedId = ref.read(selectedRouterIdProvider);
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetch(selectedId));
  }

  Future<Map<String, dynamic>> kickSession(
    String sessionId, {
    String? deviceId,
    String? username,
    String? ipAddress,
  }) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final payload = <String, dynamic>{};
      if (deviceId != null) payload['deviceId'] = deviceId;
      if (username != null) payload['username'] = username;
      if (ipAddress != null) payload['ipAddress'] = ipAddress;
      final res = await apiClient.post(ApiEndpoints.hotspotKick(sessionId), data: payload);
      await refresh();
      final resData = res.data;
      final msg = (resData is Map && resData['message'] != null)
          ? resData['message'].toString()
          : 'تم فصل المستخدم بنجاح من شبكة الهوتسبوت';
      return {'success': true, 'message': msg};
    } catch (e) {
      String msg = 'فشل فصل المستخدم من الراوتر';
      if (e is DioException) {
        final d = e.response?.data;
        if (d is Map && d['error'] != null) {
          final errObj = d['error'];
          msg = (errObj is Map && errObj['message'] != null)
              ? errObj['message'].toString()
              : errObj.toString();
        } else if (d is Map && d['message'] != null) {
          msg = d['message'].toString();
        } else if (e.message != null && e.message!.isNotEmpty) {
          msg = e.message!;
        }
      } else {
        msg = e.toString();
      }
      return {'success': false, 'message': msg};
    }
  }
}

final activeSessionsProvider = AsyncNotifierProvider<ActiveSessionsNotifier, List<ActiveSessionModel>>(
  ActiveSessionsNotifier.new,
);

// Reports Period Filter
class ReportsPeriodFilterNotifier extends Notifier<String> {
  @override
  String build() => 'all_time';

  void setPeriod(String period) => state = period;
}

final reportsPeriodFilterProvider = NotifierProvider<ReportsPeriodFilterNotifier, String>(
  ReportsPeriodFilterNotifier.new,
);

class ReportsCustomDateRangeNotifier extends Notifier<DateTimeRange?> {
  @override
  DateTimeRange? build() => null;

  void setRange(DateTimeRange? range) => state = range;
}

final reportsCustomDateRangeProvider = NotifierProvider<ReportsCustomDateRangeNotifier, DateTimeRange?>(
  ReportsCustomDateRangeNotifier.new,
);

// Financial Report AsyncNotifier
class FinancialReportNotifier extends AsyncNotifier<FinancialReportModel> {
  @override
  Future<FinancialReportModel> build() async {
    final period = ref.watch(reportsPeriodFilterProvider);
    final customRange = ref.watch(reportsCustomDateRangeProvider);
    return _fetch(period: period, customRange: customRange);
  }

  Future<FinancialReportModel> _fetch({String? period, DateTimeRange? customRange}) async {
    final apiClient = ref.read(apiClientProvider);
    final p = period ?? ref.read(reportsPeriodFilterProvider);
    final range = customRange ?? ref.read(reportsCustomDateRangeProvider);

    String url = '${ApiEndpoints.financialReport}?period=$p';
    if (p == 'custom' && range != null) {
      final s = range.start.toIso8601String().split('T')[0];
      final e = range.end.toIso8601String().split('T')[0];
      url += '&startDate=$s&endDate=$e';
    }

    final res = await apiClient.get(url);
    final raw = res.data;
    final data = (raw is Map && raw['data'] != null)
        ? raw['data'] as Map<String, dynamic>
        : raw as Map<String, dynamic>;
    return FinancialReportModel.fromJson(data);
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetch());
  }
}

final financialReportProvider = AsyncNotifierProvider<FinancialReportNotifier, FinancialReportModel>(
  FinancialReportNotifier.new,
);

// Expenses AsyncNotifier
class ExpensesNotifier extends AsyncNotifier<List<ExpenseItemModel>> {
  @override
  Future<List<ExpenseItemModel>> build() async {
    return _fetch();
  }

  Future<List<ExpenseItemModel>> _fetch() async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.get('${ApiEndpoints.expenses}?limit=100');
      final raw = res.data;
      final list = (raw is Map && raw['data'] != null)
          ? (raw['data'] is Map && raw['data']['data'] != null
              ? raw['data']['data'] as List
              : raw['data'] as List)
          : (raw is List ? raw : []);
      return list.map((e) => ExpenseItemModel.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<bool> createExpense({
    required String title,
    required String category,
    required double amount,
    String? currency,
    String? vendor,
    String? description,
    String? expenseDate,
    String? paymentMethod,
  }) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      await apiClient.post(ApiEndpoints.expenses, data: {
        'title': title,
        'category': category,
        'amount': amount,
        if (currency != null) 'currency': currency,
        if (vendor != null) 'vendor': vendor,
        if (description != null) 'description': description,
        if (expenseDate != null) 'expenseDate': expenseDate,
        if (paymentMethod != null) 'paymentMethod': paymentMethod,
      });
      await ref.read(financialReportProvider.notifier).refresh();
      state = await AsyncValue.guard(() => _fetch());
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> deleteExpense(String id) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      await apiClient.delete(ApiEndpoints.expenseItem(id));
      await ref.read(financialReportProvider.notifier).refresh();
      state = await AsyncValue.guard(() => _fetch());
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetch());
  }
}

final expensesProvider = AsyncNotifierProvider<ExpensesNotifier, List<ExpenseItemModel>>(
  ExpensesNotifier.new,
);

// Sales Transactions AsyncNotifier
class SalesTransactionsNotifier extends AsyncNotifier<List<Map<String, dynamic>>> {
  @override
  Future<List<Map<String, dynamic>>> build() async {
    return _fetch();
  }

  Future<List<Map<String, dynamic>>> _fetch() async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.get('${ApiEndpoints.salesTransactions}?limit=50');
      final raw = res.data;
      final list = (raw is Map && raw['data'] != null)
          ? (raw['data'] is Map && raw['data']['data'] != null
              ? raw['data']['data'] as List
              : raw['data'] as List)
          : (raw is List ? raw : []);
      return List<Map<String, dynamic>>.from(list);
    } catch (_) {
      return [];
    }
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetch());
  }
}

final salesTransactionsProvider = AsyncNotifierProvider<SalesTransactionsNotifier, List<Map<String, dynamic>>>(
  SalesTransactionsNotifier.new,
);

// Card Templates AsyncNotifier
class CardTemplatesNotifier extends AsyncNotifier<List<CardTemplateModel>> {
  @override
  Future<List<CardTemplateModel>> build() async {
    return _fetch();
  }

  Future<List<CardTemplateModel>> _fetch() async {
    final storage = ref.read(localStorageProvider);
    final localCustom = storage.getCustomTemplates();

    final List<CardTemplateModel> templates = [];
    final apiClient = ref.read(apiClientProvider);

    try {
      final res = await apiClient.get(ApiEndpoints.cardTemplates);
      final raw = res.data;
      final list = (raw is Map && raw['data'] != null) ? raw['data'] : (raw is List ? raw : []);
      if (list is List && list.isNotEmpty) {
        for (final t in list) {
          if (t is Map<String, dynamic>) {
            templates.add(CardTemplateModel.fromJson(t));
          }
        }
      }
    } catch (_) {}

    // If server returned no templates (or offline), load base built-in catalog
    if (templates.isEmpty) {
      templates.addAll(CardTemplateImportService.getBuiltInCatalog());
    }

    // Merge persistent local custom/imported templates without duplicates
    for (final custom in localCustom) {
      final idx = templates.indexWhere((t) => (custom.id.isNotEmpty && t.id == custom.id) || t.name == custom.name);
      if (idx == -1) {
        templates.add(custom);
      } else {
        // If the local template has a custom background and the server copy doesn't, preserve local background
        if (custom.hasCustomBackground && !templates[idx].hasCustomBackground) {
          final mergedLayout = Map<String, dynamic>.from(templates[idx].layoutConfig);
          mergedLayout['backgroundImageBase64'] = custom.backgroundImageBase64;
          mergedLayout['backgroundFit'] = custom.backgroundFit;
          mergedLayout['isImageBackground'] = custom.isImageBackground;
          mergedLayout['isPdfBackground'] = custom.isPdfBackground;
          templates[idx] = templates[idx].copyWith(
            layoutConfig: mergedLayout,
            backgroundDesign: custom.backgroundDesign,
          );
        }
      }
    }

    return templates;
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetch());
  }


  Future<Map<String, dynamic>> createTemplate(CardTemplateModel tpl) async {
    final storage = ref.read(localStorageProvider);
    final effectiveId = tpl.id.isNotEmpty ? tpl.id : 'tpl-${DateTime.now().millisecondsSinceEpoch}';
    final savedTpl = tpl.copyWith(id: effectiveId);

    // Save locally first for guaranteed persistence across app restarts
    await storage.saveCustomTemplate(savedTpl);

    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.post(
        ApiEndpoints.cardTemplates,
        data: savedTpl.toPayload(),
      );
      final raw = res.data;
      if (raw is Map<String, dynamic>) {
        final serverId = raw['id']?.toString() ??
            (raw['data'] is Map ? raw['data']['id']?.toString() : null);
        if (serverId != null && serverId.isNotEmpty) {
          final syncedTpl = savedTpl.copyWith(id: serverId);
          await storage.saveCustomTemplate(syncedTpl);
        }
      }
      await refresh();
      final resMap = (raw is Map<String, dynamic>) ? raw : <String, dynamic>{};
      return {'success': true, 'message': 'تم حفظ القالب بنجاح', ...resMap, 'template': savedTpl};
    } catch (e) {
      await refresh();
      // Even if server request failed (offline / network error), the template is securely saved locally!
      return {
        'success': true,
        'message': 'تم حفظ القالب محلياً بنجاح في جهازك',
        'template': savedTpl,
      };
    }
  }

  Future<Map<String, dynamic>> updateTemplate(CardTemplateModel tpl) async {
    final storage = ref.read(localStorageProvider);
    await storage.saveCustomTemplate(tpl);

    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.patch(
        ApiEndpoints.cardTemplateItem(tpl.id),
        data: tpl.toPayload(),
      );
      await refresh();
      final raw = res.data;
      if (raw is Map<String, dynamic>) return {'success': true, ...raw};
      return {'success': true, 'message': 'تم تعديل القالب بنجاح'};
    } catch (e) {
      await refresh();
      return {'success': true, 'message': 'تم تعديل القالب محلياً بنجاح'};
    }
  }

  Future<Map<String, dynamic>> deleteTemplate(String id) async {
    final storage = ref.read(localStorageProvider);
    await storage.deleteCustomTemplate(id);

    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.delete(ApiEndpoints.cardTemplateItem(id));
      await refresh();
      final raw = res.data;
      if (raw is Map<String, dynamic>) return {'success': true, ...raw};
      return {'success': true, 'message': 'تم حذف القالب بنجاح'};
    } catch (e) {
      await refresh();
      return {'success': true, 'message': 'تم حذف القالب بنجاح'};
    }
  }
}

final cardTemplatesProvider = AsyncNotifierProvider<CardTemplatesNotifier, List<CardTemplateModel>>(
  CardTemplatesNotifier.new,
);

// Tenant Users AsyncNotifier
class TenantUsersNotifier extends AsyncNotifier<List<UserModel>> {
  @override
  Future<List<UserModel>> build() async {
    return _fetch();
  }

  Future<List<UserModel>> _fetch() async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.get(ApiEndpoints.users);
      final raw = res.data;
      final list = (raw is Map && raw['data'] != null) ? raw['data'] : (raw is List ? raw : []);
      if (list is List) {
        return list.map((u) => UserModel.fromJson(u as Map<String, dynamic>)).toList();
      }
    } catch (_) {}
    return [];
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetch());
  }

  Future<Map<String, dynamic>> createUser({
    required String fullName,
    required String email,
    required String password,
    String? phone,
    required String role,
    List<String>? assignedDeviceIds,
    List<String>? permissionCodes,
  }) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.post(
        ApiEndpoints.users,
        data: {
          'fullName': fullName.trim(),
          'email': email.trim().toLowerCase(),
          'password': password,
          if (phone != null && phone.isNotEmpty) 'phone': phone.trim(),
          'roleName': role,
          if (assignedDeviceIds != null) 'assignedDeviceIds': assignedDeviceIds,
          if (permissionCodes != null) 'permissionCodes': permissionCodes,
        },
      );
      await refresh();
      final raw = res.data;
      if (raw is Map<String, dynamic>) return {'success': true, ...raw};
      return {'success': true, 'message': 'تم إنشاء المستخدم بنجاح'};
    } catch (e) {
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        return {
          'success': false,
          'message': err['message']?.toString() ?? 'فشل إنشاء المستخدم (قد يكون البريد مسجلاً مسبقاً)',
        };
      }
      return {'success': false, 'message': 'تعذر الاتصال بالخادم لإنشاء المستخدم'};
    }
  }

  Future<Map<String, dynamic>> toggleUserStatus(String id, String currentStatus) async {
    final newStatus = currentStatus.toUpperCase() == 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.patch(
        ApiEndpoints.userItem(id),
        data: {'status': newStatus},
      );
      await refresh();
      final raw = res.data;
      if (raw is Map<String, dynamic>) return {'success': true, ...raw};
      return {
        'success': true,
        'message': newStatus == 'ACTIVE' ? 'تم تنشيط حساب الموظف' : 'تم تعطيل حساب الموظف وإبطال جلساته',
      };
    } catch (e) {
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        return {
          'success': false,
          'message': err['message']?.toString() ?? 'فشل تعديل حالة الموظف',
        };
      }
      return {'success': false, 'message': 'تعذر الاتصال بالخادم'};
    }
  }

  Future<Map<String, dynamic>> assignDevices(String id, List<String> deviceIds) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.put(
        ApiEndpoints.userDevices(id),
        data: {'deviceIds': deviceIds},
      );
      await refresh();
      final raw = res.data;
      if (raw is Map<String, dynamic>) return {'success': true, ...raw};
      return {'success': true, 'message': 'تم تحديث الأجهزة المخصصة للموظف بنجاح'};
    } catch (e) {
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        return {
          'success': false,
          'message': err['message']?.toString() ?? 'فشل تخصيص الأجهزة للموظف',
        };
      }
      return {'success': false, 'message': 'تعذر الاتصال بالخادم'};
    }
  }

  Future<Map<String, dynamic>> assignPermissions(String id, List<String> permissionCodes) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.put(
        ApiEndpoints.userPermissions(id),
        data: {'permissionCodes': permissionCodes},
      );
      await refresh();
      final raw = res.data;
      if (raw is Map<String, dynamic>) return {'success': true, ...raw};
      return {'success': true, 'message': 'تم تحديث صلاحيات الموظف بنجاح'};
    } catch (e) {
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        return {
          'success': false,
          'message': err['message']?.toString() ?? 'فشل تخصيص الصلاحيات للموظف',
        };
      }
      return {'success': false, 'message': 'تعذر الاتصال بالخادم'};
    }
  }

  Future<Map<String, dynamic>> createInvitation({
    required String fullName,
    required String email,
    String? phone,
    required String role,
    List<String>? assignedDeviceIds,
    List<String>? permissionCodes,
  }) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.post(
        ApiEndpoints.userInvitations,
        data: {
          'fullName': fullName.trim(),
          'email': email.trim().toLowerCase(),
          if (phone != null && phone.isNotEmpty) 'phone': phone.trim(),
          'roleName': role,
          if (assignedDeviceIds != null) 'assignedDeviceIds': assignedDeviceIds,
          if (permissionCodes != null) 'permissionCodes': permissionCodes,
        },
      );
      ref.invalidate(staffInvitationsProvider);
      final raw = res.data;
      if (raw is Map<String, dynamic>) return {'success': true, ...raw};
      return {'success': true, 'message': 'تم إنشاء دعوة الانضمام بنجاح'};
    } catch (e) {
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        return {
          'success': false,
          'message': err['message']?.toString() ?? 'فشل إنشاء الدعوة',
        };
      }
      return {'success': false, 'message': 'تعذر الاتصال بالخادم'};
    }
  }

  Future<Map<String, dynamic>> deleteUser(String id) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.delete(ApiEndpoints.userItem(id));
      await refresh();
      final raw = res.data;
      if (raw is Map<String, dynamic>) return {'success': true, ...raw};
      return {'success': true, 'message': 'تم حذف المستخدم بنجاح'};
    } catch (e) {
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        return {
          'success': false,
          'message': err['message']?.toString() ?? 'فشل حذف المستخدم',
        };
      }
      return {'success': false, 'message': 'تعذر الاتصال بالخادم'};
    }
  }
}

final tenantUsersProvider = AsyncNotifierProvider<TenantUsersNotifier, List<UserModel>>(
  TenantUsersNotifier.new,
);

class StaffInvitationsNotifier extends AsyncNotifier<List<StaffInvitationModel>> {
  @override
  Future<List<StaffInvitationModel>> build() async {
    return _fetch();
  }

  Future<List<StaffInvitationModel>> _fetch() async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.get(ApiEndpoints.userInvitations);
      final raw = res.data;
      final list = (raw is Map && raw['data'] != null) ? raw['data'] : (raw is List ? raw : []);
      if (list is List) {
        return list.map((i) => StaffInvitationModel.fromJson(i as Map<String, dynamic>)).toList();
      }
    } catch (_) {}
    return [];
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetch());
  }

  Future<Map<String, dynamic>> resend(String id) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.post(ApiEndpoints.userInvitationResend(id));
      await refresh();
      final raw = res.data;
      if (raw is Map<String, dynamic>) return {'success': true, ...raw};
      return {'success': true, 'message': 'تمت إعادة إرسال الدعوة بنجاح'};
    } catch (e) {
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        return {
          'success': false,
          'message': err['message']?.toString() ?? 'فشل إعادة إرسال الدعوة',
        };
      }
      return {'success': false, 'message': 'تعذر الاتصال بالخادم'};
    }
  }

  Future<Map<String, dynamic>> cancel(String id) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.delete(ApiEndpoints.userInvitationItem(id));
      await refresh();
      final raw = res.data;
      if (raw is Map<String, dynamic>) return {'success': true, ...raw};
      return {'success': true, 'message': 'تم إلغاء الدعوة بنجاح'};
    } catch (e) {
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        return {
          'success': false,
          'message': err['message']?.toString() ?? 'فشل إلغاء الدعوة',
        };
      }
      return {'success': false, 'message': 'تعذر الاتصال بالخادم'};
    }
  }
}

final staffInvitationsProvider = AsyncNotifierProvider<StaffInvitationsNotifier, List<StaffInvitationModel>>(
  StaffInvitationsNotifier.new,
);

// Cloud Wallet AsyncNotifier
class WalletNotifier extends AsyncNotifier<WalletDataModel> {
  @override
  Future<WalletDataModel> build() async {
    return _fetch();
  }

  Future<WalletDataModel> _fetch() async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.get(ApiEndpoints.wallet);
      final raw = res.data;
      final data = (raw is Map && raw['data'] != null)
          ? raw['data'] as Map<String, dynamic>
          : raw as Map<String, dynamic>;

      List<WalletTransactionModel> txList = [];
      if (data['recentTransactions'] != null && data['recentTransactions'] is List) {
        txList = (data['recentTransactions'] as List)
            .map((item) => WalletTransactionModel.fromJson(item as Map<String, dynamic>))
            .toList();
      } else {
        try {
          final txRes = await apiClient.get(
            ApiEndpoints.walletTransactions,
            queryParameters: {'limit': 5},
          );
          final rawTx = txRes.data;
          final txData = (rawTx is Map && rawTx['data'] != null)
              ? rawTx['data'] as List
              : (rawTx is List ? rawTx : []);
          txList = txData
              .map((item) => WalletTransactionModel.fromJson(item as Map<String, dynamic>))
              .toList();
        } catch (_) {}
      }

      final wallet = WalletDataModel.fromJson(data);
      return wallet.copyWith(transactions: txList);
    } catch (_) {
      return WalletDataModel(
        walletBalance: 0.0,
        loyaltyPoints: 0,
        allowAdminCards: false,
        currency: 'SDG',
        transactions: [],
      );
    }
  }

  Future<bool> recharge(double amount, String reason) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      await apiClient.post(ApiEndpoints.walletRecharge, data: {
        'amount': amount,
        'notes': reason,
      });
      state = const AsyncValue.loading();
      state = await AsyncValue.guard(() => _fetch());
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> updateSettings(bool allowAdminCards) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      await apiClient.patch(ApiEndpoints.walletSettings, data: {
        'allowAdminCards': allowAdminCards,
      });
      state.whenData((current) {
        state = AsyncValue.data(current.copyWith(allowAdminCards: allowAdminCards));
      });
      final refreshed = await _fetch();
      state = AsyncValue.data(refreshed);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> redeemPoints(int points) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      await apiClient.post(ApiEndpoints.walletRedeemPoints, data: {
        'points': points,
      });
      state = const AsyncValue.loading();
      state = await AsyncValue.guard(() => _fetch());
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetch());
  }
}

final walletProvider = AsyncNotifierProvider<WalletNotifier, WalletDataModel>(
  WalletNotifier.new,
);

// Cards Inventory State Notifier & Provider
class CardsInventoryNotifier extends Notifier<CardsInventoryState> {
  String _searchQuery = '';
  String _selectedStatus = 'ALL';
  int _currentPage = 1;
  static const int _limit = 50;

  String get currentSearch => _searchQuery;
  String get currentStatus => _selectedStatus;
  int get currentPage => _currentPage;

  @override
  CardsInventoryState build() {
    Future.microtask(() => loadInventory());
    return CardsInventoryState(
      cards: [],
      totalMatching: 0,
      totalInventory: 0,
      isLoading: true,
    );
  }

  Future<void> loadInventory({
    String? search,
    String? status,
    int? page,
    bool isRefresh = false,
  }) async {
    if (search != null) _searchQuery = search;
    if (status != null) _selectedStatus = status;
    if (page != null) _currentPage = page;

    state = state.copyWith(isLoading: true, errorMessage: null);

    final apiClient = ref.read(apiClientProvider);
    final storage = ref.read(localStorageProvider);

    try {
      final queryParams = <String, dynamic>{
        'page': _currentPage,
        'limit': _limit,
      };
      if (_searchQuery.trim().isNotEmpty) {
        queryParams['search'] = _searchQuery.trim();
      }
      if (_selectedStatus != 'ALL') {
        queryParams['status'] = _selectedStatus;
      }

      final response = await apiClient.get(
        ApiEndpoints.cards,
        queryParameters: queryParams,
      );

      final rawData = response.data;
      Map<String, dynamic> dataMap = {};
      if (rawData is Map<String, dynamic>) {
        if (rawData['data'] is Map<String, dynamic>) {
          dataMap = rawData['data'] as Map<String, dynamic>;
        } else {
          dataMap = rawData;
        }
      }

      List<CardModel> loadedCards = [];
      int totalMatching = 0;
      int totalInventory = 0;
      int availableCount = 0;
      int soldCount = 0;
      int activeCount = 0;
      int disabledCount = 0;
      int totalPages = 1;

      if (dataMap.containsKey('data') && dataMap['data'] is List) {
        final rawCards = dataMap['data'] as List;
        loadedCards = rawCards
            .map((c) => CardModel.fromJson(c as Map<String, dynamic>))
            .toList();
        totalMatching = dataMap['total'] as int? ?? loadedCards.length;
        totalPages = dataMap['totalPages'] as int? ?? 1;

        if (dataMap['counts'] is Map) {
          final c = dataMap['counts'] as Map;
          totalInventory = c['totalInventory'] as int? ?? totalMatching;
          availableCount = c['available'] as int? ?? 0;
          soldCount = c['sold'] as int? ?? 0;
          activeCount = c['active'] as int? ?? 0;
          disabledCount = c['disabled'] as int? ?? 0;
        } else {
          totalInventory = totalMatching;
        }
      } else if (rawData is List) {
        loadedCards = rawData
            .map((c) => CardModel.fromJson(c as Map<String, dynamic>))
            .toList();
        totalMatching = loadedCards.length;
        totalInventory = loadedCards.length;
      }

      state = CardsInventoryState(
        cards: loadedCards,
        totalMatching: totalMatching,
        totalInventory: totalInventory,
        availableCount: availableCount,
        soldCount: soldCount,
        activeCount: activeCount,
        disabledCount: disabledCount,
        isLoading: false,
        errorMessage: null,
        page: _currentPage,
        totalPages: totalPages,
      );
    } catch (e) {
      // Offline fallback: try reading from offline storage if available
      final offlineCards = storage.getOfflineCards();
      if (offlineCards.isNotEmpty) {
        final query = _searchQuery.trim().toLowerCase();
        final filtered = offlineCards.where((c) {
          if (_selectedStatus != 'ALL' && c.status != _selectedStatus) {
            return false;
          }
          if (query.isNotEmpty) {
            return c.username.toLowerCase().contains(query) ||
                c.serialNumber.toLowerCase().contains(query) ||
                c.profileName.toLowerCase().contains(query);
          }
          return true;
        }).toList();

        final converted = filtered.map((c) => CardModel(
          id: c.id,
          serialNumber: c.serialNumber,
          username: c.username,
          clearPassword: c.clearPassword,
          pinCode: null,
          price: c.price,
          status: c.status,
          profileName: c.profileName,
          createdAt: DateTime.now(),
        )).toList();

        state = CardsInventoryState(
          cards: converted,
          totalMatching: converted.length,
          totalInventory: offlineCards.length,
          availableCount: offlineCards.where((c) => c.status == 'AVAILABLE').length,
          soldCount: offlineCards.where((c) => c.status == 'SOLD').length,
          activeCount: offlineCards.where((c) => c.status == 'ACTIVE' || c.status == 'USED').length,
          disabledCount: offlineCards.where((c) => c.status == 'DISABLED' || c.status == 'CANCELLED').length,
          isLoading: false,
          errorMessage: null,
          page: 1,
          totalPages: 1,
        );
      } else {
        state = state.copyWith(
          isLoading: false,
          errorMessage: 'تعذر الاتصال بالخادم لجلب بيانات الكروت. يرجى التحقق من الشبكة وإعادة المحاولة.',
        );
      }
    }
  }

  Future<bool> updateCardStatus(String cardId, String newStatus) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      await apiClient.patch(
        ApiEndpoints.cardStatus(cardId),
        data: {'status': newStatus},
      );
      await loadInventory();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<Map<String, dynamic>> bulkDeleteCards(List<String> cardIds) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.post(
        ApiEndpoints.cardsBulkDelete,
        data: {'cardIds': cardIds},
      );
      await loadInventory(isRefresh: true);
      final raw = res.data;
      if (raw is Map<String, dynamic>) {
        return {'success': true, ...raw};
      }
      return {'success': true, 'message': 'تم حذف الكروت المحددة بنجاح'};
    } catch (e) {
      String msg = 'فشل حذف الكروت المحددة';
      if (e is DioException && e.response?.data is Map) {
        final d = e.response!.data as Map;
        msg = d['message']?.toString() ?? msg;
      }
      return {'success': false, 'message': msg};
    }
  }

  Future<Map<String, dynamic>> deleteCard(String cardId) async {
    return bulkDeleteCards([cardId]);
  }

  Future<Map<String, dynamic>> bulkActivateCards(List<String> cardIds) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.post(
        ApiEndpoints.cardsBulkActivate,
        data: {'cardIds': cardIds},
      );
      await loadInventory(isRefresh: true);
      final raw = res.data;
      if (raw is Map<String, dynamic>) {
        return {'success': raw['success'] == true, ...raw};
      }
      return {'success': true, 'message': 'تم تفعيل الكروت المحددة بنجاح'};
    } catch (e) {
      String msg = 'فشل تفعيل الكروت المحددة';
      if (e is DioException && e.response?.data is Map) {
        final d = e.response!.data as Map;
        msg = d['message']?.toString() ?? msg;
      }
      return {'success': false, 'message': msg};
    }
  }

  Future<CardModel?> fetchCardDetails(String cardId) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.get(ApiEndpoints.cardItem(cardId));
      final raw = res.data;
      final data = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
      if (data is Map<String, dynamic>) {
        return CardModel.fromJson(data);
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<void> refresh() async {
    await loadInventory(isRefresh: true);
  }
}

final cardsInventoryProvider = NotifierProvider<CardsInventoryNotifier, CardsInventoryState>(
  CardsInventoryNotifier.new,
);

/// Provider for dynamic SaaS subscription quota and limit details
class TenantQuotaNotifier extends AsyncNotifier<TenantQuotaModel?> {
  @override
  Future<TenantQuotaModel?> build() async {
    final storage = ref.watch(localStorageProvider);
    final user = ref.watch(currentUserProvider);
    final tenantId = user?.tenantId;

    // 1. Immediately return cached quota if available for this specific tenant
    final cached = storage.getTenantQuota(tenantId);
    if (cached != null) {
      // Trigger background update without clearing cached state
      _fetchAndUpdateInBackground(tenantId);
      return cached;
    }

    // 2. Fallback to currentUser subscription info if cached is null
    if (user != null && user.subscriptionPlan != null) {
      final fallbackModel = TenantQuotaModel(
        tenantId: user.tenantId,
        planName: user.subscriptionPlan,
        planNameAr: user.subscriptionPlanAr,
        status: user.subscriptionStatus,
        expiresAt: user.subscriptionExpiresAt,
        isUnlimited: true,
      );
      _fetchAndUpdateInBackground(tenantId);
      return fallbackModel;
    }

    return _fetchFromServer(tenantId);
  }

  Future<TenantQuotaModel?> _fetchFromServer([String? currentTenantId]) async {
    final apiClient = ref.read(apiClientProvider);
    final storage = ref.read(localStorageProvider);
    try {
      final res = await apiClient.get('/cards/quota');
      final raw = res.data;
      final data = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
      if (data is Map<String, dynamic>) {
        final mapWithTenant = Map<String, dynamic>.from(data);
        if (mapWithTenant['tenantId'] == null && currentTenantId != null) {
          mapWithTenant['tenantId'] = currentTenantId;
        }
        final user = ref.read(currentUserProvider);
        if (user?.role.toUpperCase() == 'SUPER_ADMIN' &&
            (mapWithTenant['status'] == null || mapWithTenant['status'] == 'NONE')) {
          mapWithTenant['status'] = 'ACTIVE';
          mapWithTenant['isUnlimited'] = true;
          mapWithTenant['planName'] = mapWithTenant['planName'] ?? 'ENTERPRISE';
          mapWithTenant['planNameAr'] = mapWithTenant['planNameAr'] ?? 'باقة المشرف العام (شاملة)';
        }
        final model = TenantQuotaModel.fromJson(mapWithTenant);
        await storage.setTenantQuota(model, currentTenantId);
        return model;
      }
    } catch (_) {
      try {
        final res = await apiClient.get(ApiEndpoints.currentTenant);
        final raw = res.data;
        final data = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
        if (data is Map<String, dynamic> && data['subscription'] is Map) {
          final subMap = Map<String, dynamic>.from(data['subscription'] as Map);
          if (subMap['tenantId'] == null && currentTenantId != null) {
            subMap['tenantId'] = currentTenantId;
          }
          final user = ref.read(currentUserProvider);
          if (user?.role.toUpperCase() == 'SUPER_ADMIN' &&
              (subMap['status'] == null || subMap['status'] == 'NONE')) {
            subMap['status'] = 'ACTIVE';
            subMap['isUnlimited'] = true;
          }
          final model = TenantQuotaModel.fromJson(subMap);
          await storage.setTenantQuota(model, currentTenantId);
          return model;
        }
      } catch (_) {}
    }
    final cached = storage.getTenantQuota(currentTenantId);
    if (cached == null) {
      final user = ref.read(currentUserProvider);
      if (user?.role.toUpperCase() == 'SUPER_ADMIN') {
        return TenantQuotaModel(
          tenantId: currentTenantId,
          planName: 'ENTERPRISE',
          planNameAr: 'باقة المشرف العام (شاملة)',
          status: 'ACTIVE',
          isUnlimited: true,
          maxRouters: 999,
          cardLimit: 999999,
          remainingCards: 999999,
        );
      }
    }
    return cached;
  }

  Future<void> _fetchAndUpdateInBackground([String? currentTenantId]) async {
    try {
      final fresh = await _fetchFromServer(currentTenantId);
      if (fresh != null) {
        state = AsyncValue.data(fresh);
      }
    } catch (_) {}
  }

  Future<TenantQuotaModel?> refresh() async {
    final user = ref.read(currentUserProvider);
    final tenantId = user?.tenantId;
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetchFromServer(tenantId));
    return state.asData?.value;
  }

  Future<TenantQuotaModel?> fetchFresh([String? targetTenantId]) async {
    final tenantId = targetTenantId ?? ref.read(currentUserProvider)?.tenantId;
    final fresh = await _fetchFromServer(tenantId);
    if (fresh != null) {
      state = AsyncValue.data(fresh);
      return fresh;
    }
    return state.asData?.value;
  }
}

final tenantQuotaProvider = AsyncNotifierProvider<TenantQuotaNotifier, TenantQuotaModel?>(
  TenantQuotaNotifier.new,
);

/// ============================================================================
/// PPPoE & BROADBAND RIVERPOD PROVIDERS
/// ============================================================================

/// PPPoE Profiles AsyncNotifier
class PppoeProfilesNotifier extends AsyncNotifier<List<PppoeProfileModel>> {
  @override
  Future<List<PppoeProfileModel>> build() async {
    final selectedId = ref.watch(selectedRouterIdProvider);
    return _fetch(selectedId);
  }

  Future<List<PppoeProfileModel>> _fetch(String? deviceId) async {
    if (deviceId == null || deviceId.isEmpty) return [];
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.get(ApiEndpoints.pppoeProfiles(deviceId));
      final raw = res.data;
      final list = (raw is Map && raw['data'] != null) ? raw['data'] : (raw is List ? raw : []);
      if (list is List) {
        return list.map((p) => PppoeProfileModel.fromJson(p as Map<String, dynamic>)).toList();
      }
    } catch (_) {}
    return [];
  }

  Future<void> refresh() async {
    final selectedId = ref.read(selectedRouterIdProvider);
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetch(selectedId));
  }

  Future<Map<String, dynamic>> createProfile(PppoeProfileModel profile) async {
    final selectedId = ref.read(selectedRouterIdProvider);
    if (selectedId == null) {
      return {'success': false, 'message': 'يرجى اختيار جهاز راوتر أولاً'};
    }
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.post(
        ApiEndpoints.pppoeProfiles(selectedId),
        data: profile.toCreatePayload(),
      );
      await refresh();
      final resData = res.data;
      final raw = (resData is Map && resData['data'] != null) ? resData['data'] : resData;
      final queuedCmd = (raw is Map) ? raw['queuedCommandId']?.toString() : null;
      if (queuedCmd != null && queuedCmd.isNotEmpty) {
        ref.read(pppoeCommandsProvider.notifier).trackCommand(
          queuedCmd,
          'مزامنة بروفايل PPPoE «${profile.name}» مع الراوتر',
          type: 'pppoe.profile.sync',
        );
      }
      return {
        'success': true,
        'message': 'تم إنشاء بروفايل «${profile.name}» وجدولة مزامنته بنجاح',
        'queuedCommandId': queuedCmd,
      };
    } catch (e) {
      String msg = 'تعذر إنشاء بروفايل PPPoE';
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        msg = err['message']?.toString() ?? msg;
      }
      return {'success': false, 'message': msg};
    }
  }

  Future<Map<String, dynamic>> updateProfile(String id, Map<String, dynamic> data) async {
    final selectedId = ref.read(selectedRouterIdProvider);
    if (selectedId == null) {
      return {'success': false, 'message': 'يرجى اختيار جهاز راوتر أولاً'};
    }
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.patch(
        ApiEndpoints.pppoeProfileItem(selectedId, id),
        data: data,
      );
      await refresh();
      final resData = res.data;
      final raw = (resData is Map && resData['data'] != null) ? resData['data'] : resData;
      final queuedCmd = (raw is Map) ? raw['queuedCommandId']?.toString() : null;
      if (queuedCmd != null && queuedCmd.isNotEmpty) {
        ref.read(pppoeCommandsProvider.notifier).trackCommand(
          queuedCmd,
          'تحديث بروفايل PPPoE على الراوتر',
          type: 'pppoe.profile.sync',
        );
      }
      return {
        'success': true,
        'message': 'تم تحديث إعدادات البروفايل بنجاح',
        'queuedCommandId': queuedCmd,
      };
    } catch (e) {
      String msg = 'تعذر تحديث بروفايل PPPoE';
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        msg = err['message']?.toString() ?? msg;
      }
      return {'success': false, 'message': msg};
    }
  }

  Future<Map<String, dynamic>> deleteProfile(String id, String profileName) async {
    final selectedId = ref.read(selectedRouterIdProvider);
    if (selectedId == null) {
      return {'success': false, 'message': 'يرجى اختيار جهاز راوتر أولاً'};
    }
    final apiClient = ref.read(apiClientProvider);
    try {
      await apiClient.delete(ApiEndpoints.pppoeProfileItem(selectedId, id));
      await refresh();
      return {'success': true, 'message': 'تم حذف البروفايل «$profileName» بنجاح'};
    } catch (e) {
      String msg = 'تعذر حذف بروفايل PPPoE';
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        msg = err['message']?.toString() ?? msg;
      }
      return {'success': false, 'message': msg};
    }
  }

  Future<Map<String, dynamic>> syncProfile(String id, String profileName) async {
    final selectedId = ref.read(selectedRouterIdProvider);
    if (selectedId == null) {
      return {'success': false, 'message': 'يرجى اختيار جهاز راوتر أولاً'};
    }
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.post(ApiEndpoints.pppoeProfileSync(selectedId, id));
      final resData = res.data;
      final raw = (resData is Map && resData['data'] != null) ? resData['data'] : resData;
      final queuedCmd = (raw is Map) ? raw['queuedCommandId']?.toString() : null;
      if (queuedCmd != null && queuedCmd.isNotEmpty) {
        ref.read(pppoeCommandsProvider.notifier).trackCommand(
          queuedCmd,
          'مزامنة بروفايل «$profileName» مع الراوتر',
          type: 'pppoe.profile.sync',
        );
      }
      return {
        'success': true,
        'message': 'تم إرسال أمر مزامنة البروفايل إلى الراوتر',
        'queuedCommandId': queuedCmd,
      };
    } catch (e) {
      String msg = 'فشل طلب المزامنة';
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        msg = err['message']?.toString() ?? msg;
      }
      return {'success': false, 'message': msg};
    }
  }
}

final pppoeProfilesProvider = AsyncNotifierProvider<PppoeProfilesNotifier, List<PppoeProfileModel>>(
  PppoeProfilesNotifier.new,
);

/// PPPoE Accounts AsyncNotifier
class PppoeAccountsNotifier extends AsyncNotifier<List<PppoeAccountModel>> {
  @override
  Future<List<PppoeAccountModel>> build() async {
    final selectedId = ref.watch(selectedRouterIdProvider);
    return _fetch(selectedId);
  }

  Future<List<PppoeAccountModel>> _fetch(String? deviceId) async {
    if (deviceId == null || deviceId.isEmpty) return [];
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.get(
        ApiEndpoints.pppoeAccounts(deviceId),
        queryParameters: {'limit': 200},
      );
      final raw = res.data;
      final data = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
      final items = (data is Map && data['items'] != null) ? data['items'] : (data is List ? data : []);
      if (items is List) {
        return items.map((a) => PppoeAccountModel.fromJson(a as Map<String, dynamic>)).toList();
      }
    } catch (_) {}
    return [];
  }

  Future<void> refresh() async {
    final selectedId = ref.read(selectedRouterIdProvider);
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetch(selectedId));
  }

  Future<Map<String, dynamic>> createAccount(Map<String, dynamic> payload) async {
    final selectedId = ref.read(selectedRouterIdProvider);
    if (selectedId == null) {
      return {'success': false, 'message': 'يرجى اختيار جهاز راوتر أولاً'};
    }
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.post(
        ApiEndpoints.pppoeAccounts(selectedId),
        data: payload,
      );
      await refresh();
      final resData = res.data;
      final raw = (resData is Map && resData['data'] != null) ? resData['data'] : resData;
      final queuedCmd = (raw is Map) ? raw['queuedCommandId']?.toString() : null;
      final username = payload['username']?.toString() ?? '';
      if (queuedCmd != null && queuedCmd.isNotEmpty) {
        ref.read(pppoeCommandsProvider.notifier).trackCommand(
          queuedCmd,
          'إضافة اشتراك PPPoE للمستخدم «$username»',
          type: 'pppoe.secret.add',
        );
      }
      return {
        'success': true,
        'message': 'تم إنشاء حساب المشترك «$username» بنجاح',
        'queuedCommandId': queuedCmd,
      };
    } catch (e) {
      String msg = 'تعذر إنشاء حساب المشترك';
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        msg = err['message']?.toString() ?? msg;
      }
      return {'success': false, 'message': msg};
    }
  }

  Future<Map<String, dynamic>> updateAccount(String id, Map<String, dynamic> payload) async {
    final selectedId = ref.read(selectedRouterIdProvider);
    if (selectedId == null) {
      return {'success': false, 'message': 'يرجى اختيار جهاز راوتر أولاً'};
    }
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.patch(
        ApiEndpoints.pppoeAccountItem(selectedId, id),
        data: payload,
      );
      await refresh();
      final resData = res.data;
      final raw = (resData is Map && resData['data'] != null) ? resData['data'] : resData;
      final queuedCmd = (raw is Map) ? raw['queuedCommandId']?.toString() : null;
      if (queuedCmd != null && queuedCmd.isNotEmpty) {
        ref.read(pppoeCommandsProvider.notifier).trackCommand(
          queuedCmd,
          'تحديث بيانات اشتراك PPPoE على الراوتر',
          type: 'pppoe.secret.update',
        );
      }
      return {
        'success': true,
        'message': 'تم تحديث بيانات المشترك بنجاح',
        'queuedCommandId': queuedCmd,
      };
    } catch (e) {
      String msg = 'تعذر تحديث بيانات المشترك';
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        msg = err['message']?.toString() ?? msg;
      }
      return {'success': false, 'message': msg};
    }
  }

  Future<Map<String, dynamic>> disableAccount(String id, String username) async {
    final selectedId = ref.read(selectedRouterIdProvider);
    if (selectedId == null) {
      return {'success': false, 'message': 'يرجى اختيار جهاز راوتر أولاً'};
    }
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.post(ApiEndpoints.pppoeAccountDisable(selectedId, id));
      await refresh();
      final resData = res.data;
      final raw = (resData is Map && resData['data'] != null) ? resData['data'] : resData;
      final queuedCmd = (raw is Map) ? raw['queuedCommandId']?.toString() : null;
      if (queuedCmd != null && queuedCmd.isNotEmpty) {
        ref.read(pppoeCommandsProvider.notifier).trackCommand(
          queuedCmd,
          'تعطيل وفصل اشتراك PPPoE للمستخدم «$username»',
          type: 'pppoe.secret.disable',
        );
      }
      return {
        'success': true,
        'message': 'تم تعطيل حساب المشترك «$username» وفصل اتصاله',
        'queuedCommandId': queuedCmd,
      };
    } catch (e) {
      String msg = 'تعذر تعطيل حساب المشترك';
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        msg = err['message']?.toString() ?? msg;
      }
      return {'success': false, 'message': msg};
    }
  }

  Future<Map<String, dynamic>> enableAccount(String id, String username) async {
    final selectedId = ref.read(selectedRouterIdProvider);
    if (selectedId == null) {
      return {'success': false, 'message': 'يرجى اختيار جهاز راوتر أولاً'};
    }
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.post(ApiEndpoints.pppoeAccountEnable(selectedId, id));
      await refresh();
      final resData = res.data;
      final raw = (resData is Map && resData['data'] != null) ? resData['data'] : resData;
      final queuedCmd = (raw is Map) ? raw['queuedCommandId']?.toString() : null;
      if (queuedCmd != null && queuedCmd.isNotEmpty) {
        ref.read(pppoeCommandsProvider.notifier).trackCommand(
          queuedCmd,
          'تفعيل اشتراك PPPoE للمستخدم «$username»',
          type: 'pppoe.secret.enable',
        );
      }
      return {
        'success': true,
        'message': 'تم تفعيل حساب المشترك «$username» بنجاح',
        'queuedCommandId': queuedCmd,
      };
    } catch (e) {
      String msg = 'تعذر تفعيل حساب المشترك';
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        msg = err['message']?.toString() ?? msg;
      }
      return {'success': false, 'message': msg};
    }
  }

  Future<Map<String, dynamic>> deleteAccount(String id, String username) async {
    final selectedId = ref.read(selectedRouterIdProvider);
    if (selectedId == null) {
      return {'success': false, 'message': 'يرجى اختيار جهاز راوتر أولاً'};
    }
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.delete(ApiEndpoints.pppoeAccountItem(selectedId, id));
      await refresh();
      final resData = res.data;
      final raw = (resData is Map && resData['data'] != null) ? resData['data'] : resData;
      final queuedCmd = (raw is Map) ? raw['queuedCommandId']?.toString() : null;
      if (queuedCmd != null && queuedCmd.isNotEmpty) {
        ref.read(pppoeCommandsProvider.notifier).trackCommand(
          queuedCmd,
          'حذف اشتراك PPPoE للمستخدم «$username» من الراوتر',
          type: 'pppoe.secret.remove',
        );
      }
      return {
        'success': true,
        'message': 'تم حذف حساب المشترك «$username» بنجاح',
        'queuedCommandId': queuedCmd,
      };
    } catch (e) {
      String msg = 'تعذر حذف حساب المشترك';
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        msg = err['message']?.toString() ?? msg;
      }
      return {'success': false, 'message': msg};
    }
  }
}

final pppoeAccountsProvider = AsyncNotifierProvider<PppoeAccountsNotifier, List<PppoeAccountModel>>(
  PppoeAccountsNotifier.new,
);

/// PPPoE Live Sessions AsyncNotifier
class PppoeSessionsNotifier extends AsyncNotifier<List<PppoeActiveSessionModel>> {
  DateTime? lastSyncTime;

  @override
  Future<List<PppoeActiveSessionModel>> build() async {
    final selectedId = ref.watch(selectedRouterIdProvider);
    return _fetch(selectedId, syncFromRouter: false);
  }

  Future<List<PppoeActiveSessionModel>> _fetch(String? deviceId, {bool syncFromRouter = false}) async {
    if (deviceId == null || deviceId.isEmpty) return [];
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.get(
        ApiEndpoints.pppoeSessions(deviceId, sync: syncFromRouter),
      );
      final raw = res.data;
      final data = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
      final sessionsRaw = (data is Map && data['sessions'] != null) ? data['sessions'] : (data is List ? data : []);

      if (data is Map && data['queuedCommandId'] != null) {
        final queuedCmd = data['queuedCommandId'].toString();
        ref.read(pppoeCommandsProvider.notifier).trackCommand(
          queuedCmd,
          'طلب استعلام ومزامنة الجلسات الحية من الراوتر',
          type: 'pppoe.session.list',
        );
      }

      lastSyncTime = DateTime.now();

      if (sessionsRaw is List) {
        return sessionsRaw.map((s) => PppoeActiveSessionModel.fromJson(s as Map<String, dynamic>)).toList();
      }
    } catch (_) {}
    return [];
  }

  Future<Map<String, dynamic>> refresh({bool syncFromRouter = false}) async {
    final selectedId = ref.read(selectedRouterIdProvider);
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetch(selectedId, syncFromRouter: syncFromRouter));
    return {
      'success': true,
      'message': syncFromRouter ? 'تم طلب مزامنة الجلسات النشطة من الراوتر' : 'تم تحديث قائمة الجلسات',
    };
  }

  Future<Map<String, dynamic>> disconnectSession({String? username, String? sessionId}) async {
    final selectedId = ref.read(selectedRouterIdProvider);
    if (selectedId == null) {
      return {'success': false, 'message': 'يرجى اختيار جهاز راوتر أولاً'};
    }
    final apiClient = ref.read(apiClientProvider);
    try {
      final payload = <String, dynamic>{};
      if (username != null && username.isNotEmpty) payload['username'] = username;
      if (sessionId != null && sessionId.isNotEmpty) payload['sessionId'] = sessionId;

      final res = await apiClient.post(
        ApiEndpoints.pppoeSessionDisconnect(selectedId),
        data: payload,
      );
      await refresh();
      final resData = res.data;
      final raw = (resData is Map && resData['data'] != null) ? resData['data'] : resData;
      final queuedCmd = (raw is Map) ? raw['queuedCommandId']?.toString() : null;
      if (queuedCmd != null && queuedCmd.isNotEmpty) {
        ref.read(pppoeCommandsProvider.notifier).trackCommand(
          queuedCmd,
          'قطع اتصال المشترك «${username ?? sessionId}» على الراوتر',
          type: 'pppoe.session.disconnect',
        );
      }
      return {
        'success': true,
        'message': 'تم إرسال أمر فصل الجلسة بنجاح',
        'queuedCommandId': queuedCmd,
      };
    } catch (e) {
      String msg = 'تعذر فصل الجلسة النشطة';
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        msg = err['message']?.toString() ?? msg;
      }
      return {'success': false, 'message': msg};
    }
  }
}

final pppoeSessionsProvider = AsyncNotifierProvider<PppoeSessionsNotifier, List<PppoeActiveSessionModel>>(
  PppoeSessionsNotifier.new,
);

/// Tracked Command Summary Item
class TrackedPppoeCommandItem {
  final String commandId;
  final String description;
  final String type;
  final DateTime queuedAt;
  PppoeCommandStatusModel? statusModel;

  TrackedPppoeCommandItem({
    required this.commandId,
    required this.description,
    this.type = '',
    required this.queuedAt,
    this.statusModel,
  });
}

/// Commands Tracker State Notifier
class PppoeCommandsNotifier extends Notifier<List<TrackedPppoeCommandItem>> {
  @override
  List<TrackedPppoeCommandItem> build() => [];

  void trackCommand(String commandId, String description, {String type = ''}) {
    if (state.any((c) => c.commandId == commandId)) return;
    final item = TrackedPppoeCommandItem(
      commandId: commandId,
      description: description,
      type: type,
      queuedAt: DateTime.now(),
    );
    state = [item, ...state];
    // Immediate initial status fetch
    fetchStatus(commandId);
  }

  Future<PppoeCommandStatusModel?> fetchStatus(String commandId) async {
    final selectedId = ref.read(selectedRouterIdProvider);
    if (selectedId == null) return null;
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.get(
        ApiEndpoints.pppoeCommandStatus(selectedId, commandId),
      );
      final raw = res.data;
      final data = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
      if (data is Map<String, dynamic>) {
        final model = PppoeCommandStatusModel.fromJson(data);
        state = state.map((item) {
          if (item.commandId == commandId) {
            return TrackedPppoeCommandItem(
              commandId: item.commandId,
              description: item.description,
              type: item.type.isNotEmpty ? item.type : model.type,
              queuedAt: item.queuedAt,
              statusModel: model,
            );
          }
          return item;
        }).toList();
        return model;
      }
    } catch (_) {}
    return null;
  }
}

final pppoeCommandsProvider = NotifierProvider<PppoeCommandsNotifier, List<TrackedPppoeCommandItem>>(
  PppoeCommandsNotifier.new,
);

/// ============================================================================
/// HOTSPOT CAPTIVE PORTAL DESIGNER PROVIDERS
/// ============================================================================

final portalTemplatesProvider = FutureProvider.autoDispose<List<HotspotPortalConfigModel>>((ref) async {
  final apiClient = ref.watch(apiClientProvider);
  try {
    final res = await apiClient.get(ApiEndpoints.portalTemplates);
    final raw = res.data;
    final list = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
    if (list is List) {
      return list
          .whereType<Map>()
          .map((item) => HotspotPortalConfigModel.fromJson(Map<String, dynamic>.from(item)))
          .toList();
    }
    return [];
  } catch (_) {
    return [];
  }
});

/// ============================================================================
/// CONNECTED DEVICES PROVIDER (DHCP Leases, ARP, Neighbors)
/// ============================================================================

final connectedDevicesProvider =
    FutureProvider.autoDispose.family<List<ConnectedDeviceModel>, String>((ref, routerId) async {
  if (routerId.isEmpty) return [];
  final apiClient = ref.watch(apiClientProvider);
  final res = await apiClient.get(ApiEndpoints.deviceConnectedDevices(routerId));
  final raw = res.data;
  final list = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
  if (list is List) {
    return list
        .whereType<Map>()
        .map((item) => ConnectedDeviceModel.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }
  return [];
});


