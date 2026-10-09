import 'package:uuid/uuid.dart';
import '../models/models.dart';
import '../network/api_client.dart';
import '../storage/local_storage.dart';
import '../constants/api_endpoints.dart';

class SyncResult {
  final int appliedCount;
  final int conflictCount;
  final int rejectedCount;
  final String? errorMessage;

  SyncResult({
    required this.appliedCount,
    required this.conflictCount,
    required this.rejectedCount,
    this.errorMessage,
  });
}

class OfflineSyncManager {
  final ApiClient apiClient;
  final LocalStorage localStorage;
  final _uuid = const Uuid();

  OfflineSyncManager({
    required this.apiClient,
    required this.localStorage,
  });

  /// Push all pending offline mutations to the backend server with conflict reconciliation
  Future<SyncResult> pushPendingMutations() async {
    final mutations = localStorage.getMutations();
    final pending = mutations.where((m) => m.status == 'PENDING').toList();

    if (pending.isEmpty) {
      return SyncResult(appliedCount: 0, conflictCount: 0, rejectedCount: 0);
    }

    try {
      final payload = {
        'mutations': pending.map((m) => {
          'clientMutationId': m.clientMutationId,
          'type': m.type,
          'payload': m.payload,
          'createdAt': m.createdAt.toIso8601String(),
        }).toList(),
      };

      final response = await apiClient.post(
        ApiEndpoints.syncPush,
        data: payload,
      );

      final data = response.data;
      final processedRaw = (data is Map && data['data'] != null)
          ? data['data']['processedMutations'] as List? ?? []
          : (data is Map && data['processedMutations'] != null)
              ? data['processedMutations'] as List? ?? []
              : [];

      int applied = 0;
      int conflicts = 0;
      int rejected = 0;
      final List<String> appliedIds = [];

      for (final item in processedRaw) {
        final id = item['clientMutationId'] as String?;
        final status = item['status'] as String?;
        final error = item['error'] as String?;

        if (id == null) continue;

        if (status == 'APPLIED') {
          applied++;
          appliedIds.add(id);
        } else if (status == 'CONFLICT') {
          conflicts++;
          final idx = mutations.indexWhere((m) => m.clientMutationId == id);
          if (idx != -1) {
            mutations[idx].status = 'CONFLICT';
            mutations[idx].error = error ?? 'تعارض: تم بيع أو تعديل البطاقة مسبقاً على الخادم';
          }
        } else {
          rejected++;
          final idx = mutations.indexWhere((m) => m.clientMutationId == id);
          if (idx != -1) {
            mutations[idx].status = 'REJECTED';
            mutations[idx].error = error ?? 'تم رفض العملية من الخادم';
          }
        }
      }

      // Remove applied mutations from queue
      mutations.removeWhere((m) => appliedIds.contains(m.clientMutationId));
      await localStorage.saveMutations(mutations);

      return SyncResult(
        appliedCount: applied,
        conflictCount: conflicts,
        rejectedCount: rejected,
      );
    } catch (e) {
      return SyncResult(
        appliedCount: 0,
        conflictCount: 0,
        rejectedCount: 0,
        errorMessage: e.toString(),
      );
    }
  }

  /// Pull delta catalog (profiles & devices) from server and update local cache
  Future<bool> pullCatalog() async {
    try {
      final response = await apiClient.get(ApiEndpoints.syncPull);
      final raw = response.data;
      final data = (raw is Map && raw['data'] != null) ? raw['data'] : raw;

      if (data is Map && data['profiles'] != null) {
        final profilesList = (data['profiles'] as List)
            .map((p) => HotspotProfileModel.fromJson(p as Map<String, dynamic>))
            .toList();
        await localStorage.saveCachedProfiles(profilesList);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Reserve a batch of pre-generated cards from server to local wallet for offline use
  Future<List<OfflineCardModel>> reserveCards({
    required String profileId,
    required int count,
    String? deviceId,
  }) async {
    final Map<String, dynamic> data = {
      'profileId': profileId,
      'quantity': count,
    };
    if (deviceId != null && deviceId.isNotEmpty) {
      data['deviceId'] = deviceId;
    }

    final response = await apiClient.post(
      ApiEndpoints.syncReserveCards,
      data: data,
    );

    final raw = response.data;
    final payload = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
    final List list = (payload is List)
        ? payload
        : (payload is Map && payload['cards'] is List)
            ? payload['cards'] as List
            : [];

    final cardsList = list
        .map((c) => OfflineCardModel.fromJson(c as Map<String, dynamic>))
        .toList();

    if (cardsList.isNotEmpty) {
      await localStorage.addOfflineCards(cardsList);
    }
    return cardsList;
  }

  /// Sells a card from the local offline pool, enqueues mutation, and returns thermal receipt
  Future<SaleReceiptModel> sellCardOffline({
    required String profileId,
    required String paymentMethod,
    String? customerPhone,
    String? customerName,
  }) async {
    final cards = localStorage.getOfflineCards();
    final availableCard = cards.cast<OfflineCardModel?>().firstWhere(
          (c) => c != null && c.profileId == profileId && c.status == 'AVAILABLE',
          orElse: () => null,
        );

    if (availableCard == null) {
      throw Exception('لا توجد بطاقات متوفرة دون اتصال لهذه الباقة. يرجى حجز بطاقات أولاً.');
    }

    // 1. Mark card locally as SOLD
    availableCard.status = 'SOLD';
    availableCard.soldAt = DateTime.now();
    await localStorage.updateCardStatus(availableCard.id, 'SOLD');

    // 2. Enqueue offline mutation with unique clientMutationId
    final mutationId = _uuid.v4();
    final mutation = OfflineMutationModel(
      clientMutationId: mutationId,
      type: 'SALE',
      payload: {
        'cardId': availableCard.id,
        'paymentMethod': paymentMethod,
        if (customerPhone != null && customerPhone.isNotEmpty) 'customerPhone': customerPhone,
        if (customerName != null && customerName.isNotEmpty) 'customerName': customerName,
      },
      createdAt: DateTime.now(),
      status: 'PENDING',
    );
    await localStorage.addMutation(mutation);

    // 3. Create local sale receipt
    final user = localStorage.getUser();
    final invoiceNumber = 'OFF-${DateTime.now().millisecondsSinceEpoch.toString().substring(5)}';

    final receipt = SaleReceiptModel(
      invoiceNumber: invoiceNumber,
      serialNumber: availableCard.serialNumber,
      username: availableCard.username,
      password: availableCard.clearPassword,
      profileName: availableCard.profileName,
      amount: availableCard.price,
      currency: availableCard.currency,
      paymentMethod: paymentMethod,
      soldAt: DateTime.now(),
      cashierName: user?.fullName ?? 'الكاشير',
      customerPhone: customerPhone,
      isOffline: true,
    );

    await localStorage.addSaleReceipt(receipt);
    return receipt;
  }
}
