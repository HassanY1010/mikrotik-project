import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'models/models.dart';
import 'network/api_client.dart';
import 'storage/local_storage.dart';
import 'sync/offline_sync_manager.dart';

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
      final response = await apiClient.get('/hotspot/profiles');
      final raw = response.data;
      final list = (raw is Map && raw['data'] != null)
          ? raw['data'] as List
          : (raw is List ? raw : []);

      final profiles = list.map((p) => HotspotProfileModel.fromJson(p as Map<String, dynamic>)).toList();
      await storage.saveCachedProfiles(profiles);
      state = profiles;
    } catch (_) {
      state = storage.getCachedProfiles();
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
