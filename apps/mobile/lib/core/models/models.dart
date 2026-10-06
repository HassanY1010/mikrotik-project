import 'dart:convert';

/// Authenticated user representation
class AuthUser {
  final String id;
  final String email;
  final String fullName;
  final String role;
  final String tenantId;
  final String? tenantName;

  AuthUser({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
    required this.tenantId,
    this.tenantName,
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: json['id'] as String,
      email: json['email'] as String,
      fullName: json['fullName'] as String? ?? json['name'] as String? ?? '',
      role: json['role'] as String? ?? 'CASHIER',
      tenantId: json['tenantId'] as String? ?? '',
      tenantName: json['tenantName'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'email': email,
    'fullName': fullName,
    'role': role,
    'tenantId': tenantId,
    'tenantName': tenantName,
  };
}

/// Hotspot package/profile model
class HotspotProfileModel {
  final String id;
  final String name;
  final String? displayName;
  final String deviceId;
  final String? deviceName;
  final double price;
  final String? validity;
  final String? rateLimit;

  HotspotProfileModel({
    required this.id,
    required this.name,
    this.displayName,
    required this.deviceId,
    this.deviceName,
    required this.price,
    this.validity,
    this.rateLimit,
  });

  factory HotspotProfileModel.fromJson(Map<String, dynamic> json) {
    return HotspotProfileModel(
      id: json['id'] as String,
      name: json['name'] as String,
      displayName: json['displayName'] as String? ?? json['name'] as String,
      deviceId: json['deviceId'] as String? ?? '',
      deviceName: json['device']?['name'] as String?,
      price: (json['price'] != null) ? double.tryParse(json['price'].toString()) ?? 0.0 : 0.0,
      validity: json['validity'] as String?,
      rateLimit: json['rateLimit'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'displayName': displayName,
    'deviceId': deviceId,
    'deviceName': deviceName,
    'price': price,
    'validity': validity,
    'rateLimit': rateLimit,
  };
}

/// Offline reserved card model
class OfflineCardModel {
  final String id;
  final String serialNumber;
  final String username;
  final String? clearPassword;
  final String profileId;
  final String profileName;
  final String deviceId;
  final double price;
  final String currency;
  String status; // AVAILABLE, SOLD, ACTIVE, DISABLED
  DateTime? soldAt;

  OfflineCardModel({
    required this.id,
    required this.serialNumber,
    required this.username,
    this.clearPassword,
    required this.profileId,
    required this.profileName,
    required this.deviceId,
    required this.price,
    required this.currency,
    this.status = 'AVAILABLE',
    this.soldAt,
  });

  factory OfflineCardModel.fromJson(Map<String, dynamic> json) {
    return OfflineCardModel(
      id: json['id'] as String,
      serialNumber: json['serialNumber'] as String,
      username: json['username'] as String,
      clearPassword: json['clearPassword'] as String?,
      profileId: json['profileId'] as String? ?? '',
      profileName: json['profileName'] as String? ?? 'Hotspot Card',
      deviceId: json['deviceId'] as String? ?? '',
      price: (json['price'] != null) ? double.tryParse(json['price'].toString()) ?? 0.0 : 0.0,
      currency: json['currency'] as String? ?? 'YER',
      status: json['status'] as String? ?? 'AVAILABLE',
      soldAt: json['soldAt'] != null ? DateTime.tryParse(json['soldAt'] as String) : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'serialNumber': serialNumber,
    'username': username,
    'clearPassword': clearPassword,
    'profileId': profileId,
    'profileName': profileName,
    'deviceId': deviceId,
    'price': price,
    'currency': currency,
    'status': status,
    'soldAt': soldAt?.toIso8601String(),
  };

  /// Quick Hotspot login URL for QR code
  String get loginUrl => 'http://login.hotspot/login?username=$username&password=${clearPassword ?? username}';
}

/// Offline mutation item queued for background sync
class OfflineMutationModel {
  final String clientMutationId;
  final String type; // 'SALE' or 'CARD_STATUS'
  final Map<String, dynamic> payload;
  final DateTime createdAt;
  String status; // 'PENDING', 'APPLIED', 'CONFLICT', 'REJECTED'
  String? error;

  OfflineMutationModel({
    required this.clientMutationId,
    required this.type,
    required this.payload,
    required this.createdAt,
    this.status = 'PENDING',
    this.error,
  });

  factory OfflineMutationModel.fromJson(Map<String, dynamic> json) {
    return OfflineMutationModel(
      clientMutationId: json['clientMutationId'] as String,
      type: json['type'] as String,
      payload: (json['payload'] is Map)
          ? Map<String, dynamic>.from(json['payload'] as Map)
          : (json['payload'] is String ? jsonDecode(json['payload'] as String) : {}),
      createdAt: DateTime.parse(json['createdAt'] as String),
      status: json['status'] as String? ?? 'PENDING',
      error: json['error'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'clientMutationId': clientMutationId,
    'type': type,
    'payload': payload,
    'createdAt': createdAt.toIso8601String(),
    'status': status,
    'error': error,
  };
}

/// Sale receipt generated upon successful sale (online or offline)
class SaleReceiptModel {
  final String invoiceNumber;
  final String serialNumber;
  final String username;
  final String? password;
  final String profileName;
  final double amount;
  final String currency;
  final String paymentMethod;
  final DateTime soldAt;
  final String cashierName;
  final String? customerPhone;
  final bool isOffline;

  SaleReceiptModel({
    required this.invoiceNumber,
    required this.serialNumber,
    required this.username,
    this.password,
    required this.profileName,
    required this.amount,
    required this.currency,
    required this.paymentMethod,
    required this.soldAt,
    required this.cashierName,
    this.customerPhone,
    this.isOffline = false,
  });

  String get loginUrl => 'http://login.hotspot/login?username=$username&password=${password ?? username}';
}

/// Daily cashier shift summary
class ShiftSummaryModel {
  final double totalRevenue;
  final int totalSalesCount;
  final String currency;
  final List<ShiftProfileSummary> profileBreakdown;

  ShiftSummaryModel({
    required this.totalRevenue,
    required this.totalSalesCount,
    required this.currency,
    required this.profileBreakdown,
  });

  factory ShiftSummaryModel.fromJson(Map<String, dynamic> json) {
    final breakdownRaw = json['profileBreakdown'] as List? ?? [];
    return ShiftSummaryModel(
      totalRevenue: (json['totalRevenue'] != null)
          ? double.tryParse(json['totalRevenue'].toString()) ?? 0.0
          : 0.0,
      totalSalesCount: json['totalSalesCount'] as int? ?? 0,
      currency: json['currency'] as String? ?? 'YER',
      profileBreakdown: breakdownRaw
          .map((item) => ShiftProfileSummary.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }
}

class ShiftProfileSummary {
  final String profileName;
  final int count;
  final double totalAmount;

  ShiftProfileSummary({
    required this.profileName,
    required this.count,
    required this.totalAmount,
  });

  factory ShiftProfileSummary.fromJson(Map<String, dynamic> json) {
    return ShiftProfileSummary(
      profileName: json['profileName'] as String? ?? 'General',
      count: json['count'] as int? ?? 0,
      totalAmount: (json['totalAmount'] != null)
          ? double.tryParse(json['totalAmount'].toString()) ?? 0.0
          : 0.0,
    );
  }
}
