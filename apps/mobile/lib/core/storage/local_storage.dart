import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/models.dart';
import '../constants/api_endpoints.dart';

class LocalStorage {
  static const String _tokenKey = 'auth_token';
  static const String _userKey = 'auth_user';
  static const String _baseUrlKey = 'server_base_url';
  static const String _cardsKey = 'offline_cards';
  static const String _mutationsKey = 'offline_mutations';
  static const String _profilesKey = 'cached_profiles';
  static const String _salesHistoryKey = 'local_sales_history';

  final SharedPreferences _prefs;

  LocalStorage(this._prefs);

  static Future<LocalStorage> init() async {
    final prefs = await SharedPreferences.getInstance();
    return LocalStorage(prefs);
  }

  // --- Base URL ---
  String getBaseUrl() {
    return _prefs.getString(_baseUrlKey) ?? ApiEndpoints.defaultBaseUrl;
  }

  Future<void> setBaseUrl(String url) async {
    await _prefs.setString(_baseUrlKey, url);
  }

  // --- Auth Token ---
  String? getToken() {
    return _prefs.getString(_tokenKey);
  }

  Future<void> setToken(String token) async {
    await _prefs.setString(_tokenKey, token);
  }

  Future<void> clearAuth() async {
    await _prefs.remove(_tokenKey);
    await _prefs.remove(_userKey);
  }

  // --- Auth User ---
  AuthUser? getUser() {
    final raw = _prefs.getString(_userKey);
    if (raw == null) return null;
    try {
      return AuthUser.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> setUser(AuthUser user) async {
    await _prefs.setString(_userKey, jsonEncode(user.toJson()));
  }

  // --- Offline Reserved Cards Pool ---
  List<OfflineCardModel> getOfflineCards() {
    final raw = _prefs.getStringList(_cardsKey) ?? [];
    return raw
        .map((str) => OfflineCardModel.fromJson(jsonDecode(str) as Map<String, dynamic>))
        .toList();
  }

  Future<void> saveOfflineCards(List<OfflineCardModel> cards) async {
    final raw = cards.map((c) => jsonEncode(c.toJson())).toList();
    await _prefs.setStringList(_cardsKey, raw);
  }

  Future<void> addOfflineCards(List<OfflineCardModel> newCards) async {
    final current = getOfflineCards();
    final Map<String, OfflineCardModel> map = {
      for (final c in current) c.id: c,
    };
    for (final c in newCards) {
      map[c.id] = c;
    }
    await saveOfflineCards(map.values.toList());
  }

  Future<void> updateCardStatus(String cardId, String status) async {
    final cards = getOfflineCards();
    final index = cards.indexWhere((c) => c.id == cardId);
    if (index != -1) {
      cards[index].status = status;
      if (status == 'SOLD') {
        cards[index].soldAt = DateTime.now();
      }
      await saveOfflineCards(cards);
    }
  }

  // --- Offline Mutations Queue ---
  List<OfflineMutationModel> getMutations() {
    final raw = _prefs.getStringList(_mutationsKey) ?? [];
    return raw
        .map((str) => OfflineMutationModel.fromJson(jsonDecode(str) as Map<String, dynamic>))
        .toList();
  }

  Future<void> saveMutations(List<OfflineMutationModel> mutations) async {
    final raw = mutations.map((m) => jsonEncode(m.toJson())).toList();
    await _prefs.setStringList(_mutationsKey, raw);
  }

  Future<void> addMutation(OfflineMutationModel mutation) async {
    final current = getMutations();
    current.add(mutation);
    await saveMutations(current);
  }

  Future<void> removeAppliedMutations(List<String> clientMutationIds) async {
    final current = getMutations();
    current.removeWhere((m) => clientMutationIds.contains(m.clientMutationId));
    await saveMutations(current);
  }

  // --- Cached Profiles ---
  List<HotspotProfileModel> getCachedProfiles() {
    final raw = _prefs.getStringList(_profilesKey) ?? [];
    return raw
        .map((str) => HotspotProfileModel.fromJson(jsonDecode(str) as Map<String, dynamic>))
        .toList();
  }

  Future<void> saveCachedProfiles(List<HotspotProfileModel> profiles) async {
    final raw = profiles.map((p) => jsonEncode(p.toJson())).toList();
    await _prefs.setStringList(_profilesKey, raw);
  }

  // --- Local Sales History ---
  List<SaleReceiptModel> getSalesHistory() {
    final raw = _prefs.getStringList(_salesHistoryKey) ?? [];
    return raw.map((str) {
      final json = jsonDecode(str) as Map<String, dynamic>;
      return SaleReceiptModel(
        invoiceNumber: json['invoiceNumber'] as String,
        serialNumber: json['serialNumber'] as String,
        username: json['username'] as String,
        password: json['password'] as String?,
        profileName: json['profileName'] as String,
        amount: (json['amount'] as num).toDouble(),
        currency: json['currency'] as String,
        paymentMethod: json['paymentMethod'] as String,
        soldAt: DateTime.parse(json['soldAt'] as String),
        cashierName: json['cashierName'] as String,
        customerPhone: json['customerPhone'] as String?,
        isOffline: json['isOffline'] as bool? ?? false,
      );
    }).toList();
  }

  Future<void> addSaleReceipt(SaleReceiptModel receipt) async {
    final raw = _prefs.getStringList(_salesHistoryKey) ?? [];
    final json = {
      'invoiceNumber': receipt.invoiceNumber,
      'serialNumber': receipt.serialNumber,
      'username': receipt.username,
      'password': receipt.password,
      'profileName': receipt.profileName,
      'amount': receipt.amount,
      'currency': receipt.currency,
      'paymentMethod': receipt.paymentMethod,
      'soldAt': receipt.soldAt.toIso8601String(),
      'cashierName': receipt.cashierName,
      'customerPhone': receipt.customerPhone,
      'isOffline': receipt.isOffline,
    };
    raw.insert(0, jsonEncode(json)); // Most recent first
    if (raw.length > 500) raw.removeRange(500, raw.length); // Cap at 500 records
    await _prefs.setStringList(_salesHistoryKey, raw);
  }
}
