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
  final int availableCards;

  HotspotProfileModel({
    required this.id,
    required this.name,
    this.displayName,
    required this.deviceId,
    this.deviceName,
    required this.price,
    this.validity,
    this.rateLimit,
    this.availableCards = 0,
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

    return HotspotProfileModel(
      id: json['id'] as String,
      name: rawName,
      displayName: friendlyName,
      deviceId: json['deviceId'] as String? ?? '',
      deviceName: json['device']?['name'] as String?,
      price: rawPrice > 0 ? rawPrice : 200.0,
      validity: json['validity'] as String? ?? json['sessionTimeout'] as String?,
      rateLimit: json['rateLimit'] as String?,
      availableCards: (json['availableCards'] as num?)?.toInt() ?? 0,
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
    'availableCards': availableCards,
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
  });

  factory CardModel.fromJson(Map<String, dynamic> json) {
    final profile = json['profile'] as Map<String, dynamic>?;
    final device = json['device'] as Map<String, dynamic>?;
    return CardModel(
      id: json['id'] as String? ?? '',
      serialNumber: json['serialNumber'] as String? ?? '',
      username: json['username'] as String? ?? '',
      clearPassword: json['clearPassword'] as String? ?? json['pinCode'] as String?,
      pinCode: json['pinCode'] as String?,
      price: (json['price'] is num) ? (json['price'] as num).toDouble() : (double.tryParse(json['price']?.toString() ?? '0') ?? 0.0),
      status: json['status'] as String? ?? 'AVAILABLE',
      profileId: profile?['id'] as String? ?? json['profileId'] as String?,
      profileName: profile?['displayName'] as String? ?? profile?['name'] as String? ?? json['profileName'] as String? ?? 'باقة هوتسبوت',
      deviceName: device?['name'] as String? ?? json['deviceName'] as String?,
      batchNumber: json['batchNumber'] as String?,
      invoiceNumber: json['invoiceNumber'] as String?,
      timeLimit: json['timeLimit'] as String?,
      rateLimit: profile?['rateLimit'] as String?,
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt'] as String) ?? DateTime.now() : DateTime.now(),
      soldAt: json['soldAt'] != null ? DateTime.tryParse(json['soldAt'] as String) : null,
    );
  }

  String get loginUrl => 'http://login.hotspot/login?username=$username&password=${clearPassword ?? pinCode ?? username}';
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
}

/// Hotspot Active Session model (Radar)
class ActiveSessionModel {
  final String id;
  final String user;
  final String address;
  final String macAddress;
  final String uptime;
  final int bytesIn;
  final int bytesOut;
  final String? sessionId;
  final String? deviceId;
  final String? deviceName;

  ActiveSessionModel({
    required this.id,
    required this.user,
    required this.address,
    required this.macAddress,
    required this.uptime,
    required this.bytesIn,
    required this.bytesOut,
    this.sessionId,
    this.deviceId,
    this.deviceName,
  });

  factory ActiveSessionModel.fromJson(Map<String, dynamic> json) {
    return ActiveSessionModel(
      id: json['id'] as String? ?? json['user'] as String? ?? '',
      user: json['user'] as String? ?? json['username'] as String? ?? 'مستخدم',
      address: json['address'] as String? ?? json['ipAddress'] as String? ?? '',
      macAddress: json['macAddress'] as String? ?? json['mac-address'] as String? ?? '',
      uptime: json['uptime'] as String? ?? '0s',
      bytesIn: int.tryParse(json['bytesIn']?.toString() ?? json['bytes-in']?.toString() ?? '0') ?? 0,
      bytesOut: int.tryParse(json['bytesOut']?.toString() ?? json['bytes-out']?.toString() ?? '0') ?? 0,
      sessionId: json['sessionId'] as String?,
      deviceId: json['deviceId'] as String?,
      deviceName: json['deviceName'] as String?,
    );
  }

  double get totalMb => ((bytesIn + bytesOut) / (1024 * 1024));
}

/// Card print template model
class CardTemplateModel {
  final String id;
  final String name;
  final String themePreset;
  final String primaryColor;
  final String accentColor;
  final bool isDefault;

  CardTemplateModel({
    required this.id,
    required this.name,
    this.themePreset = 'CLASSIC',
    this.primaryColor = '#1E3A8A',
    this.accentColor = '#10B981',
    this.isDefault = false,
  });

  factory CardTemplateModel.fromJson(Map<String, dynamic> json) {
    return CardTemplateModel(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'قالب الكرت',
      themePreset: json['themePreset'] as String? ?? 'CLASSIC',
      primaryColor: json['primaryColor'] as String? ?? '#1E3A8A',
      accentColor: json['accentColor'] as String? ?? '#10B981',
      isDefault: json['isDefault'] as bool? ?? false,
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

    final todayRev = double.tryParse(summary['todayRevenue']?.toString() ?? '0') ?? 0.0;
    final weekRev = double.tryParse(summary['weekRevenue']?.toString() ?? '0') ?? 0.0;
    final monthRev = double.tryParse(summary['monthRevenue']?.toString() ?? '0') ?? 0.0;
    final allTimeRev = double.tryParse(summary['allTimeRevenue']?.toString() ?? '0') ?? 0.0;

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

