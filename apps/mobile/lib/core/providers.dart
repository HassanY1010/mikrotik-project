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
      if (list is List && list.isNotEmpty) {
        final devices = list.map((d) => RouterDeviceModel.fromJson(d as Map<String, dynamic>)).toList();
        if (devices.isNotEmpty && ref.read(selectedRouterIdProvider) == null) {
          ref.read(selectedRouterIdProvider.notifier).select(devices.first.id);
        }
        return devices;
      }
    } catch (_) {}

    // Graceful default device for display
    final fallback = [
      RouterDeviceModel(
        id: 'dev-demo-1',
        name: 'راوتر البرج الرئيسي',
        host: '192.168.88.1',
        modelName: 'RB4011iGS+5HacQ2HnD',
        status: 'ONLINE',
        isOnline: true,
        cpuLoad: 18,
        memoryFreeMb: 720,
        memoryTotalMb: 1024,
        diskFreeMb: 380,
        diskTotalMb: 512,
        uptime: '14d 06:32:15',
        rosVersion: '7.14.3',
        antiTetheringEnabled: true,
        isLocked: false,
      ),
    ];
    if (ref.read(selectedRouterIdProvider) == null) {
      ref.read(selectedRouterIdProvider.notifier).select(fallback.first.id);
    }
    return fallback;
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetch());
  }

  Future<bool> toggleEmergencyLock(String deviceId, bool lock) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      await apiClient.post(ApiEndpoints.deviceEmergencyLock(deviceId), data: {'lock': lock});
      await refresh();
      return true;
    } catch (_) {
      state.whenData((devices) {
        state = AsyncValue.data(devices.map((d) => d.id == deviceId ? d.copyWith(isLocked: lock) : d).toList());
      });
      return false;
    }
  }

  Future<bool> toggleAntiTethering(String deviceId, bool enable) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      await apiClient.post(ApiEndpoints.deviceAntiTethering(deviceId), data: {'enable': enable});
      await refresh();
      return true;
    } catch (_) {
      state.whenData((devices) {
        state = AsyncValue.data(devices.map((d) => d.id == deviceId ? d.copyWith(antiTetheringEnabled: enable) : d).toList());
      });
      return false;
    }
  }

  Future<bool> testConnection(String deviceId) async {
    final apiClient = ref.read(apiClientProvider);
    try {
      final res = await apiClient.post(ApiEndpoints.deviceTest(deviceId));
      await refresh();
      return (res.statusCode == 200);
    } catch (_) {
      return false;
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
      CardTemplateModel(id: 'tpl-1', name: 'ثيم كرة القدم الذهبي', themePreset: 'FOOTBALL', primaryColor: '#059669', accentColor: '#F59E0B', isDefault: true),
      CardTemplateModel(id: 'tpl-2', name: 'عيد مبارك الملكي', themePreset: 'EID_MUBARAK', primaryColor: '#1E3A8A', accentColor: '#D97706'),
      CardTemplateModel(id: 'tpl-3', name: 'الفيروزي الحديث', themePreset: 'TURQUOISE', primaryColor: '#0D9488', accentColor: '#06B6D4'),
      CardTemplateModel(id: 'tpl-4', name: 'تذكرة مفرغة (Ticket)', themePreset: 'TICKET', primaryColor: '#4F46E5', accentColor: '#EC4899'),
      CardTemplateModel(id: 'tpl-5', name: 'مدمج أنيق (Compact)', themePreset: 'COMPACT', primaryColor: '#334155', accentColor: '#64748B'),
    ];
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetch());
  }
}

final cardTemplatesProvider = AsyncNotifierProvider<CardTemplatesNotifier, List<CardTemplateModel>>(
  CardTemplatesNotifier.new,
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
          errorMessage: 'تعذر الاتصال بالخادم لجلب بيانات المخزون. يرجى التحقق من الشبكة وإعادة المحاولة.',
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

  Future<void> refresh() async {
    await loadInventory(isRefresh: true);
  }
}

final cardsInventoryProvider = NotifierProvider<CardsInventoryNotifier, CardsInventoryState>(
  CardsInventoryNotifier.new,
);

