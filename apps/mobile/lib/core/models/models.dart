import 'dart:convert';
import 'package:flutter/material.dart';

/// Authenticated user representation
class AuthUser {
  final String id;
  final String email;
  final String fullName;
  final String role;
  final String tenantId;
  final String? tenantName;
  final String? phone;
  final String? status;
  final String? currency;
  final DateTime? createdAt;
  final String? subscriptionPlan;
  final String? subscriptionPlanAr;
  final DateTime? subscriptionExpiresAt;
  final String subscriptionStatus;

  AuthUser({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
    required this.tenantId,
    this.tenantName,
    this.phone,
    this.status,
    this.currency,
    this.createdAt,
    this.subscriptionPlan,
    this.subscriptionPlanAr,
    this.subscriptionExpiresAt,
    this.subscriptionStatus = 'ACTIVE',
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    final tenantObj = json['tenant'] is Map ? json['tenant'] as Map : null;
    final subObj = (tenantObj?['subscription'] is Map)
        ? tenantObj!['subscription'] as Map
        : (json['subscription'] is Map ? json['subscription'] as Map : null);

    final role = json['role'] as String? ?? 'CASHIER';
    final isSuperAdmin = role.toUpperCase() == 'SUPER_ADMIN';

    final subPlan = json['subscriptionPlan'] as String? ??
        subObj?['planName'] as String? ??
        subObj?['plan'] as String? ??
        tenantObj?['plan'] as String? ??
        (isSuperAdmin ? 'ENTERPRISE' : null);

    final subPlanAr = json['subscriptionPlanAr'] as String? ??
        subObj?['planNameAr'] as String? ??
        (isSuperAdmin ? 'باقة المشرف العام (شاملة)' : null);

    final subExpires = json['subscriptionExpiresAt'] != null
        ? DateTime.tryParse(json['subscriptionExpiresAt'].toString())
        : (subObj?['expiresAt'] != null
            ? DateTime.tryParse(subObj!['expiresAt'].toString())
            : (isSuperAdmin ? DateTime.now().add(const Duration(days: 3650)) : null));

    final subStatus = json['subscriptionStatus'] as String? ??
        subObj?['status'] as String? ??
        (subPlan != null ? 'ACTIVE' : (isSuperAdmin ? 'ACTIVE' : 'NONE'));

    return AuthUser(
      id: json['id'] as String? ?? '',
      email: json['email'] as String? ?? '',
      fullName: json['fullName'] as String? ?? json['name'] as String? ?? '',
      role: json['role'] as String? ?? 'CASHIER',
      tenantId: json['tenantId'] as String? ?? '',
      tenantName: json['tenantName'] as String? ?? tenantObj?['name'] as String?,
      phone: json['phone'] as String?,
      status: json['status'] as String? ?? 'ACTIVE',
      currency: json['currency'] as String? ?? tenantObj?['currency'] as String? ?? 'SDG',
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt'].toString()) : null,
      subscriptionPlan: subPlan,
      subscriptionPlanAr: subPlanAr,
      subscriptionExpiresAt: subExpires,
      subscriptionStatus: subStatus,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'email': email,
    'fullName': fullName,
    'role': role,
    'tenantId': tenantId,
    'tenantName': tenantName,
    'phone': phone,
    'status': status,
    'currency': currency,
    'createdAt': createdAt?.toIso8601String(),
    'subscriptionPlan': subscriptionPlan,
    'subscriptionPlanAr': subscriptionPlanAr,
    'subscriptionExpiresAt': subscriptionExpiresAt?.toIso8601String(),
    'subscriptionStatus': subscriptionStatus,
  };

  AuthUser copyWith({
    String? id,
    String? email,
    String? fullName,
    String? role,
    String? tenantId,
    String? tenantName,
    String? phone,
    String? status,
    String? currency,
    DateTime? createdAt,
    String? subscriptionPlan,
    String? subscriptionPlanAr,
    DateTime? subscriptionExpiresAt,
    String? subscriptionStatus,
  }) {
    return AuthUser(
      id: id ?? this.id,
      email: email ?? this.email,
      fullName: fullName ?? this.fullName,
      role: role ?? this.role,
      tenantId: tenantId ?? this.tenantId,
      tenantName: tenantName ?? this.tenantName,
      phone: phone ?? this.phone,
      status: status ?? this.status,
      currency: currency ?? this.currency,
      createdAt: createdAt ?? this.createdAt,
      subscriptionPlan: subscriptionPlan ?? this.subscriptionPlan,
      subscriptionPlanAr: subscriptionPlanAr ?? this.subscriptionPlanAr,
      subscriptionExpiresAt: subscriptionExpiresAt ?? this.subscriptionExpiresAt,
      subscriptionStatus: subscriptionStatus ?? this.subscriptionStatus,
    );
  }
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
  final String? sessionTimeout;
  final String? rateLimit;
  final int availableCards;
  final int? dataLimitBytes;
  final double? dataLimitGb;

  bool get isUnlimited =>
      (dataLimitBytes == null || dataLimitBytes == 0) &&
      (dataLimitGb == null || dataLimitGb == 0);

  /// True if the profile is completely open (no data limit and no validity duration)
  bool get isOpenCard =>
      isUnlimited &&
      (validity == null || validity!.trim().isEmpty || validity == '0' || validity == 'none') &&
      (sessionTimeout == null || sessionTimeout!.trim().isEmpty || sessionTimeout == '0' || sessionTimeout == 'none');

  double? get quotaGb {
    if (dataLimitGb != null && dataLimitGb! > 0) return dataLimitGb;
    if (dataLimitBytes != null && dataLimitBytes! > 0) {
      return dataLimitBytes! / (1024 * 1024 * 1024);
    }
    return null;
  }

  double? get quotaMb {
    if (dataLimitBytes != null && dataLimitBytes! > 0) {
      return dataLimitBytes! / (1024 * 1024);
    }
    if (dataLimitGb != null && dataLimitGb! > 0) {
      return dataLimitGb! * 1024;
    }
    return null;
  }

  /// Formatted string showing data limit in MB or GB appropriately
  String get formattedDataLimit {
    if (isUnlimited) return 'مفتوح';
    final mb = quotaMb;
    if (mb == null) return 'مفتوح';
    if (mb >= 1024 && (mb % 1024 == 0 || mb >= 10240)) {
      final gb = mb / 1024;
      return '${gb % 1 == 0 ? gb.toInt() : gb.toStringAsFixed(1)} GB';
    }
    return '${mb % 1 == 0 ? mb.toInt() : mb.toStringAsFixed(1)} MB';
  }

  HotspotProfileModel({
    required this.id,
    required this.name,
    this.displayName,
    required this.deviceId,
    this.deviceName,
    required this.price,
    this.validity,
    this.sessionTimeout,
    this.rateLimit,
    this.availableCards = 0,
    this.dataLimitBytes,
    this.dataLimitGb,
  });

  factory HotspotProfileModel.fromJson(Map<String, dynamic> json) {
    final rawName = json['name'] as String? ?? 'باقة هوتسبوت';
    String friendlyName = json['displayName'] as String? ?? rawName;
    double rawPrice = (json['price'] != null) ? double.tryParse(json['price'].toString()) ?? 0.0 : 0.0;

    // Friendly Arabic naming for standard profiles if english slug is used
    if (friendlyName == rawName) {
      if (rawName.contains('1hour') || rawName.contains('1h')) {
        friendlyName = 'باقة 1 ساعة';
        if (rawPrice == 0) rawPrice = 200;
      } else if (rawName.contains('3hour') || rawName.contains('3h')) {
        friendlyName = 'باقة 3 ساعات';
        if (rawPrice == 0) rawPrice = 500;
      } else if (rawName.contains('1day') || rawName.contains('day')) {
        friendlyName = 'باقة 1 يوم';
        if (rawPrice == 0) rawPrice = 1200;
      } else if (rawName.contains('1week') || rawName.contains('week')) {
        friendlyName = 'باقة أسبوعية';
        if (rawPrice == 0) rawPrice = 5000;
      }
    }

    final rawBytes = (json['dataLimitBytes'] as num?)?.toInt();
    final rawGb = (json['dataLimitGb'] as num?)?.toDouble() ??
        (rawBytes != null && rawBytes > 0
            ? rawBytes / (1024 * 1024 * 1024)
            : null);

    return HotspotProfileModel(
      id: json['id'] as String,
      name: rawName,
      displayName: friendlyName,
      deviceId: json['deviceId'] as String? ?? '',
      deviceName: json['device']?['name'] as String?,
      price: rawPrice > 0 ? rawPrice : 200.0,
      validity: json['validity'] as String? ?? json['sessionTimeout'] as String?,
      sessionTimeout: json['sessionTimeout'] as String? ?? json['validity'] as String?,
      rateLimit: json['rateLimit'] as String?,
      availableCards: (json['availableCards'] as num?)?.toInt() ?? 0,
      dataLimitBytes: rawBytes,
      dataLimitGb: rawGb,
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
    'sessionTimeout': sessionTimeout,
    'rateLimit': rateLimit,
    'availableCards': availableCards,
    'dataLimitBytes': dataLimitBytes,
    'dataLimitGb': dataLimitGb,
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
      clearPassword: (json['clearPassword'] ?? json['password'] ?? json['pinCode']) as String?,
      profileId: json['profileId'] as String? ?? '',
      profileName: json['profileName'] as String? ?? 'Hotspot Card',
      deviceId: json['deviceId'] as String? ?? '',
      price: (json['price'] != null) ? double.tryParse(json['price'].toString()) ?? 0.0 : 0.0,
      currency: json['currency'] as String? ?? 'SDG',
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

/// Real HotSpot prepaid card model from API/Database
class CardModel {
  final String id;
  final String serialNumber;
  final String username;
  final String? clearPassword;
  final String? pinCode;
  final double price;
  final String status;
  final String? profileId;
  final String profileName;
  final String? deviceName;
  final String? batchNumber;
  final String? invoiceNumber;
  final String? timeLimit;
  final String? rateLimit;
  final DateTime createdAt;
  final DateTime? soldAt;
  final DateTime? activatedAt;
  final DateTime? expiresAt;
  final int? validityDays;
  final int? dataLimitBytes;
  final int? profileDataLimitBytes;
  final int? _effectiveDataLimitBytes;
  int? get effectiveDataLimitBytes => _effectiveDataLimitBytes ?? dataLimitBytes ?? profileDataLimitBytes;

  final String? effectiveTimeLimit;
  final String? profileSessionTimeout;
  final String? downloadSpeedLimit;
  final String? uploadSpeedLimit;
  final bool isUnlimitedSpeed;
  final bool? _isUnlimitedQuota;
  bool get isUnlimitedQuota =>
      _isUnlimitedQuota ??
      (profileId != null &&
          (effectiveDataLimitBytes == null || effectiveDataLimitBytes == 0) &&
          (dataLimitBytes == null || dataLimitBytes == 0) &&
          (profileDataLimitBytes == null || profileDataLimitBytes == 0));

  final bool isCustomQuota;
  final String lifecycleStatus; // NEW, USED, EXPIRED, DISABLED, SOLD
  final int? consumedBytes;
  final int? remainingBytes;
  final double? consumptionPercentage;
  final bool? isOnline;
  final bool hasLiveAccounting;
  final String? sessionUptime;
  final String? sessionTimeLeft;

  CardModel({
    required this.id,
    required this.serialNumber,
    required this.username,
    this.clearPassword,
    this.pinCode,
    required this.price,
    required this.status,
    this.profileId,
    required this.profileName,
    this.deviceName,
    this.batchNumber,
    this.invoiceNumber,
    this.timeLimit,
    this.rateLimit,
    required this.createdAt,
    this.soldAt,
    this.activatedAt,
    this.expiresAt,
    this.validityDays,
    this.dataLimitBytes,
    this.profileDataLimitBytes,
    int? effectiveDataLimitBytes,
    this.effectiveTimeLimit,
    this.profileSessionTimeout,
    this.downloadSpeedLimit,
    this.uploadSpeedLimit,
    this.isUnlimitedSpeed = false,
    bool? isUnlimitedQuota,
    this.isCustomQuota = false,
    this.lifecycleStatus = 'NEW',
    this.consumedBytes,
    this.remainingBytes,
    this.consumptionPercentage,
    this.isOnline,
    this.hasLiveAccounting = false,
    this.sessionUptime,
    this.sessionTimeLeft,
  })  : _effectiveDataLimitBytes = effectiveDataLimitBytes,
        _isUnlimitedQuota = isUnlimitedQuota;

  factory CardModel.fromJson(Map<String, dynamic> json) {
    final profile = json['profile'] as Map<String, dynamic>?;
    final device = json['device'] as Map<String, dynamic>?;

    final cardDataLimit = json['dataLimitBytes'] != null
        ? int.tryParse(json['dataLimitBytes'].toString())
        : null;
    final profileDataLimit = profile?['dataLimitBytes'] != null
        ? int.tryParse(profile!['dataLimitBytes'].toString())
        : (json['profileDataLimitBytes'] != null
            ? int.tryParse(json['profileDataLimitBytes'].toString())
            : null);
    final effDataLimit = json['effectiveDataLimitBytes'] != null
        ? int.tryParse(json['effectiveDataLimitBytes'].toString())
        : (cardDataLimit ?? profileDataLimit);

    final String? effTimeLimit = json['effectiveTimeLimit'] as String? ??
        json['timeLimit'] as String? ??
        profile?['sessionTimeout'] as String?;

    return CardModel(
      id: json['id'] as String? ?? '',
      serialNumber: json['serialNumber'] as String? ?? '',
      username: json['username'] as String? ?? '',
      clearPassword: json['clearPassword'] as String? ?? json['pinCode'] as String?,
      pinCode: json['pinCode'] as String?,
      price: (json['price'] is num)
          ? (json['price'] as num).toDouble()
          : (double.tryParse(json['price']?.toString() ?? '0') ?? 0.0),
      status: json['status'] as String? ?? 'AVAILABLE',
      profileId: profile?['id'] as String? ?? json['profileId'] as String?,
      profileName: profile?['displayName'] as String? ??
          profile?['name'] as String? ??
          json['profileName'] as String? ??
          'باقة هوتسبوت',
      deviceName: device?['name'] as String? ?? json['deviceName'] as String?,
      batchNumber: json['batchNumber'] as String?,
      invoiceNumber: json['invoiceNumber'] as String?,
      timeLimit: json['timeLimit'] as String?,
      rateLimit: profile?['rateLimit'] as String? ?? json['rateLimit'] as String?,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'] as String) ?? DateTime.now()
          : DateTime.now(),
      soldAt: json['soldAt'] != null ? DateTime.tryParse(json['soldAt'] as String) : null,
      activatedAt: json['activatedAt'] != null ? DateTime.tryParse(json['activatedAt'] as String) : null,
      expiresAt: json['expiresAt'] != null ? DateTime.tryParse(json['expiresAt'] as String) : null,
      validityDays: json['validityDays'] != null ? int.tryParse(json['validityDays'].toString()) : null,
      dataLimitBytes: cardDataLimit,
      profileDataLimitBytes: profileDataLimit,
      effectiveDataLimitBytes: effDataLimit,
      effectiveTimeLimit: effTimeLimit,
      profileSessionTimeout: profile?['sessionTimeout'] as String? ?? json['profileSessionTimeout'] as String?,
      downloadSpeedLimit: json['downloadSpeedLimit'] as String?,
      uploadSpeedLimit: json['uploadSpeedLimit'] as String?,
      isUnlimitedSpeed: json['isUnlimitedSpeed'] == true,
      isUnlimitedQuota: json.containsKey('isUnlimitedQuota')
          ? (json['isUnlimitedQuota'] == true)
          : (profile != null && (effDataLimit == null || effDataLimit == 0)),
      isCustomQuota: json['isCustomQuota'] == true ||
          (cardDataLimit != null && profileDataLimit != null && cardDataLimit != profileDataLimit),
      lifecycleStatus: json['lifecycleStatus'] as String? ?? json['status'] as String? ?? 'NEW',
      consumedBytes: json['consumedBytes'] != null ? int.tryParse(json['consumedBytes'].toString()) : null,
      remainingBytes: json['remainingBytes'] != null ? int.tryParse(json['remainingBytes'].toString()) : null,
      consumptionPercentage: json['consumptionPercentage'] != null
          ? double.tryParse(json['consumptionPercentage'].toString())
          : null,
      isOnline: json['isOnline'] as bool?,
      hasLiveAccounting: json['hasLiveAccounting'] == true,
      sessionUptime: json['sessionUptime'] as String?,
      sessionTimeLeft: json['sessionTimeLeft'] as String?,
    );
  }

  bool get isExpired =>
      lifecycleStatus.toUpperCase() == 'EXPIRED' ||
      status.toUpperCase() == 'EXPIRED' ||
      (expiresAt != null && expiresAt!.isBefore(DateTime.now()));

  bool get isDisabled =>
      lifecycleStatus.toUpperCase() == 'DISABLED' ||
      status.toUpperCase() == 'DISABLED' ||
      status.toUpperCase() == 'CANCELLED';

  bool get isUsed =>
      !isExpired &&
      !isDisabled &&
      (lifecycleStatus.toUpperCase() == 'USED' ||
          status.toUpperCase() == 'ACTIVE' ||
          activatedAt != null);

  bool get isNew =>
      !isExpired &&
      !isDisabled &&
      !isUsed &&
      (lifecycleStatus.toUpperCase() == 'NEW' ||
          status.toUpperCase() == 'AVAILABLE' ||
          status.toUpperCase() == 'GENERATED');

  /// Formatted Arabic status label
  String get statusArabic {
    if (isExpired) return 'منتهي الصلاحية';
    if (isDisabled) return 'معطّل';
    if (isUsed) return 'مستخدم';
    if (status.toUpperCase() == 'SOLD') return 'مباع';
    if (isNew) return 'جديد (غير مستخدم)';
    return 'جديد';
  }

  /// Formatted status badge color
  Color get statusBadgeColor {
    if (isExpired) return const Color(0xFFEF4444);
    if (isDisabled) return const Color(0xFF6B7280);
    if (isUsed) return const Color(0xFF38BDF8);
    if (status.toUpperCase() == 'SOLD') return const Color(0xFFF59E0B);
    return const Color(0xFF10B981);
  }

  /// Formatted data quota in readable GB or MB or مفتوح
  String get formattedDataQuota {
    if (isUnlimitedQuota) {
      return 'مفتوح';
    }
    if (effectiveDataLimitBytes == null || effectiveDataLimitBytes == 0) {
      return 'غير محدد';
    }
    final bytes = effectiveDataLimitBytes!;
    if (bytes >= 1024 * 1024 * 1024) {
      final gb = bytes / (1024 * 1024 * 1024);
      return '${gb % 1 == 0 ? gb.toInt() : gb.toStringAsFixed(1)} GB';
    }
    if (bytes >= 1024 * 1024) {
      final mb = bytes / (1024 * 1024);
      return '${mb % 1 == 0 ? mb.toInt() : mb.toStringAsFixed(1)} MB';
    }
    return '$bytes B';
  }

  /// Formatted consumed bytes
  String get formattedConsumedBytes {
    if (!hasLiveAccounting || consumedBytes == null) {
      return 'غير متاح';
    }
    final bytes = consumedBytes!;
    if (bytes >= 1024 * 1024 * 1024) {
      final gb = bytes / (1024 * 1024 * 1024);
      return '${gb % 1 == 0 ? gb.toInt() : gb.toStringAsFixed(1)} GB';
    }
    if (bytes >= 1024 * 1024) {
      final mb = bytes / (1024 * 1024);
      return '${mb % 1 == 0 ? mb.toInt() : mb.toStringAsFixed(1)} MB';
    }
    return '$bytes B';
  }

  /// Formatted remaining bytes
  String get formattedRemainingBytes {
    if (isUnlimitedQuota) {
      return 'مفتوح';
    }
    if (!hasLiveAccounting || remainingBytes == null) {
      return 'غير متاح';
    }
    final bytes = remainingBytes!;
    if (bytes >= 1024 * 1024 * 1024) {
      final gb = bytes / (1024 * 1024 * 1024);
      return '${gb % 1 == 0 ? gb.toInt() : gb.toStringAsFixed(1)} GB';
    }
    if (bytes >= 1024 * 1024) {
      final mb = bytes / (1024 * 1024);
      return '${mb % 1 == 0 ? mb.toInt() : mb.toStringAsFixed(1)} MB';
    }
    return '$bytes B';
  }

  /// Formatted speed label (with proper download and upload directions)
  String get formattedSpeedLabel {
    if (isUnlimitedSpeed) {
      return 'مفتوحة';
    }
    if (downloadSpeedLimit != null && uploadSpeedLimit != null) {
      return '↓ $downloadSpeedLimit / ↑ $uploadSpeedLimit';
    }
    if (rateLimit != null && rateLimit!.isNotEmpty) {
      return rateLimit!;
    }
    return 'مفتوحة';
  }

  /// Formatted validity
  String get formattedValidity {
    if (validityDays != null && validityDays! > 0) {
      return '$validityDays يوم';
    }
    if (effectiveTimeLimit != null && effectiveTimeLimit!.isNotEmpty) {
      return effectiveTimeLimit!;
    }
    return 'غير محددة';
  }

  String get loginUrl =>
      'http://login.hotspot/login?username=$username&password=${clearPassword ?? pinCode ?? username}';
}

/// Cards inventory response state with pagination and status counts
class CardsInventoryState {
  final List<CardModel> cards;
  final int totalMatching;
  final int totalInventory;
  final int availableCount;
  final int soldCount;
  final int activeCount;
  final int disabledCount;
  final bool isLoading;
  final String? errorMessage;
  final int page;
  final int totalPages;

  CardsInventoryState({
    required this.cards,
    required this.totalMatching,
    required this.totalInventory,
    this.availableCount = 0,
    this.soldCount = 0,
    this.activeCount = 0,
    this.disabledCount = 0,
    this.isLoading = false,
    this.errorMessage,
    this.page = 1,
    this.totalPages = 1,
  });

  CardsInventoryState copyWith({
    List<CardModel>? cards,
    int? totalMatching,
    int? totalInventory,
    int? availableCount,
    int? soldCount,
    int? activeCount,
    int? disabledCount,
    bool? isLoading,
    String? errorMessage,
    int? page,
    int? totalPages,
  }) {
    return CardsInventoryState(
      cards: cards ?? this.cards,
      totalMatching: totalMatching ?? this.totalMatching,
      totalInventory: totalInventory ?? this.totalInventory,
      availableCount: availableCount ?? this.availableCount,
      soldCount: soldCount ?? this.soldCount,
      activeCount: activeCount ?? this.activeCount,
      disabledCount: disabledCount ?? this.disabledCount,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: errorMessage,
      page: page ?? this.page,
      totalPages: totalPages ?? this.totalPages,
    );
  }
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
  final String? customerName;
  final String tenantName;
  final String? tenantPhone;
  final String? deviceName;
  final int quantity;
  final double? unitPrice;
  final double discount;
  final String? timeLimit;
  final int? dataLimitBytes;
  final String? qrDataUrl;
  final int printedCount;
  final String? transactionId;
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
    this.customerName,
    this.tenantName = 'شبكة ميكروتيك هوتسبوت',
    this.tenantPhone,
    this.deviceName,
    this.quantity = 1,
    this.unitPrice,
    this.discount = 0.0,
    this.timeLimit,
    this.dataLimitBytes,
    this.qrDataUrl,
    this.printedCount = 1,
    this.transactionId,
    this.isOffline = false,
  });

  factory SaleReceiptModel.fromJson(Map<String, dynamic> json) {
    return SaleReceiptModel(
      invoiceNumber: json['invoiceNumber'] as String? ?? 'INV-${DateTime.now().millisecondsSinceEpoch % 100000}',
      serialNumber: json['serialNumber'] as String? ?? '',
      username: json['username'] as String? ?? '',
      password: json['password'] as String? ?? json['clearPassword'] as String? ?? json['pinCode'] as String?,
      profileName: json['profileName'] as String? ?? 'باقة هوتسبوت',
      amount: (json['amount'] is num) ? (json['amount'] as num).toDouble() : (json['price'] is num ? (json['price'] as num).toDouble() : 0.0),
      currency: json['currency'] as String? ?? 'SDG',
      paymentMethod: json['paymentMethod'] as String? ?? 'CASH',
      soldAt: json['soldAt'] != null
          ? DateTime.tryParse(json['soldAt'] as String) ?? DateTime.now()
          : (json['createdAt'] != null ? DateTime.tryParse(json['createdAt'] as String) ?? DateTime.now() : DateTime.now()),
      cashierName: json['cashierName'] as String? ?? 'الكاشير',
      customerPhone: json['customerPhone'] as String?,
      customerName: json['customerName'] as String?,
      tenantName: json['tenantName'] as String? ?? 'شبكة ميكروتيك هوتسبوت',
      tenantPhone: json['tenantPhone'] as String?,
      deviceName: json['deviceName'] as String?,
      quantity: (json['quantity'] as num?)?.toInt() ?? 1,
      unitPrice: (json['unitPrice'] as num?)?.toDouble(),
      discount: (json['discount'] as num?)?.toDouble() ?? 0.0,
      timeLimit: json['timeLimit'] as String?,
      dataLimitBytes: (json['dataLimitBytes'] as num?)?.toInt(),
      qrDataUrl: json['qrDataUrl'] as String?,
      printedCount: (json['printedCount'] as num?)?.toInt() ?? 1,
      transactionId: json['transactionId'] as String? ?? json['id'] as String?,
      isOffline: json['isOffline'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
    'invoiceNumber': invoiceNumber,
    'serialNumber': serialNumber,
    'username': username,
    'password': password,
    'profileName': profileName,
    'amount': amount,
    'currency': currency,
    'paymentMethod': paymentMethod,
    'soldAt': soldAt.toIso8601String(),
    'cashierName': cashierName,
    'customerPhone': customerPhone,
    'customerName': customerName,
    'tenantName': tenantName,
    'tenantPhone': tenantPhone,
    'deviceName': deviceName,
    'quantity': quantity,
    'unitPrice': unitPrice,
    'discount': discount,
    'timeLimit': timeLimit,
    'dataLimitBytes': dataLimitBytes,
    'qrDataUrl': qrDataUrl,
    'printedCount': printedCount,
    'transactionId': transactionId,
    'isOffline': isOffline,
  };

  String get loginUrl => 'http://login.hotspot/login?username=$username&password=${password ?? username}';
}

/// Shift transaction item for cashier report
class ShiftTransactionItem {
  final String id;
  final String invoiceNumber;
  final double amount;
  final String currency;
  final String paymentMethod;
  final String? customerName;
  final String? customerPhone;
  final DateTime createdAt;
  final String profileName;
  final String username;
  final String serialNumber;
  final bool isRefunded;

  ShiftTransactionItem({
    required this.id,
    required this.invoiceNumber,
    required this.amount,
    required this.currency,
    required this.paymentMethod,
    this.customerName,
    this.customerPhone,
    required this.createdAt,
    required this.profileName,
    required this.username,
    required this.serialNumber,
    this.isRefunded = false,
  });

  factory ShiftTransactionItem.fromJson(Map<String, dynamic> json) {
    return ShiftTransactionItem(
      id: json['id'] as String? ?? '',
      invoiceNumber: json['invoiceNumber'] as String? ?? '',
      amount: (json['amount'] != null)
          ? double.tryParse(json['amount'].toString()) ?? 0.0
          : 0.0,
      currency: json['currency'] as String? ?? 'SDG',
      paymentMethod: json['paymentMethod'] as String? ?? 'CASH',
      customerName: json['customerName'] as String?,
      customerPhone: json['customerPhone'] as String?,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
      profileName: json['profileName'] as String? ?? 'عام',
      username: json['username'] as String? ?? '',
      serialNumber: json['serialNumber'] as String? ?? '',
      isRefunded: json['isRefunded'] as bool? ?? false,
    );
  }
}

/// Daily cashier shift summary
class ShiftSummaryModel {
  final double totalRevenue;
  final int totalSalesCount;
  final String currency;
  final List<ShiftProfileSummary> profileBreakdown;
  final double cashInDrawer;
  final double bankakAmount;
  final double fawryAmount;
  final double cardAmount;
  final String cashierName;
  final String? cashierId;
  final String tenantName;
  final DateTime? periodStart;
  final DateTime? periodEnd;
  final bool isClosed;
  final DateTime? closedAt;
  final List<ShiftTransactionItem> recentTransactions;

  ShiftSummaryModel({
    required this.totalRevenue,
    required this.totalSalesCount,
    required this.currency,
    required this.profileBreakdown,
    this.cashInDrawer = 0.0,
    this.bankakAmount = 0.0,
    this.fawryAmount = 0.0,
    this.cardAmount = 0.0,
    this.cashierName = 'الكاشير',
    this.cashierId,
    this.tenantName = 'منظومة ميكروتك',
    this.periodStart,
    this.periodEnd,
    this.isClosed = false,
    this.closedAt,
    this.recentTransactions = const [],
  });

  factory ShiftSummaryModel.fromJson(Map<String, dynamic> json) {
    final breakdownRaw = json['profileBreakdown'] as List? ?? [];
    final pMethods = json['paymentMethodBreakdown'] as Map<String, dynamic>? ?? {};

    double parsePMethod(String key) {
      if (pMethods[key] is Map && pMethods[key]['total'] != null) {
        return double.tryParse(pMethods[key]['total'].toString()) ?? 0.0;
      }
      return 0.0;
    }

    final double cashTotal = (json['cashInDrawer'] != null)
        ? double.tryParse(json['cashInDrawer'].toString()) ?? 0.0
        : parsePMethod('CASH');

    final double bankakTotal = (json['bankakAmount'] != null)
        ? double.tryParse(json['bankakAmount'].toString()) ?? 0.0
        : parsePMethod('MOBILE_WALLET');

    final double fawryTotal = (json['fawryAmount'] != null)
        ? double.tryParse(json['fawryAmount'].toString()) ?? 0.0
        : parsePMethod('TRANSFER');

    final double cardTotal = (json['cardAmount'] != null)
        ? double.tryParse(json['cardAmount'].toString()) ?? 0.0
        : parsePMethod('CARD');

    final txListRaw = json['recentTransactions'] as List? ?? [];
    final List<ShiftTransactionItem> txList = txListRaw
        .map((t) => ShiftTransactionItem.fromJson(t as Map<String, dynamic>))
        .toList();

    return ShiftSummaryModel(
      totalRevenue: (json['totalRevenue'] != null)
          ? double.tryParse(json['totalRevenue'].toString()) ?? 0.0
          : 0.0,
      totalSalesCount: json['totalSalesCount'] as int? ??
          (json['totalTransactions'] as int? ?? 0),
      currency: json['currency'] as String? ?? 'SDG',
      profileBreakdown: breakdownRaw
          .map((item) => ShiftProfileSummary.fromJson(item as Map<String, dynamic>))
          .toList(),
      cashInDrawer: cashTotal,
      bankakAmount: bankakTotal,
      fawryAmount: fawryTotal,
      cardAmount: cardTotal,
      cashierName: json['cashierName'] as String? ?? 'الكاشير',
      cashierId: json['cashierId'] as String?,
      tenantName: json['tenantName'] as String? ?? 'منظومة ميكروتك',
      periodStart: json['periodStart'] != null
          ? DateTime.tryParse(json['periodStart'].toString())
          : null,
      periodEnd: json['periodEnd'] != null
          ? DateTime.tryParse(json['periodEnd'].toString())
          : null,
      isClosed: json['isClosed'] as bool? ?? false,
      closedAt: json['closedAt'] != null
          ? DateTime.tryParse(json['closedAt'].toString())
          : null,
      recentTransactions: txList,
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

/// MikroTik Router device model
class RouterDeviceModel {
  final String id;
  final String name;
  final String host;
  final int apiPort;
  final int restPort;
  final bool useSsl;
  final String username;
  final String rosVersion;
  final bool isOnline;
  final String status;
  final int? cpuLoad;
  final int? memoryFreeMb;
  final int? memoryTotalMb;
  final int? diskFreeMb;
  final int? diskTotalMb;
  final String? uptime;
  final String? modelName;
  final bool isLocked;
  final bool antiTetheringEnabled;

  RouterDeviceModel({
    required this.id,
    required this.name,
    required this.host,
    this.apiPort = 8728,
    this.restPort = 443,
    this.useSsl = false,
    this.username = 'admin',
    this.rosVersion = 'V7',
    this.isOnline = false,
    this.status = 'OFFLINE',
    this.cpuLoad,
    this.memoryFreeMb,
    this.memoryTotalMb,
    this.diskFreeMb,
    this.diskTotalMb,
    this.uptime,
    this.modelName,
    this.isLocked = false,
    this.antiTetheringEnabled = false,
  });

  factory RouterDeviceModel.fromJson(Map<String, dynamic> json) {
    int? parseMb(dynamic val) {
      if (val == null) return null;
      final num = double.tryParse(val.toString()) ?? 0;
      if (num > 1000000) {
        return (num / (1024 * 1024)).round();
      }
      return num.round();
    }

    return RouterDeviceModel(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'MikroTik Router',
      host: json['host'] as String? ?? '192.168.88.1',
      apiPort: json['apiPort'] as int? ?? json['port'] as int? ?? 8728,
      restPort: json['restPort'] as int? ?? 443,
      useSsl: json['useSsl'] as bool? ?? false,
      username: json['username'] as String? ?? 'admin',
      rosVersion: json['rosVersion'] as String? ?? 'V7',
      isOnline: json['isOnline'] as bool? ?? (json['status'] == 'ONLINE'),
      status: json['status'] as String? ?? 'OFFLINE',
      cpuLoad: json['cpuLoad'] as int?,
      memoryFreeMb: parseMb(json['memoryFree']),
      memoryTotalMb: parseMb(json['memoryTotal']),
      diskFreeMb: parseMb(json['diskFree']),
      diskTotalMb: parseMb(json['diskTotal']),
      uptime: json['uptime'] as String?,
      modelName: json['modelName'] as String?,
      isLocked: json['isLocked'] as bool? ?? false,
      antiTetheringEnabled: json['antiTetheringEnabled'] as bool? ?? false,
    );
  }

  RouterDeviceModel copyWith({
    String? id,
    String? name,
    String? host,
    int? apiPort,
    int? restPort,
    bool? useSsl,
    String? username,
    String? rosVersion,
    bool? isOnline,
    String? status,
    int? cpuLoad,
    int? memoryFreeMb,
    int? memoryTotalMb,
    int? diskFreeMb,
    int? diskTotalMb,
    String? uptime,
    String? modelName,
    bool? isLocked,
    bool? antiTetheringEnabled,
  }) {
    return RouterDeviceModel(
      id: id ?? this.id,
      name: name ?? this.name,
      host: host ?? this.host,
      apiPort: apiPort ?? this.apiPort,
      restPort: restPort ?? this.restPort,
      useSsl: useSsl ?? this.useSsl,
      username: username ?? this.username,
      rosVersion: rosVersion ?? this.rosVersion,
      isOnline: isOnline ?? this.isOnline,
      status: status ?? this.status,
      cpuLoad: cpuLoad ?? this.cpuLoad,
      memoryFreeMb: memoryFreeMb ?? this.memoryFreeMb,
      memoryTotalMb: memoryTotalMb ?? this.memoryTotalMb,
      diskFreeMb: diskFreeMb ?? this.diskFreeMb,
      diskTotalMb: diskTotalMb ?? this.diskTotalMb,
      uptime: uptime ?? this.uptime,
      modelName: modelName ?? this.modelName,
      isLocked: isLocked ?? this.isLocked,
      antiTetheringEnabled: antiTetheringEnabled ?? this.antiTetheringEnabled,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'host': host,
    'apiPort': apiPort,
    'restPort': restPort,
    'useSsl': useSsl,
    'username': username,
    'rosVersion': rosVersion,
    'isOnline': isOnline,
    'status': status,
    'cpuLoad': cpuLoad,
    'memoryFreeMb': memoryFreeMb,
    'memoryTotalMb': memoryTotalMb,
    'diskFreeMb': diskFreeMb,
    'diskTotalMb': diskTotalMb,
    'uptime': uptime,
    'modelName': modelName,
    'isLocked': isLocked,
    'antiTetheringEnabled': antiTetheringEnabled,
  };
}

/// Hotspot Active Session model (Radar)
class RouterConnectionStatus {
  final String id;
  final String name;
  final String status; // 'online' | 'offline' | 'unreachable'
  final String? error;

  RouterConnectionStatus({
    required this.id,
    required this.name,
    required this.status,
    this.error,
  });

  factory RouterConnectionStatus.fromJson(Map<String, dynamic> json) {
    return RouterConnectionStatus(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'MikroTik',
      status: json['status'] as String? ?? 'online',
      error: json['error'] as String?,
    );
  }

  bool get isOnline => status == 'online';
}

class ActiveSessionModel {
  final String id;
  final String user;
  final String address;
  final String macAddress;
  final String uptime;
  final int uptimeSeconds;
  final int bytesIn;
  final int bytesOut;
  final String? sessionId;
  final String? server;
  final String? loginBy;

  final String? deviceId;
  final String? deviceName;
  final String routerStatus;

  final String profileName;
  final String? rateLimit;
  final String? downloadSpeedLimit;
  final String? uploadSpeedLimit;
  final bool isUnlimitedSpeed;

  final int? totalQuotaBytes;
  final int consumedBytes;
  final int? remainingBytes;
  final double? consumptionPercentage;
  final bool isUnlimitedQuota;
  final bool isQuotaExhausted;
  final bool isUnknownQuota;

  final String? timeLimit;
  final String? sessionTimeLeft;
  final int? remainingTimeSeconds;
  final String? expiresAt;
  final bool isUnlimitedTime;
  final bool isExpired;

  final String connectionStatus;
  final String? lastSeen;

  ActiveSessionModel({
    required this.id,
    required this.user,
    required this.address,
    required this.macAddress,
    required this.uptime,
    this.uptimeSeconds = 0,
    required this.bytesIn,
    required this.bytesOut,
    this.sessionId,
    this.server,
    this.loginBy,
    this.deviceId,
    this.deviceName,
    this.routerStatus = 'online',
    this.profileName = 'default',
    this.rateLimit,
    this.downloadSpeedLimit,
    this.uploadSpeedLimit,
    this.isUnlimitedSpeed = false,
    this.totalQuotaBytes,
    this.consumedBytes = 0,
    this.remainingBytes,
    this.consumptionPercentage,
    this.isUnlimitedQuota = false,
    this.isQuotaExhausted = false,
    this.isUnknownQuota = false,
    this.timeLimit,
    this.sessionTimeLeft,
    this.remainingTimeSeconds,
    this.expiresAt,
    this.isUnlimitedTime = false,
    this.isExpired = false,
    this.connectionStatus = 'connected',
    this.lastSeen,
  });

  factory ActiveSessionModel.fromJson(Map<String, dynamic> json) {
    final bIn = int.tryParse(json['bytesIn']?.toString() ?? json['bytes-in']?.toString() ?? '0') ?? 0;
    final bOut = int.tryParse(json['bytesOut']?.toString() ?? json['bytes-out']?.toString() ?? '0') ?? 0;
    final parsedConsumed = int.tryParse(json['consumedBytes']?.toString() ?? '') ?? (bIn + bOut);

    final rawTotalQuota = json['totalQuotaBytes'] != null
        ? int.tryParse(json['totalQuotaBytes'].toString())
        : null;
    final rawRemaining = json['remainingBytes'] != null
        ? int.tryParse(json['remainingBytes'].toString())
        : null;
    final rawPercentage = json['consumptionPercentage'] != null
        ? double.tryParse(json['consumptionPercentage'].toString())
        : null;

    return ActiveSessionModel(
      id: json['id'] as String? ?? json['user'] as String? ?? '',
      user: json['user'] as String? ?? json['username'] as String? ?? 'مستخدم',
      address: json['address'] as String? ?? json['ipAddress'] as String? ?? '',
      macAddress: json['macAddress'] as String? ?? json['mac-address'] as String? ?? '',
      uptime: json['uptime'] as String? ?? '0s',
      uptimeSeconds: int.tryParse(json['uptimeSeconds']?.toString() ?? '0') ?? 0,
      bytesIn: bIn,
      bytesOut: bOut,
      sessionId: json['sessionId'] as String?,
      server: json['server'] as String?,
      loginBy: json['loginBy'] as String?,
      deviceId: json['deviceId'] as String?,
      deviceName: json['deviceName'] as String?,
      routerStatus: json['routerStatus'] as String? ?? 'online',
      profileName: json['profileName'] as String? ?? 'default',
      rateLimit: json['rateLimit'] as String?,
      downloadSpeedLimit: json['downloadSpeedLimit'] as String?,
      uploadSpeedLimit: json['uploadSpeedLimit'] as String?,
      isUnlimitedSpeed: json['isUnlimitedSpeed'] == true,
      totalQuotaBytes: rawTotalQuota,
      consumedBytes: parsedConsumed,
      remainingBytes: rawRemaining,
      consumptionPercentage: rawPercentage,
      isUnlimitedQuota: json['isUnlimitedQuota'] == true,
      isQuotaExhausted: json['isQuotaExhausted'] == true,
      isUnknownQuota: json['isUnknownQuota'] == true,
      timeLimit: json['timeLimit'] as String?,
      sessionTimeLeft: json['sessionTimeLeft'] as String?,
      remainingTimeSeconds: int.tryParse(json['remainingTimeSeconds']?.toString() ?? ''),
      expiresAt: json['expiresAt'] as String?,
      isUnlimitedTime: json['isUnlimitedTime'] == true,
      isExpired: json['isExpired'] == true,
      connectionStatus: json['connectionStatus'] as String? ?? 'connected',
      lastSeen: json['lastSeen'] as String?,
    );
  }

  double get totalMb => (consumedBytes > 0 ? (consumedBytes / (1024 * 1024)) : ((bytesIn + bytesOut) / (1024 * 1024)));

  static String formatBytes(int bytes) {
    if (bytes <= 0) return '0 MB';
    final double mb = bytes / (1024 * 1024);
    if (mb >= 1024) {
      final double gb = mb / 1024;
      return '${gb.toStringAsFixed(gb % 1 == 0 ? 0 : 2)} GB';
    }
    return '${mb.toStringAsFixed(mb % 1 == 0 ? 0 : 1)} MB';
  }

  static String formatSeconds(int seconds) {
    if (seconds <= 0) return 'منتهية';
    final int days = seconds ~/ 86400;
    final int hours = (seconds % 86400) ~/ 3600;
    final int minutes = (seconds % 3600) ~/ 60;
    if (days > 0) return '$days ي $hours س';
    if (hours > 0) return '$hours س $minutes د';
    return '$minutes د';
  }

  String get formattedConsumed => formatBytes(consumedBytes > 0 ? consumedBytes : (bytesIn + bytesOut));

  String get formattedRemaining {
    if (isUnlimitedQuota) return 'مفتوحة';
    if (isUnknownQuota || remainingBytes == null) return 'غير متاح';
    if (isQuotaExhausted || remainingBytes! <= 0) return 'منتهية (0 MB)';
    return formatBytes(remainingBytes!);
  }

  String get formattedTotalQuota {
    if (isUnlimitedQuota) return 'غير محدودة';
    if (isUnknownQuota || totalQuotaBytes == null) return 'غير متاح';
    return formatBytes(totalQuotaBytes!);
  }

  String get formattedSpeed {
    if (isUnlimitedSpeed || (downloadSpeedLimit == null && uploadSpeedLimit == null)) {
      return 'غير محددة';
    }
    final dl = downloadSpeedLimit != null ? '↓ $downloadSpeedLimit' : '';
    final ul = uploadSpeedLimit != null ? '↑ $uploadSpeedLimit' : '';
    if (dl.isNotEmpty && ul.isNotEmpty) return '$dl | $ul';
    return dl.isNotEmpty ? dl : ul;
  }

  String get formattedRemainingTime {
    if (isUnlimitedTime) return 'غير محدودة زمنيًا';
    if (remainingTimeSeconds != null) {
      return formatSeconds(remainingTimeSeconds!);
    }
    if (sessionTimeLeft != null && sessionTimeLeft!.isNotEmpty) {
      return sessionTimeLeft!;
    }
    return 'غير متاح';
  }
}

/// Card print template model
class CardTemplateModel {
  final String id;
  final String name;
  final int widthMm;
  final int heightMm;
  final String orientation;
  final String? backgroundDesign;
  final String themePreset;
  final String primaryColor;
  final String accentColor;
  final Map<String, dynamic> layoutConfig;
  final bool isDefault;

  CardTemplateModel({
    required this.id,
    required this.name,
    this.widthMm = 85,
    this.heightMm = 54,
    this.orientation = 'landscape',
    this.backgroundDesign,
    this.themePreset = 'CLASSIC',
    this.primaryColor = '#1E3A8A',
    this.accentColor = '#10B981',
    this.layoutConfig = const {},
    this.isDefault = false,
  });

  bool get showQr => layoutConfig['showQr'] as bool? ?? true;
  bool get showPin => layoutConfig['showPin'] as bool? ?? true;
  bool get showPrice => layoutConfig['showPrice'] as bool? ?? true;
  bool get showValidity => layoutConfig['showValidity'] as bool? ?? true;
  bool get showSpeed => layoutConfig['showSpeed'] as bool? ?? true;
  String get networkName => layoutConfig['networkName'] as String? ?? 'سودافاي';
  String get supportPhone => layoutConfig['supportPhone'] as String? ?? '';
  String get headerTitle => layoutConfig['headerTitle'] as String? ?? 'كرت إنترنت فائق السرعة';
  String get instructions => layoutConfig['instructions'] as String? ?? 'امسح الرمز أو أدخل اسم المستخدم للدخول';

  bool get hasCustomBackground =>
      (backgroundImageBase64 != null && backgroundImageBase64!.isNotEmpty) ||
      (backgroundDesign != null &&
          backgroundDesign!.isNotEmpty &&
          backgroundDesign != 'default' &&
          backgroundDesign != 'none');

  String? get backgroundImageBase64 {
    final fromConfig = layoutConfig['backgroundImageBase64'] as String?;
    if (fromConfig != null && fromConfig.isNotEmpty) return fromConfig;
    if (backgroundDesign != null && backgroundDesign!.startsWith('data:image')) {
      final parts = backgroundDesign!.split(',');
      if (parts.length > 1) return parts.last;
      return backgroundDesign;
    }
    return null;
  }

  String get backgroundFit => layoutConfig['backgroundFit'] as String? ?? 'cover';
  bool get isImageBackground => layoutConfig['isImageBackground'] as bool? ?? (backgroundImageBase64 != null);
  bool get isPdfBackground => layoutConfig['isPdfBackground'] as bool? ?? false;

  factory CardTemplateModel.fromJson(Map<String, dynamic> json) {
    Map<String, dynamic> cfg = {};
    if (json['layoutConfig'] is Map) {
      cfg = Map<String, dynamic>.from(json['layoutConfig'] as Map);
    }

    return CardTemplateModel(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'قالب الكرت',
      widthMm: (json['widthMm'] as num?)?.toInt() ?? 85,
      heightMm: (json['heightMm'] as num?)?.toInt() ?? 54,
      orientation: json['orientation'] as String? ?? 'landscape',
      backgroundDesign: json['backgroundDesign'] as String?,
      themePreset: json['themePreset'] as String? ?? 'CLASSIC',
      primaryColor: json['primaryColor'] as String? ?? '#1E3A8A',
      accentColor: json['accentColor'] as String? ?? '#10B981',
      layoutConfig: cfg,
      isDefault: json['isDefault'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'widthMm': widthMm,
    'heightMm': heightMm,
    'orientation': orientation,
    if (backgroundDesign != null) 'backgroundDesign': backgroundDesign,
    'themePreset': themePreset,
    'primaryColor': primaryColor,
    'accentColor': accentColor,
    'layoutConfig': layoutConfig,
    'isDefault': isDefault,
  };

  /// Clean DTO payload omitting 'id' for backend CreateTemplateDto/UpdateTemplateDto strict whitelist
  Map<String, dynamic> toPayload() => {
    'name': name,
    'widthMm': widthMm,
    'heightMm': heightMm,
    'orientation': orientation,
    if (backgroundDesign != null) 'backgroundDesign': backgroundDesign,
    'themePreset': themePreset,
    'primaryColor': primaryColor,
    'accentColor': accentColor,
    'layoutConfig': layoutConfig,
    'isDefault': isDefault,
  };

  CardTemplateModel copyWith({
    String? id,
    String? name,
    int? widthMm,
    int? heightMm,
    String? orientation,
    String? backgroundDesign,
    String? themePreset,
    String? primaryColor,
    String? accentColor,
    Map<String, dynamic>? layoutConfig,
    bool? isDefault,
  }) {
    return CardTemplateModel(
      id: id ?? this.id,
      name: name ?? this.name,
      widthMm: widthMm ?? this.widthMm,
      heightMm: heightMm ?? this.heightMm,
      orientation: orientation ?? this.orientation,
      backgroundDesign: backgroundDesign ?? this.backgroundDesign,
      themePreset: themePreset ?? this.themePreset,
      primaryColor: primaryColor ?? this.primaryColor,
      accentColor: accentColor ?? this.accentColor,
      layoutConfig: layoutConfig ?? this.layoutConfig,
      isDefault: isDefault ?? this.isDefault,
    );
  }
}

/// Assigned MikroTik device summary for a user
class AssignedDeviceSummary {
  final String id;
  final String name;
  final String? host;

  const AssignedDeviceSummary({
    required this.id,
    required this.name,
    this.host,
  });

  factory AssignedDeviceSummary.fromJson(Map<String, dynamic> json) {
    return AssignedDeviceSummary(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      host: json['host'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'host': host,
  };
}

/// Tenant User representation
class UserModel {
  final String id;
  final String email;
  final String fullName;
  final String? phone;
  final String role;
  final String status;
  final DateTime? createdAt;
  final DateTime? lastLoginAt;
  final List<AssignedDeviceSummary> assignedDevices;
  final List<String> customPermissions;

  UserModel({
    required this.id,
    required this.email,
    required this.fullName,
    this.phone,
    required this.role,
    this.status = 'ACTIVE',
    this.createdAt,
    this.lastLoginAt,
    this.assignedDevices = const [],
    this.customPermissions = const [],
  });

  bool get isActive => status.toUpperCase() == 'ACTIVE';
  bool get isSuspended => status.toUpperCase() == 'SUSPENDED';
  bool get isTenantAdmin =>
      role == 'TENANT_ADMIN' || role == 'OWNER' || role == 'ADMIN';
  bool get isManager => role == 'MANAGER';
  bool get isCashier => role == 'CASHIER';

  String get roleDisplayName {
    switch (role) {
      case 'TENANT_ADMIN':
      case 'OWNER':
      case 'ADMIN':
        return 'مدير الشبكة (المالك)';
      case 'MANAGER':
        return 'مدير فرعي';
      case 'CASHIER':
        return 'كاشير';
      default:
        return role;
    }
  }

  factory UserModel.fromJson(Map<String, dynamic> json) {
    String roleStr;
    final roleRaw = json['role'];
    if (roleRaw is Map<String, dynamic>) {
      roleStr = roleRaw['name'] as String? ?? 'CASHIER';
    } else if (roleRaw is String && roleRaw.isNotEmpty) {
      roleStr = roleRaw;
    } else {
      roleStr = json['roleName'] as String? ?? 'CASHIER';
    }

    final devicesRaw = json['assignedDevices'];
    final List<AssignedDeviceSummary> devicesList = [];
    if (devicesRaw is List) {
      for (final item in devicesRaw) {
        if (item is Map<String, dynamic>) {
          devicesList.add(AssignedDeviceSummary.fromJson(item));
        }
      }
    }

    final permsRaw = json['customPermissions'];
    final List<String> permsList = [];
    if (permsRaw is List) {
      for (final p in permsRaw) {
        if (p is String) {
          permsList.add(p);
        }
      }
    }

    return UserModel(
      id: json['id'] as String? ?? '',
      email: json['email'] as String? ?? '',
      fullName: json['fullName'] as String? ?? json['name'] as String? ?? '',
      phone: json['phone'] as String?,
      role: roleStr,
      status: json['status'] as String? ?? 'ACTIVE',
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
      lastLoginAt: json['lastLoginAt'] != null
          ? DateTime.tryParse(json['lastLoginAt'].toString())
          : null,
      assignedDevices: devicesList,
      customPermissions: permsList,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'email': email,
    'fullName': fullName,
    'phone': phone,
    'role': role,
    'status': status,
    'createdAt': createdAt?.toIso8601String(),
    'lastLoginAt': lastLoginAt?.toIso8601String(),
    'assignedDevices': assignedDevices.map((d) => d.toJson()).toList(),
    'customPermissions': customPermissions,
  };
}

/// Staff invitation representation
class StaffInvitationModel {
  final String id;
  final String email;
  final String fullName;
  final String? phone;
  final String? roleName;
  final DateTime? expiresAt;
  final DateTime? acceptedAt;
  final String? invitationUrl;
  final String? token;

  StaffInvitationModel({
    required this.id,
    required this.email,
    required this.fullName,
    this.phone,
    this.roleName,
    this.expiresAt,
    this.acceptedAt,
    this.invitationUrl,
    this.token,
  });

  bool get isExpired => expiresAt != null && expiresAt!.isBefore(DateTime.now());
  bool get isAccepted => acceptedAt != null;

  factory StaffInvitationModel.fromJson(Map<String, dynamic> json) {
    String? roleStr;
    final roleRaw = json['role'];
    if (roleRaw is Map<String, dynamic>) {
      roleStr = roleRaw['name'] as String?;
    } else if (roleRaw is String) {
      roleStr = roleRaw;
    }
    return StaffInvitationModel(
      id: json['id'] as String? ?? '',
      email: json['email'] as String? ?? '',
      fullName: json['fullName'] as String? ?? '',
      phone: json['phone'] as String?,
      roleName: roleStr,
      expiresAt: json['expiresAt'] != null
          ? DateTime.tryParse(json['expiresAt'].toString())
          : null,
      acceptedAt: json['acceptedAt'] != null
          ? DateTime.tryParse(json['acceptedAt'].toString())
          : null,
      invitationUrl: json['invitationUrl'] as String?,
      token: json['token'] as String?,
    );
  }
}

/// Cloud wallet transaction record
class WalletTransactionModel {
  final String id;
  final double amount;
  final String type; // RECHARGE, USAGE, BONUS, ADJUSTMENT, REDEEM_POINTS, DEDUCTION
  final int pointsDelta;
  final double balanceAfter;
  final String? reference;
  final String? notes;
  final DateTime createdAt;

  WalletTransactionModel({
    required this.id,
    required this.amount,
    required this.type,
    required this.pointsDelta,
    required this.balanceAfter,
    this.reference,
    this.notes,
    required this.createdAt,
  });

  factory WalletTransactionModel.fromJson(Map<String, dynamic> json) {
    return WalletTransactionModel(
      id: json['id']?.toString() ?? '',
      amount: (json['amount'] != null)
          ? double.tryParse(json['amount'].toString()) ?? 0.0
          : 0.0,
      type: json['type']?.toString() ?? 'RECHARGE',
      pointsDelta: json['pointsDelta'] as int? ?? 0,
      balanceAfter: (json['balanceAfter'] != null)
          ? double.tryParse(json['balanceAfter'].toString()) ?? 0.0
          : 0.0,
      reference: json['reference']?.toString(),
      notes: json['notes']?.toString(),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

/// Cloud wallet data
class WalletDataModel {
  final double walletBalance;
  final int loyaltyPoints;
  final bool allowAdminCards;
  final String currency;
  final List<WalletTransactionModel> transactions;

  WalletDataModel({
    required this.walletBalance,
    required this.loyaltyPoints,
    this.allowAdminCards = false,
    this.currency = 'SDG',
    this.transactions = const [],
  });

  WalletDataModel copyWith({
    double? walletBalance,
    int? loyaltyPoints,
    bool? allowAdminCards,
    String? currency,
    List<WalletTransactionModel>? transactions,
  }) {
    return WalletDataModel(
      walletBalance: walletBalance ?? this.walletBalance,
      loyaltyPoints: loyaltyPoints ?? this.loyaltyPoints,
      allowAdminCards: allowAdminCards ?? this.allowAdminCards,
      currency: currency ?? this.currency,
      transactions: transactions ?? this.transactions,
    );
  }

  factory WalletDataModel.fromJson(Map<String, dynamic> json) {
    final rawList = json['recentTransactions'] ?? json['transactions'];
    final txList = (rawList is List)
        ? rawList
            .map((item) =>
                WalletTransactionModel.fromJson(item as Map<String, dynamic>))
            .toList()
        : <WalletTransactionModel>[];

    return WalletDataModel(
      walletBalance: (json['walletBalance'] != null)
          ? double.tryParse(json['walletBalance'].toString()) ?? 0.0
          : 0.0,
      loyaltyPoints: json['loyaltyPoints'] as int? ?? 0,
      allowAdminCards: json['allowAdminCards'] as bool? ?? false,
      currency: json['currency'] as String? ?? 'SDG',
      transactions: txList,
    );
  }
}

/// Comprehensive Financial & Analytics Report model
class FinancialPeriodModel {
  final String key;
  final String label;
  final String startDate;
  final String endDate;
  final double grossSales;
  final double discounts;
  final double netSales;
  final double cashCollected;
  final double remainingReceivables;
  final double operatingExpenses;
  final double cogs;
  final double grossProfit;
  final double netProfit;
  final double netCashFlow;
  final double profitMarginPercent;
  final int salesCount;
  final int cardsCount;
  final double refundsAmount;
  final int refundsCount;
  final bool hasCostData;
  final bool hasExpenseData;
  final String accountingNotes;

  FinancialPeriodModel({
    required this.key,
    required this.label,
    required this.startDate,
    required this.endDate,
    required this.grossSales,
    this.discounts = 0.0,
    required this.netSales,
    required this.cashCollected,
    required this.remainingReceivables,
    required this.operatingExpenses,
    required this.cogs,
    required this.grossProfit,
    required this.netProfit,
    required this.netCashFlow,
    required this.profitMarginPercent,
    required this.salesCount,
    required this.cardsCount,
    this.refundsAmount = 0.0,
    this.refundsCount = 0,
    this.hasCostData = false,
    this.hasExpenseData = false,
    this.accountingNotes = '',
  });

  factory FinancialPeriodModel.fromJson(Map<String, dynamic> json) {
    return FinancialPeriodModel(
      key: json['key'] as String? ?? 'all_time',
      label: json['label'] as String? ?? 'الإجمالي الكلي',
      startDate: json['startDate'] as String? ?? '',
      endDate: json['endDate'] as String? ?? '',
      grossSales: double.tryParse(json['grossSales']?.toString() ?? '0') ?? 0.0,
      discounts: double.tryParse(json['discounts']?.toString() ?? '0') ?? 0.0,
      netSales: double.tryParse(json['netSales']?.toString() ?? '0') ?? 0.0,
      cashCollected: double.tryParse(json['cashCollected']?.toString() ?? '0') ?? 0.0,
      remainingReceivables: double.tryParse(json['remainingReceivables']?.toString() ?? '0') ?? 0.0,
      operatingExpenses: double.tryParse(json['operatingExpenses']?.toString() ?? '0') ?? 0.0,
      cogs: double.tryParse(json['cogs']?.toString() ?? '0') ?? 0.0,
      grossProfit: double.tryParse(json['grossProfit']?.toString() ?? '0') ?? 0.0,
      netProfit: double.tryParse(json['netProfit']?.toString() ?? '0') ?? 0.0,
      netCashFlow: double.tryParse(json['netCashFlow']?.toString() ?? '0') ?? 0.0,
      profitMarginPercent: double.tryParse(json['profitMarginPercent']?.toString() ?? '0') ?? 0.0,
      salesCount: json['salesCount'] as int? ?? 0,
      cardsCount: json['cardsCount'] as int? ?? 0,
      refundsAmount: double.tryParse(json['refundsAmount']?.toString() ?? '0') ?? 0.0,
      refundsCount: json['refundsCount'] as int? ?? 0,
      hasCostData: json['hasCostData'] as bool? ?? false,
      hasExpenseData: json['hasExpenseData'] as bool? ?? false,
      accountingNotes: json['accountingNotes'] as String? ?? '',
    );
  }
}

class CardInventoryMetricsModel {
  final int totalCardsGenerated;
  final int totalCardsPrinted;
  final int totalCardsAvailable;
  final int totalCardsSold;
  final int totalCardsActive;
  final int totalCardsExpired;
  final int totalCardsDisabled;
  final double stockEstimatedValue;
  final double stockCostValue;

  CardInventoryMetricsModel({
    this.totalCardsGenerated = 0,
    this.totalCardsPrinted = 0,
    this.totalCardsAvailable = 0,
    this.totalCardsSold = 0,
    this.totalCardsActive = 0,
    this.totalCardsExpired = 0,
    this.totalCardsDisabled = 0,
    this.stockEstimatedValue = 0.0,
    this.stockCostValue = 0.0,
  });

  factory CardInventoryMetricsModel.fromJson(Map<String, dynamic> json) {
    return CardInventoryMetricsModel(
      totalCardsGenerated: json['totalCardsGenerated'] as int? ?? 0,
      totalCardsPrinted: json['totalCardsPrinted'] as int? ?? 0,
      totalCardsAvailable: json['totalCardsAvailable'] as int? ?? 0,
      totalCardsSold: json['totalCardsSold'] as int? ?? 0,
      totalCardsActive: json['totalCardsActive'] as int? ?? 0,
      totalCardsExpired: json['totalCardsExpired'] as int? ?? 0,
      totalCardsDisabled: json['totalCardsDisabled'] as int? ?? 0,
      stockEstimatedValue: double.tryParse(json['stockEstimatedValue']?.toString() ?? '0') ?? 0.0,
      stockCostValue: double.tryParse(json['stockCostValue']?.toString() ?? '0') ?? 0.0,
    );
  }
}

class ExpenseCategoryBreakdownModel {
  final String category;
  final String categoryLabelAr;
  final double totalAmount;
  final int count;
  final int percentage;

  ExpenseCategoryBreakdownModel({
    required this.category,
    required this.categoryLabelAr,
    required this.totalAmount,
    this.count = 0,
    this.percentage = 0,
  });

  factory ExpenseCategoryBreakdownModel.fromJson(Map<String, dynamic> json) {
    return ExpenseCategoryBreakdownModel(
      category: json['category'] as String? ?? 'OTHER',
      categoryLabelAr: json['categoryLabelAr'] as String? ?? 'أخرى',
      totalAmount: double.tryParse(json['totalAmount']?.toString() ?? '0') ?? 0.0,
      count: json['count'] as int? ?? 0,
      percentage: json['percentage'] as int? ?? 0,
    );
  }
}

class ExpenseItemModel {
  final String id;
  final String title;
  final String category;
  final String categoryLabelAr;
  final double amount;
  final String currency;
  final DateTime expenseDate;
  final String paymentMethod;
  final String? vendor;
  final String? description;
  final String? receiptUrl;
  final String? createdByName;
  final DateTime createdAt;

  ExpenseItemModel({
    required this.id,
    required this.title,
    required this.category,
    required this.categoryLabelAr,
    required this.amount,
    this.currency = 'SDG',
    required this.expenseDate,
    this.paymentMethod = 'CASH',
    this.vendor,
    this.description,
    this.receiptUrl,
    this.createdByName,
    required this.createdAt,
  });

  factory ExpenseItemModel.fromJson(Map<String, dynamic> json) {
    return ExpenseItemModel(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      category: json['category'] as String? ?? 'OTHER',
      categoryLabelAr: json['categoryLabelAr'] as String? ?? 'مصروف',
      amount: double.tryParse(json['amount']?.toString() ?? '0') ?? 0.0,
      currency: json['currency'] as String? ?? 'SDG',
      expenseDate: json['expenseDate'] != null ? DateTime.parse(json['expenseDate'].toString()) : DateTime.now(),
      paymentMethod: json['paymentMethod'] as String? ?? 'CASH',
      vendor: json['vendor'] as String?,
      description: json['description'] as String?,
      receiptUrl: json['receiptUrl'] as String?,
      createdByName: json['createdBy'] != null ? json['createdBy']['fullName'] as String? : null,
      createdAt: json['createdAt'] != null ? DateTime.parse(json['createdAt'].toString()) : DateTime.now(),
    );
  }
}

class FinancialReportModel {
  final double todayRevenue;
  final int todaySalesCount;
  final double todayCollected;
  final double weekRevenue;
  final int weekSalesCount;
  final double weekCollected;
  final double monthRevenue;
  final int monthSalesCount;
  final double monthCollected;
  final double allTimeRevenue;
  final int allTimeSalesCount;
  final double allTimeCollected;
  final double totalRefunds;
  final int refundedCount;
  final double profitMarginPercent;
  final double estimatedProfit;
  final String profitNotes;
  final bool hasCostData;
  final String currency;
  final double totalOperatingExpenses;
  final double netOperatingProfit;
  final double totalGrossSales;
  final double totalDiscounts;
  final double totalReceivables;
  final double netCashFlow;

  final FinancialPeriodModel selectedPeriod;
  final CardInventoryMetricsModel inventory;
  final List<ExpenseCategoryBreakdownModel> expensesBreakdown;

  final bool isForecastAvailable;
  final String forecastMessage;
  final String forecastNote;
  final int daysAnalyzed;
  final double dailyAverage;
  final double next7DaysForecast;
  final double next30DaysForecast;
  final String trend;
  final List<Map<String, dynamic>> bestSellingProfiles;
  final List<Map<String, dynamic>> salesByRouter;
  final List<Map<String, dynamic>> salesByCashier;
  final List<Map<String, dynamic>> dailyRevenueLast30Days;

  FinancialReportModel({
    required this.todayRevenue,
    required this.todaySalesCount,
    this.todayCollected = 0.0,
    required this.weekRevenue,
    required this.weekSalesCount,
    this.weekCollected = 0.0,
    required this.monthRevenue,
    required this.monthSalesCount,
    this.monthCollected = 0.0,
    required this.allTimeRevenue,
    this.allTimeSalesCount = 0,
    this.allTimeCollected = 0.0,
    this.totalRefunds = 0.0,
    this.refundedCount = 0,
    required this.profitMarginPercent,
    required this.estimatedProfit,
    this.profitNotes = '',
    this.hasCostData = false,
    required this.currency,
    this.totalOperatingExpenses = 0.0,
    this.netOperatingProfit = 0.0,
    this.totalGrossSales = 0.0,
    this.totalDiscounts = 0.0,
    this.totalReceivables = 0.0,
    this.netCashFlow = 0.0,
    required this.selectedPeriod,
    required this.inventory,
    this.expensesBreakdown = const [],
    this.isForecastAvailable = true,
    this.forecastMessage = '',
    this.forecastNote = '',
    this.daysAnalyzed = 30,
    this.dailyAverage = 0.0,
    required this.next7DaysForecast,
    required this.next30DaysForecast,
    required this.trend,
    required this.bestSellingProfiles,
    required this.salesByRouter,
    required this.salesByCashier,
    required this.dailyRevenueLast30Days,
  });

  factory FinancialReportModel.fromJson(Map<String, dynamic> json) {
    final summary = json['summary'] as Map<String, dynamic>? ?? {};
    final forecast = json['forecast'] as Map<String, dynamic>? ?? {};
    final selectedPeriodRaw = json['selectedPeriod'] as Map<String, dynamic>?;
    final inventoryRaw = json['inventory'] as Map<String, dynamic>?;
    final expensesBreakdownRaw = json['expensesBreakdown'] as List?;

    final todayRev = double.tryParse(summary['todayRevenue']?.toString() ?? '0') ?? 0.0;
    final weekRev = double.tryParse(summary['weekRevenue']?.toString() ?? '0') ?? 0.0;
    final monthRev = double.tryParse(summary['monthRevenue']?.toString() ?? '0') ?? 0.0;
    final allTimeRev = double.tryParse(summary['allTimeRevenue']?.toString() ?? '0') ?? 0.0;

    final selectedPeriod = selectedPeriodRaw != null
        ? FinancialPeriodModel.fromJson(selectedPeriodRaw)
        : FinancialPeriodModel(
            key: 'all_time',
            label: 'الإجمالي الكلي',
            startDate: '',
            endDate: '',
            grossSales: allTimeRev,
            discounts: 0.0,
            netSales: allTimeRev,
            cashCollected: double.tryParse(summary['allTimeCollected']?.toString() ?? '') ?? allTimeRev,
            remainingReceivables: 0.0,
            operatingExpenses: double.tryParse(summary['totalOperatingExpenses']?.toString() ?? '0') ?? 0.0,
            cogs: 0.0,
            grossProfit: allTimeRev,
            netProfit: double.tryParse(summary['estimatedProfit']?.toString() ?? '') ?? allTimeRev,
            netCashFlow: double.tryParse(summary['netCashFlow']?.toString() ?? '') ?? allTimeRev,
            profitMarginPercent: double.tryParse(summary['profitMarginPercent']?.toString() ?? '100') ?? 100.0,
            salesCount: summary['allTimeSalesCount'] as int? ?? 0,
            cardsCount: summary['allTimeSalesCount'] as int? ?? 0,
          );

    final inventory = inventoryRaw != null
        ? CardInventoryMetricsModel.fromJson(inventoryRaw)
        : CardInventoryMetricsModel();

    final expensesBreakdown = expensesBreakdownRaw != null
        ? expensesBreakdownRaw.map((e) => ExpenseCategoryBreakdownModel.fromJson(e as Map<String, dynamic>)).toList()
        : <ExpenseCategoryBreakdownModel>[];

    return FinancialReportModel(
      todayRevenue: todayRev,
      todaySalesCount: summary['todaySalesCount'] as int? ?? 0,
      todayCollected: double.tryParse(summary['todayCollected']?.toString() ?? '') ?? todayRev,
      weekRevenue: weekRev,
      weekSalesCount: summary['weekSalesCount'] as int? ?? 0,
      weekCollected: double.tryParse(summary['weekCollected']?.toString() ?? '') ?? weekRev,
      monthRevenue: monthRev,
      monthSalesCount: summary['monthSalesCount'] as int? ?? 0,
      monthCollected: double.tryParse(summary['monthCollected']?.toString() ?? '') ?? monthRev,
      allTimeRevenue: allTimeRev,
      allTimeSalesCount: summary['allTimeSalesCount'] as int? ?? 0,
      allTimeCollected: double.tryParse(summary['allTimeCollected']?.toString() ?? '') ?? allTimeRev,
      totalRefunds: double.tryParse(summary['totalRefunds']?.toString() ?? '0') ?? 0.0,
      refundedCount: summary['refundedCount'] as int? ?? 0,
      profitMarginPercent: double.tryParse(summary['profitMarginPercent']?.toString() ?? '100') ?? 100.0,
      estimatedProfit: double.tryParse(summary['estimatedProfit']?.toString() ?? '') ?? allTimeRev,
      profitNotes: summary['profitNotes'] as String? ?? '',
      hasCostData: summary['hasCostData'] as bool? ?? false,
      currency: summary['currency'] as String? ?? 'SDG',
      totalOperatingExpenses: double.tryParse(summary['totalOperatingExpenses']?.toString() ?? '0') ?? 0.0,
      netOperatingProfit: double.tryParse(summary['netOperatingProfit']?.toString() ?? '') ?? (double.tryParse(summary['estimatedProfit']?.toString() ?? '') ?? allTimeRev),
      totalGrossSales: double.tryParse(summary['totalGrossSales']?.toString() ?? '') ?? allTimeRev,
      totalDiscounts: double.tryParse(summary['totalDiscounts']?.toString() ?? '0') ?? 0.0,
      totalReceivables: double.tryParse(summary['totalReceivables']?.toString() ?? '0') ?? 0.0,
      netCashFlow: double.tryParse(summary['netCashFlow']?.toString() ?? '') ?? allTimeRev,
      selectedPeriod: selectedPeriod,
      inventory: inventory,
      expensesBreakdown: expensesBreakdown,
      isForecastAvailable: forecast['isAvailable'] as bool? ?? true,
      forecastMessage: forecast['message'] as String? ?? '',
      forecastNote: forecast['note'] as String? ?? '',
      daysAnalyzed: forecast['daysAnalyzed'] as int? ?? 30,
      dailyAverage: double.tryParse(forecast['dailyAverage']?.toString() ?? '0') ?? 0.0,
      next7DaysForecast: double.tryParse(forecast['next7Days']?.toString() ?? '0') ?? 0.0,
      next30DaysForecast: double.tryParse(forecast['next30Days']?.toString() ?? '0') ?? 0.0,
      trend: forecast['trend'] as String? ?? 'STABLE',
      bestSellingProfiles: List<Map<String, dynamic>>.from(json['bestSellingProfiles'] as List? ?? []),
      salesByRouter: List<Map<String, dynamic>>.from(json['salesByRouter'] as List? ?? []),
      salesByCashier: List<Map<String, dynamic>>.from(json['salesByCashier'] as List? ?? []),
      dailyRevenueLast30Days: List<Map<String, dynamic>>.from(json['dailyRevenueLast30Days'] as List? ?? []),
    );
  }
}

/// SaaS Subscription & Quotas model
class TenantQuotaModel {
  final String? tenantId;
  final String? planName;
  final String? planNameAr;
  final int maxRouters;
  final int? cardLimit;
  final int usedCards;
  final int? remainingCards;
  final bool isUnlimited;
  final DateTime? cycleStart;
  final DateTime? cycleEnd;
  final DateTime? expiresAt;
  final String status;

  TenantQuotaModel({
    this.tenantId,
    this.planName,
    this.planNameAr,
    this.maxRouters = 1,
    this.cardLimit,
    this.usedCards = 0,
    this.remainingCards,
    this.isUnlimited = false,
    this.cycleStart,
    this.cycleEnd,
    this.expiresAt,
    this.status = 'ACTIVE',
  });

  factory TenantQuotaModel.fromJson(Map<String, dynamic> json) {
    final rawLimit = json['cardLimit'] ?? json['maxCardsPerMonth'] ?? json['limit'];
    final parsedLimit = rawLimit != null ? int.tryParse(rawLimit.toString()) : null;

    final rawUsed = json['usedCards'] ?? json['used'] ?? 0;
    final parsedUsed = int.tryParse(rawUsed.toString()) ?? 0;

    final rawRem = json['remainingCards'] ?? json['remaining'];
    final parsedRem = rawRem != null ? int.tryParse(rawRem.toString()) : null;

    final unlim = json['isUnlimited'] == true || (json['isUnlimited'] == null && rawLimit == null);

    final plan = json['planName'] as String? ?? json['plan'] as String? ?? json['expiredPlanName'] as String?;
    final planAr = json['planNameAr'] as String?;
    final tenantId = json['tenantId'] as String? ?? json['tenant']?['id'] as String?;

    return TenantQuotaModel(
      tenantId: tenantId,
      planName: plan,
      planNameAr: planAr,
      maxRouters: json['maxRouters'] as int? ?? 1,
      cardLimit: unlim ? null : parsedLimit,
      usedCards: parsedUsed,
      remainingCards: unlim ? null : (parsedRem ?? (parsedLimit != null ? (parsedLimit - parsedUsed).clamp(0, 999999999) : 0)),
      isUnlimited: unlim,
      cycleStart: json['cycleStart'] != null ? DateTime.tryParse(json['cycleStart'].toString()) : null,
      cycleEnd: json['cycleEnd'] != null ? DateTime.tryParse(json['cycleEnd'].toString()) : (json['resetsAt'] != null ? DateTime.tryParse(json['resetsAt'].toString()) : null),
      expiresAt: json['expiresAt'] != null ? DateTime.tryParse(json['expiresAt'].toString()) : null,
      status: json['status'] as String? ?? 'ACTIVE',
    );
  }

  Map<String, dynamic> toJson() => {
    'tenantId': tenantId,
    'planName': planName,
    'planNameAr': planNameAr,
    'maxRouters': maxRouters,
    'cardLimit': cardLimit,
    'usedCards': usedCards,
    'remainingCards': remainingCards,
    'isUnlimited': isUnlimited,
    'cycleStart': cycleStart?.toIso8601String(),
    'cycleEnd': cycleEnd?.toIso8601String(),
    'expiresAt': expiresAt?.toIso8601String(),
    'status': status,
  };
}

/// ============================================================================
/// PPPoE & BROADBAND MODELS
/// ============================================================================

/// PPPoE Bandwidth & Package Profile
class PppoeProfileModel {
  final String id;
  final String tenantId;
  final String deviceId;
  final String name;
  final String? rateLimit;
  final String? localAddress;
  final String? remoteAddress;
  final String? dnsServers;
  final bool onlyOne;
  final double price;
  final String? description;
  final int accountsCount;
  final String? queuedCommandId;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  PppoeProfileModel({
    required this.id,
    required this.tenantId,
    required this.deviceId,
    required this.name,
    this.rateLimit,
    this.localAddress,
    this.remoteAddress,
    this.dnsServers,
    this.onlyOne = true,
    this.price = 0.0,
    this.description,
    this.accountsCount = 0,
    this.queuedCommandId,
    this.createdAt,
    this.updatedAt,
  });

  factory PppoeProfileModel.fromJson(Map<String, dynamic> json) {
    return PppoeProfileModel(
      id: json['id'] as String? ?? '',
      tenantId: json['tenantId'] as String? ?? '',
      deviceId: json['deviceId'] as String? ?? '',
      name: json['name'] as String? ?? '',
      rateLimit: json['rateLimit'] as String?,
      localAddress: json['localAddress'] as String?,
      remoteAddress: json['remoteAddress'] as String?,
      dnsServers: json['dnsServers'] as String?,
      onlyOne: json['onlyOne'] as bool? ?? true,
      price: double.tryParse(json['price']?.toString() ?? '0') ?? 0.0,
      description: json['description'] as String?,
      accountsCount: (json['accountsCount'] as num?)?.toInt() ?? 0,
      queuedCommandId: json['queuedCommandId'] as String?,
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt'].toString()) : null,
      updatedAt: json['updatedAt'] != null ? DateTime.tryParse(json['updatedAt'].toString()) : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'tenantId': tenantId,
    'deviceId': deviceId,
    'name': name,
    'rateLimit': rateLimit,
    'localAddress': localAddress,
    'remoteAddress': remoteAddress,
    'dnsServers': dnsServers,
    'onlyOne': onlyOne,
    'price': price,
    'description': description,
    'accountsCount': accountsCount,
    'queuedCommandId': queuedCommandId,
    'createdAt': createdAt?.toIso8601String(),
    'updatedAt': updatedAt?.toIso8601String(),
  };

  Map<String, dynamic> toCreatePayload() => {
    'name': name.trim(),
    if (rateLimit != null && rateLimit!.trim().isNotEmpty) 'rateLimit': rateLimit!.trim(),
    if (localAddress != null && localAddress!.trim().isNotEmpty) 'localAddress': localAddress!.trim(),
    if (remoteAddress != null && remoteAddress!.trim().isNotEmpty) 'remoteAddress': remoteAddress!.trim(),
    if (dnsServers != null && dnsServers!.trim().isNotEmpty) 'dnsServers': dnsServers!.trim(),
    'onlyOne': onlyOne,
    'price': price,
    if (description != null && description!.trim().isNotEmpty) 'description': description!.trim(),
  };

  Map<String, dynamic> toUpdatePayload() => {
    'name': name.trim(),
    if (rateLimit != null && rateLimit!.trim().isNotEmpty) 'rateLimit': rateLimit!.trim(),
    if (localAddress != null && localAddress!.trim().isNotEmpty) 'localAddress': localAddress!.trim(),
    if (remoteAddress != null && remoteAddress!.trim().isNotEmpty) 'remoteAddress': remoteAddress!.trim(),
    if (dnsServers != null && dnsServers!.trim().isNotEmpty) 'dnsServers': dnsServers!.trim(),
    'onlyOne': onlyOne,
    'price': price,
    if (description != null && description!.trim().isNotEmpty) 'description': description!.trim(),
  };

  PppoeProfileModel copyWith({
    String? id,
    String? tenantId,
    String? deviceId,
    String? name,
    String? rateLimit,
    String? localAddress,
    String? remoteAddress,
    String? dnsServers,
    bool? onlyOne,
    double? price,
    String? description,
    int? accountsCount,
    String? queuedCommandId,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return PppoeProfileModel(
      id: id ?? this.id,
      tenantId: tenantId ?? this.tenantId,
      deviceId: deviceId ?? this.deviceId,
      name: name ?? this.name,
      rateLimit: rateLimit ?? this.rateLimit,
      localAddress: localAddress ?? this.localAddress,
      remoteAddress: remoteAddress ?? this.remoteAddress,
      dnsServers: dnsServers ?? this.dnsServers,
      onlyOne: onlyOne ?? this.onlyOne,
      price: price ?? this.price,
      description: description ?? this.description,
      accountsCount: accountsCount ?? this.accountsCount,
      queuedCommandId: queuedCommandId ?? this.queuedCommandId,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}

/// PPPoE Subscriber Account
class PppoeAccountModel {
  final String id;
  final String tenantId;
  final String deviceId;
  final String profileId;
  final String? profileName;
  final String username;
  final String status; // ACTIVE, DISABLED, EXPIRED, SUSPENDED
  final String? callerId;
  final String? staticIp;
  final String? customerName;
  final String? customerPhone;
  final double price;
  final String billingCycle; // MONTHLY, YEARLY
  final DateTime? expiresAt;
  final String? notes;
  final String syncStatus; // PENDING, SYNCED, FAILED
  final String? syncError;
  final String? queuedCommandId;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  PppoeAccountModel({
    required this.id,
    required this.tenantId,
    required this.deviceId,
    required this.profileId,
    this.profileName,
    required this.username,
    this.status = 'ACTIVE',
    this.callerId,
    this.staticIp,
    this.customerName,
    this.customerPhone,
    this.price = 0.0,
    this.billingCycle = 'MONTHLY',
    this.expiresAt,
    this.notes,
    this.syncStatus = 'PENDING',
    this.syncError,
    this.queuedCommandId,
    this.createdAt,
    this.updatedAt,
  });

  bool get isActive => status == 'ACTIVE';
  bool get isDisabled => status == 'DISABLED';
  bool get isExpired => status == 'EXPIRED';
  bool get isSuspended => status == 'SUSPENDED';

  factory PppoeAccountModel.fromJson(Map<String, dynamic> json) {
    return PppoeAccountModel(
      id: json['id'] as String? ?? '',
      tenantId: json['tenantId'] as String? ?? '',
      deviceId: json['deviceId'] as String? ?? '',
      profileId: json['profileId'] as String? ?? '',
      profileName: json['profileName'] as String?,
      username: json['username'] as String? ?? '',
      status: json['status'] as String? ?? 'ACTIVE',
      callerId: json['callerId'] as String?,
      staticIp: json['staticIp'] as String?,
      customerName: json['customerName'] as String?,
      customerPhone: json['customerPhone'] as String?,
      price: double.tryParse(json['price']?.toString() ?? '0') ?? 0.0,
      billingCycle: json['billingCycle'] as String? ?? 'MONTHLY',
      expiresAt: json['expiresAt'] != null ? DateTime.tryParse(json['expiresAt'].toString()) : null,
      notes: json['notes'] as String?,
      syncStatus: json['syncStatus'] as String? ?? 'PENDING',
      syncError: json['syncError'] as String?,
      queuedCommandId: json['queuedCommandId'] as String?,
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt'].toString()) : null,
      updatedAt: json['updatedAt'] != null ? DateTime.tryParse(json['updatedAt'].toString()) : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'tenantId': tenantId,
    'deviceId': deviceId,
    'profileId': profileId,
    'profileName': profileName,
    'username': username,
    'status': status,
    'callerId': callerId,
    'staticIp': staticIp,
    'customerName': customerName,
    'customerPhone': customerPhone,
    'price': price,
    'billingCycle': billingCycle,
    'expiresAt': expiresAt?.toIso8601String(),
    'notes': notes,
    'syncStatus': syncStatus,
    'syncError': syncError,
    'queuedCommandId': queuedCommandId,
    'createdAt': createdAt?.toIso8601String(),
    'updatedAt': updatedAt?.toIso8601String(),
  };

  PppoeAccountModel copyWith({
    String? id,
    String? tenantId,
    String? deviceId,
    String? profileId,
    String? profileName,
    String? username,
    String? status,
    String? callerId,
    String? staticIp,
    String? customerName,
    String? customerPhone,
    double? price,
    String? billingCycle,
    DateTime? expiresAt,
    String? notes,
    String? syncStatus,
    String? syncError,
    String? queuedCommandId,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return PppoeAccountModel(
      id: id ?? this.id,
      tenantId: tenantId ?? this.tenantId,
      deviceId: deviceId ?? this.deviceId,
      profileId: profileId ?? this.profileId,
      profileName: profileName ?? this.profileName,
      username: username ?? this.username,
      status: status ?? this.status,
      callerId: callerId ?? this.callerId,
      staticIp: staticIp ?? this.staticIp,
      customerName: customerName ?? this.customerName,
      customerPhone: customerPhone ?? this.customerPhone,
      price: price ?? this.price,
      billingCycle: billingCycle ?? this.billingCycle,
      expiresAt: expiresAt ?? this.expiresAt,
      notes: notes ?? this.notes,
      syncStatus: syncStatus ?? this.syncStatus,
      syncError: syncError ?? this.syncError,
      queuedCommandId: queuedCommandId ?? this.queuedCommandId,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}

/// PPPoE Live Active Session
class PppoeActiveSessionModel {
  final String id;
  final String tenantId;
  final String deviceId;
  final String? accountId;
  final String username;
  final String ipAddress;
  final String? macAddress;
  final int uptimeSeconds;
  final int bytesIn;
  final int bytesOut;
  final String? sessionId;
  final DateTime? startedAt;

  PppoeActiveSessionModel({
    required this.id,
    required this.tenantId,
    required this.deviceId,
    this.accountId,
    required this.username,
    required this.ipAddress,
    this.macAddress,
    this.uptimeSeconds = 0,
    this.bytesIn = 0,
    this.bytesOut = 0,
    this.sessionId,
    this.startedAt,
  });

  String get formattedUptime {
    if (uptimeSeconds <= 0) return '0 ثانية';
    final d = uptimeSeconds ~/ 86400;
    final h = (uptimeSeconds % 86400) ~/ 3600;
    final m = (uptimeSeconds % 3600) ~/ 60;
    final s = uptimeSeconds % 60;
    final parts = <String>[];
    if (d > 0) parts.add('$d يوم');
    if (h > 0) parts.add('$h س');
    if (m > 0) parts.add('$m د');
    if (parts.isEmpty || (d == 0 && h == 0)) parts.add('$s ث');
    return parts.join(' ');
  }

  static String formatBytes(int bytes) {
    if (bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    double val = bytes.toDouble();
    int idx = 0;
    while (val >= 1024 && idx < units.length - 1) {
      val /= 1024;
      idx++;
    }
    return '${val.toStringAsFixed(2)} ${units[idx]}';
  }

  String get formattedBytesIn => formatBytes(bytesIn);
  String get formattedBytesOut => formatBytes(bytesOut);

  factory PppoeActiveSessionModel.fromJson(Map<String, dynamic> json) {
    return PppoeActiveSessionModel(
      id: json['id'] as String? ?? '',
      tenantId: json['tenantId'] as String? ?? '',
      deviceId: json['deviceId'] as String? ?? '',
      accountId: json['accountId'] as String?,
      username: json['username'] as String? ?? '',
      ipAddress: json['ipAddress'] as String? ?? '',
      macAddress: json['macAddress'] as String?,
      uptimeSeconds: (json['uptimeSeconds'] as num?)?.toInt() ?? 0,
      bytesIn: (json['bytesIn'] as num?)?.toInt() ?? 0,
      bytesOut: (json['bytesOut'] as num?)?.toInt() ?? 0,
      sessionId: json['sessionId'] as String?,
      startedAt: json['startedAt'] != null ? DateTime.tryParse(json['startedAt'].toString()) : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'tenantId': tenantId,
    'deviceId': deviceId,
    'accountId': accountId,
    'username': username,
    'ipAddress': ipAddress,
    'macAddress': macAddress,
    'uptimeSeconds': uptimeSeconds,
    'bytesIn': bytesIn,
    'bytesOut': bytesOut,
    'sessionId': sessionId,
    'startedAt': startedAt?.toIso8601String(),
  };
}

/// Agent Command Execution Status
class PppoeCommandStatusModel {
  final String id;
  final String operationId;
  final String deviceId;
  final String agentId;
  final String type;
  final String status; // PENDING, DISPATCHED, COMPLETED, FAILED, EXPIRED
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? result;
  final String? errorMessage;
  final DateTime? createdAt;
  final DateTime? dispatchedAt;
  final DateTime? completedAt;
  final DateTime? expiresAt;

  PppoeCommandStatusModel({
    required this.id,
    required this.operationId,
    required this.deviceId,
    required this.agentId,
    required this.type,
    required this.status,
    this.payload = const {},
    this.result,
    this.errorMessage,
    this.createdAt,
    this.dispatchedAt,
    this.completedAt,
    this.expiresAt,
  });

  bool get isCompleted => status == 'COMPLETED';
  bool get isFailed => status == 'FAILED';
  bool get isDispatched => status == 'DISPATCHED';
  bool get isPending => status == 'PENDING';
  bool get isExpired => status == 'EXPIRED';

  factory PppoeCommandStatusModel.fromJson(Map<String, dynamic> json) {
    return PppoeCommandStatusModel(
      id: json['id'] as String? ?? '',
      operationId: json['operationId'] as String? ?? '',
      deviceId: json['deviceId'] as String? ?? '',
      agentId: json['agentId'] as String? ?? '',
      type: json['type'] as String? ?? '',
      status: json['status'] as String? ?? 'PENDING',
      payload: json['payload'] is Map ? Map<String, dynamic>.from(json['payload'] as Map) : {},
      result: json['result'] is Map ? Map<String, dynamic>.from(json['result'] as Map) : null,
      errorMessage: json['errorMessage'] as String?,
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt'].toString()) : null,
      dispatchedAt: json['dispatchedAt'] != null ? DateTime.tryParse(json['dispatchedAt'].toString()) : null,
      completedAt: json['completedAt'] != null ? DateTime.tryParse(json['completedAt'].toString()) : null,
      expiresAt: json['expiresAt'] != null ? DateTime.tryParse(json['expiresAt'].toString()) : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'operationId': operationId,
    'deviceId': deviceId,
    'agentId': agentId,
    'type': type,
    'status': status,
    'payload': payload,
    'result': result,
    'errorMessage': errorMessage,
    'createdAt': createdAt?.toIso8601String(),
    'dispatchedAt': dispatchedAt?.toIso8601String(),
    'completedAt': completedAt?.toIso8601String(),
    'expiresAt': expiresAt?.toIso8601String(),
  };
}

/// ============================================================================
/// HOTSPOT CAPTIVE PORTAL DESIGNER MODELS
/// ============================================================================

class HotspotPortalConfigModel {
  final String id;
  final String tenantId;
  final String name;
  final String themePreset;
  final String networkName;
  final String title;
  final String subtitle;
  final String? logoUrl;
  final String primaryColor;
  final String accentColor;
  final String backgroundColor;
  final String cardColor;
  final String textColor;
  final String loginMethod;
  final String? contactPhone;
  final String? termsText;
  final String? footerText;
  final String? customCss;
  final bool isDefault;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  HotspotPortalConfigModel({
    required this.id,
    required this.tenantId,
    required this.name,
    required this.themePreset,
    required this.networkName,
    required this.title,
    required this.subtitle,
    this.logoUrl,
    required this.primaryColor,
    required this.accentColor,
    required this.backgroundColor,
    required this.cardColor,
    required this.textColor,
    required this.loginMethod,
    this.contactPhone,
    this.termsText,
    this.footerText,
    this.customCss,
    required this.isDefault,
    this.createdAt,
    this.updatedAt,
  });

  factory HotspotPortalConfigModel.fromJson(Map<String, dynamic> json) {
    return HotspotPortalConfigModel(
      id: json['id'] as String? ?? '',
      tenantId: json['tenantId'] as String? ?? '',
      name: json['name'] as String? ?? 'افتراضي',
      themePreset: json['themePreset'] as String? ?? 'MODERN_DARK',
      networkName: json['networkName'] as String? ?? 'شبكة الواي فاي',
      title: json['title'] as String? ?? 'تسجيل الدخول إلى الشبكة',
      subtitle: json['subtitle'] as String? ?? 'أدخل كود الكرت للاتصال بالإنترنت',
      logoUrl: json['logoUrl'] as String?,
      primaryColor: json['primaryColor'] as String? ?? '#0EA5E9',
      accentColor: json['accentColor'] as String? ?? '#0284C7',
      backgroundColor: json['backgroundColor'] as String? ?? '#0F172A',
      cardColor: json['cardColor'] as String? ?? '#1E293B',
      textColor: json['textColor'] as String? ?? '#F8FAFC',
      loginMethod: json['loginMethod'] as String? ?? 'VOUCHER_CODE',
      contactPhone: json['contactPhone'] as String?,
      termsText: json['termsText'] as String?,
      footerText: json['footerText'] as String?,
      customCss: json['customCss'] as String?,
      isDefault: json['isDefault'] as bool? ?? false,
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt'].toString()) : null,
      updatedAt: json['updatedAt'] != null ? DateTime.tryParse(json['updatedAt'].toString()) : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'tenantId': tenantId,
    'name': name,
    'themePreset': themePreset,
    'networkName': networkName,
    'title': title,
    'subtitle': subtitle,
    'logoUrl': logoUrl,
    'primaryColor': primaryColor,
    'accentColor': accentColor,
    'backgroundColor': backgroundColor,
    'cardColor': cardColor,
    'textColor': textColor,
    'loginMethod': loginMethod,
    'contactPhone': contactPhone,
    'termsText': termsText,
    'footerText': footerText,
    'customCss': customCss,
    'isDefault': isDefault,
    'createdAt': createdAt?.toIso8601String(),
    'updatedAt': updatedAt?.toIso8601String(),
  };

  HotspotPortalConfigModel copyWith({
    String? id,
    String? tenantId,
    String? name,
    String? themePreset,
    String? networkName,
    String? title,
    String? subtitle,
    String? logoUrl,
    String? primaryColor,
    String? accentColor,
    String? backgroundColor,
    String? cardColor,
    String? textColor,
    String? loginMethod,
    String? contactPhone,
    String? termsText,
    String? footerText,
    String? customCss,
    bool? isDefault,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return HotspotPortalConfigModel(
      id: id ?? this.id,
      tenantId: tenantId ?? this.tenantId,
      name: name ?? this.name,
      themePreset: themePreset ?? this.themePreset,
      networkName: networkName ?? this.networkName,
      title: title ?? this.title,
      subtitle: subtitle ?? this.subtitle,
      logoUrl: logoUrl ?? this.logoUrl,
      primaryColor: primaryColor ?? this.primaryColor,
      accentColor: accentColor ?? this.accentColor,
      backgroundColor: backgroundColor ?? this.backgroundColor,
      cardColor: cardColor ?? this.cardColor,
      textColor: textColor ?? this.textColor,
      loginMethod: loginMethod ?? this.loginMethod,
      contactPhone: contactPhone ?? this.contactPhone,
      termsText: termsText ?? this.termsText,
      footerText: footerText ?? this.footerText,
      customCss: customCss ?? this.customCss,
      isDefault: isDefault ?? this.isDefault,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}

/// Represents a connected device discovered on the router (DHCP Leases, ARP, Neighbors)
class ConnectedDeviceModel {
  final String id;
  final String name;
  final String ipAddress;
  final String macAddress;
  final String? interfaceName;
  final String status;
  final bool isOnline;
  final String connectionCertainty; // 'CONFIRMED_ONLINE' | 'LEASE_ACTIVE' | 'OFFLINE'
  final String deviceType; // 'ACCESS_POINT' | 'PHONE' | 'COMPUTER' | 'ROUTER' | 'UNKNOWN'
  final String? hostName;
  final String? vendor;
  final String? uptime;
  final String? expiresAfter;
  final String? lastSeen;
  final String? age;
  final String source; // 'DHCP' | 'ARP' | 'NEIGHBOR'
  final List<String> sources;

  const ConnectedDeviceModel({
    required this.id,
    required this.name,
    required this.ipAddress,
    required this.macAddress,
    this.interfaceName,
    required this.status,
    required this.isOnline,
    this.connectionCertainty = 'CONFIRMED_ONLINE',
    required this.deviceType,
    this.hostName,
    this.vendor,
    this.uptime,
    this.expiresAfter,
    this.lastSeen,
    this.age,
    required this.source,
    this.sources = const [],
  });

  bool get isAccessPoint => deviceType == 'ACCESS_POINT';
  bool get isConfirmedOnline => connectionCertainty == 'CONFIRMED_ONLINE';
  bool get isLeaseOnly => connectionCertainty == 'LEASE_ACTIVE';
  bool get isUnknown => deviceType == 'UNKNOWN' || deviceType == 'DEVICE';

  factory ConnectedDeviceModel.fromJson(Map<String, dynamic> json) {
    final rawOnline = json['isOnline'] == true;
    final rawStatus = json['status']?.toString() ?? 'unknown';

    // Parse connection certainty with robust fallback
    final rawCertainty = json['connectionCertainty']?.toString();
    final certainty = rawCertainty != null && rawCertainty.isNotEmpty
        ? rawCertainty
        : (rawOnline
            ? 'CONFIRMED_ONLINE'
            : (rawStatus.toLowerCase() == 'bound' || rawStatus.toLowerCase() == 'leased'
                ? 'LEASE_ACTIVE'
                : 'OFFLINE'));

    // Parse sources list
    final rawSources = json['sources'];
    final sourcesList = (rawSources is List)
        ? rawSources.map((e) => e.toString()).toList()
        : <String>[];

    final primarySource = json['source']?.toString().toUpperCase() ?? 'DHCP';
    if (sourcesList.isEmpty && primarySource.isNotEmpty) {
      sourcesList.add(primarySource);
    }

    return ConnectedDeviceModel(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'جهاز غير معروف',
      ipAddress: json['ipAddress']?.toString() ?? '',
      macAddress: json['macAddress']?.toString() ?? '',
      interfaceName: json['interface']?.toString(),
      status: rawStatus,
      isOnline: certainty == 'CONFIRMED_ONLINE',
      connectionCertainty: certainty,
      deviceType: json['deviceType']?.toString().toUpperCase() ?? 'UNKNOWN',
      hostName: json['hostName']?.toString(),
      vendor: json['vendor']?.toString(),
      uptime: json['uptime']?.toString(),
      expiresAfter: json['expiresAfter']?.toString(),
      lastSeen: json['lastSeen']?.toString(),
      age: json['age']?.toString(),
      source: primarySource,
      sources: sourcesList,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'ipAddress': ipAddress,
      'macAddress': macAddress,
      'interface': interfaceName,
      'status': status,
      'isOnline': isOnline,
      'connectionCertainty': connectionCertainty,
      'deviceType': deviceType,
      'hostName': hostName,
      'vendor': vendor,
      'uptime': uptime,
      'expiresAfter': expiresAfter,
      'lastSeen': lastSeen,
      'age': age,
      'source': source,
      'sources': sources,
    };
  }
}


