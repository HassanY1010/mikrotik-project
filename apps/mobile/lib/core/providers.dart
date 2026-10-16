import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'models/models.dart';
import 'network/api_client.dart';
import 'storage/local_storage.dart';
import 'sync/offline_sync_manager.dart';
import 'constants/api_endpoints.dart';

// Initialized at main startup
final localStorageProvider = Provider<LocalStorage>((ref) {
  throw UnimplementedError();
});

final apiClientProvider = Provider<ApiClient>((ref) {
  final storage = ref.watch(localStorageProvider);
  return ApiClient(localStorage: storage);
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
          if (sessionTimeout != null && sessionTimeout.isNotEmpty) 'sessionTimeout': sessionTimeout.trim(),
          if (validity != null && validity.isNotEmpty) 'validity': validity.trim(),
          if (price != null) 'price': price,
          if (sharedUsers != null) 'sharedUsers': sharedUsers,
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
        return {
          'success': false,
          'message': err['message']?.toString() ?? 'فشل إنشاء البروفايل على الراوتر',
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
  }) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.patch(
        ApiEndpoints.hotspotProfileItem(id),
        data: {
          'name': name.trim(),
          if (displayName != null) 'displayName': displayName.trim(),
          if (rateLimit != null) 'rateLimit': rateLimit.trim(),
          if (sessionTimeout != null) 'sessionTimeout': sessionTimeout.trim(),
          if (validity != null) 'validity': validity.trim(),
          if (price != null) 'price': price,
          if (sharedUsers != null) 'sharedUsers': sharedUsers,
        },
      );
      await fetchProfiles();
      final raw = res.data;
      if (raw is Map<String, dynamic>) return {'success': true, ...raw};
      return {'success': true, 'message': 'تم تعديل البروفايل بنجاح'};
    } catch (e) {
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        return {
          'success': false,
          'message': err['message']?.toString() ?? 'فشل تعديل البروفايل',
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
        return {
          'success': false,
          'message': err['message']?.toString() ?? 'فشل حذف البروفايل',
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
  String? build() => null;
  void select(String? id) => state = id;
}

final selectedRouterIdProvider = NotifierProvider<SelectedRouterNotifier, String?>(
  SelectedRouterNotifier.new,
);

// Routers List AsyncNotifier
class RoutersNotifier extends AsyncNotifier<List<RouterDeviceModel>> {
  @override
  Future<List<RouterDeviceModel>> build() async {
    return _fetch();
  }

  Future<List<RouterDeviceModel>> _fetch() async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.get(ApiEndpoints.devices);
      final raw = res.data;
      final list = (raw is Map && raw['data'] != null) ? raw['data'] : (raw is List ? raw : []);
      if (list is List) {
        final devices = list.map((d) => RouterDeviceModel.fromJson(d as Map<String, dynamic>)).toList();
        if (devices.isNotEmpty && ref.read(selectedRouterIdProvider) == null) {
          ref.read(selectedRouterIdProvider.notifier).select(devices.first.id);
        }
        return devices;
      }
    } catch (_) {}
    return [];
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetch());
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
}

final routersProvider = AsyncNotifierProvider<RoutersNotifier, List<RouterDeviceModel>>(
  RoutersNotifier.new,
);

// Active Sessions AsyncNotifier (Radar)
class ActiveSessionsNotifier extends AsyncNotifier<List<ActiveSessionModel>> {
  @override
  Future<List<ActiveSessionModel>> build() async {
    final selectedId = ref.watch(selectedRouterIdProvider);
    return _fetch(selectedId);
  }

  Future<List<ActiveSessionModel>> _fetch(String? deviceId) async {
    final apiClient = ref.read(apiClientProvider);
    final url = deviceId != null
        ? '${ApiEndpoints.hotspotSessions}?deviceId=$deviceId'
        : ApiEndpoints.hotspotSessions;
    final res = await apiClient.get(url);
    final raw = res.data;
    final list = (raw is Map && raw['data'] != null) ? raw['data'] : (raw is List ? raw : []);
    if (list is List) {
      return list.map((s) => ActiveSessionModel.fromJson(s as Map<String, dynamic>)).toList();
    }
    return [];
  }

  Future<void> refresh() async {
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

// Financial Report AsyncNotifier
class FinancialReportNotifier extends AsyncNotifier<FinancialReportModel> {
  @override
  Future<FinancialReportModel> build() async {
    return _fetch();
  }

  Future<FinancialReportModel> _fetch() async {
    final apiClient = ref.read(apiClientProvider);
    final res = await apiClient.get(ApiEndpoints.financialReport);
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

// Card Templates AsyncNotifier
class CardTemplatesNotifier extends AsyncNotifier<List<CardTemplateModel>> {
  @override
  Future<List<CardTemplateModel>> build() async {
    return _fetch();
  }

  Future<List<CardTemplateModel>> _fetch() async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.get(ApiEndpoints.cardTemplates);
      final raw = res.data;
      final list = (raw is Map && raw['data'] != null) ? raw['data'] : (raw is List ? raw : []);
      if (list is List && list.isNotEmpty) {
        return list.map((t) => CardTemplateModel.fromJson(t as Map<String, dynamic>)).toList();
      }
    } catch (_) {}

    return [
      CardTemplateModel(
        id: 'tpl-1',
        name: 'ثيم كرة القدم الذهبي (85×54 مم)',
        themePreset: 'FOOTBALL',
        primaryColor: '#065F46',
        accentColor: '#F59E0B',
        widthMm: 85,
        heightMm: 54,
        orientation: 'landscape',
        isDefault: true,
        layoutConfig: {
          'showQr': true,
          'showPin': true,
          'showPrice': true,
          'showValidity': true,
          'showSpeed': true,
          'networkName': 'سودافاي هوتسبوت',
          'headerTitle': 'كأس الذهب - فائق السرعة',
          'instructions': 'امسح الرمز أو أدخل اسم المستخدم للدخول',
        },
      ),
      CardTemplateModel(
        id: 'tpl-2',
        name: 'عيد مبارك الملكي (85×54 مم)',
        themePreset: 'EID_MUBARAK',
        primaryColor: '#1E3A8A',
        accentColor: '#D97706',
        widthMm: 85,
        heightMm: 54,
        orientation: 'landscape',
        layoutConfig: {
          'showQr': true,
          'showPin': true,
          'showPrice': true,
          'showValidity': true,
          'showSpeed': true,
          'networkName': 'شبكة العيد الملكية',
          'headerTitle': 'كل عام وأنتم بخير',
        },
      ),
      CardTemplateModel(
        id: 'tpl-3',
        name: 'الفيروزي الحديث (85×54 مم)',
        themePreset: 'TURQUOISE',
        primaryColor: '#0F766E',
        accentColor: '#06B6D4',
        widthMm: 85,
        heightMm: 54,
        orientation: 'landscape',
        layoutConfig: {
          'showQr': true,
          'showPin': true,
          'showPrice': true,
          'showValidity': true,
          'showSpeed': true,
          'networkName': 'شبكة المستقبل الرقمية',
        },
      ),
      CardTemplateModel(
        id: 'tpl-4',
        name: 'تذكرة كلاسيكية (100×40 مم)',
        themePreset: 'TICKET',
        primaryColor: '#4338CA',
        accentColor: '#EC4899',
        widthMm: 100,
        heightMm: 40,
        orientation: 'landscape',
        layoutConfig: {
          'showQr': true,
          'showPin': true,
          'showPrice': true,
          'showValidity': true,
          'showSpeed': true,
          'networkName': 'تذكرة إنترنت هوتسبوت',
        },
      ),
      CardTemplateModel(
        id: 'tpl-5',
        name: 'مدمج أنيق (70×35 مم)',
        themePreset: 'COMPACT',
        primaryColor: '#334155',
        accentColor: '#64748B',
        widthMm: 70,
        heightMm: 35,
        orientation: 'landscape',
        layoutConfig: {
          'showQr': true,
          'showPin': true,
          'showPrice': true,
          'showValidity': true,
          'showSpeed': true,
          'networkName': 'بطاقة الاتصال المدمجة',
        },
      ),
      CardTemplateModel(
        id: 'tpl-6',
        name: 'شبكة مصغرة مكثفة (50×30 مم)',
        themePreset: 'MINI',
        primaryColor: '#4F46E5',
        accentColor: '#06B6D4',
        widthMm: 50,
        heightMm: 30,
        orientation: 'landscape',
        layoutConfig: {
          'showQr': true,
          'showPin': true,
          'showPrice': true,
          'showValidity': true,
          'showSpeed': false,
          'networkName': 'سودافاي شبكة سريعة',
        },
      ),
    ];
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetch());
  }

  Future<Map<String, dynamic>> createTemplate(CardTemplateModel tpl) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.post(
        ApiEndpoints.cardTemplates,
        data: tpl.toPayload(),
      );
      await refresh();
      final raw = res.data;
      if (raw is Map<String, dynamic>) return {'success': true, ...raw};
      return {'success': true, 'message': 'تم حفظ القالب بنجاح'};
    } catch (e) {
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        return {
          'success': false,
          'message': err['message']?.toString() ?? 'فشل حفظ القالب في الخادم',
        };
      }
      return {'success': false, 'message': 'تعذر الاتصال بالخادم لحفظ القالب'};
    }
  }

  Future<Map<String, dynamic>> updateTemplate(CardTemplateModel tpl) async {
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
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        return {
          'success': false,
          'message': err['message']?.toString() ?? 'فشل تعديل القالب',
        };
      }
      return {'success': false, 'message': 'تعذر الاتصال بالخادم'};
    }
  }

  Future<Map<String, dynamic>> deleteTemplate(String id) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.delete(ApiEndpoints.cardTemplateItem(id));
      await refresh();
      final raw = res.data;
      if (raw is Map<String, dynamic>) return {'success': true, ...raw};
      return {'success': true, 'message': 'تم حذف القالب بنجاح'};
    } catch (e) {
      if (e is DioException && e.response?.data is Map) {
        final err = Map<String, dynamic>.from(e.response!.data as Map);
        return {
          'success': false,
          'message': err['message']?.toString() ?? 'فشل حذف القالب',
        };
      }
      return {'success': false, 'message': 'تعذر الاتصال بالخادم لحذف القالب'};
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
          final model = TenantQuotaModel.fromJson(subMap);
          await storage.setTenantQuota(model, currentTenantId);
          return model;
        }
      } catch (_) {}
    }
    return storage.getTenantQuota(currentTenantId);
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

