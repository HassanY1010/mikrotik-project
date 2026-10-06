import 'package:flutter_riverpod/flutter_riverpod.dart';
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

    var cached = storage.getCachedProfiles();
    if (cached.isEmpty) {
      cached = [
        HotspotProfileModel(
          id: '0a4a706d-e416-4131-b4de-82f90db91e59',
          name: '1hour-unlimited',
          displayName: 'باقة 1 ساعة',
          deviceId: '9ec647f8-3f39-43c6-814d-31c93957ab89',
          price: 200,
          validity: '1h',
          rateLimit: '2M/1M',
        ),
        HotspotProfileModel(
          id: 'b3723ae2-6932-4123-a72c-7d71330c8b9a',
          name: '3hours-unlimited',
          displayName: 'باقة 3 ساعات',
          deviceId: '9ec647f8-3f39-43c6-814d-31c93957ab89',
          price: 500,
          validity: '3h',
          rateLimit: '3M/1M',
        ),
        HotspotProfileModel(
          id: '665d0a0e-65d9-4edf-b6f5-09823d6c93f1',
          name: '1day-unlimited',
          displayName: 'باقة 1 يوم',
          deviceId: '9ec647f8-3f39-43c6-814d-31c93957ab89',
          price: 1200,
          validity: '24h',
          rateLimit: '4M/2M',
        ),
        HotspotProfileModel(
          id: '717e4c94-da54-4a30-8f84-4c248951337c',
          name: '1week-unlimited',
          displayName: 'باقة أسبوعية',
          deviceId: '9ec647f8-3f39-43c6-814d-31c93957ab89',
          price: 5000,
          validity: '7d',
          rateLimit: '5M/2M',
        ),
      ];
      await storage.saveCachedProfiles(cached);
    }
    state = cached;
  }

  void refreshFromStorage() {
    final storage = ref.read(localStorageProvider);
    state = storage.getCachedProfiles();
  }
}

final profilesProvider = NotifierProvider<CachedProfilesNotifier, List<HotspotProfileModel>>(
  CachedProfilesNotifier.new,
);
