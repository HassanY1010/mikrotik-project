class CardPdfArchiveModel {
  final String id;
  final String tenantId;
  final String fileName;
  final String storagePath;
  final int fileSize;
  final int cardCount;
  final String? templateType;
  final String? networkName;
  final String? profileName;
  final String? batchId;
  final Map<String, dynamic>? metadata;
  final String? createdById;
  final DateTime createdAt;
  final DateTime? updatedAt;
  final String? signedUrl;

  const CardPdfArchiveModel({
    required this.id,
    required this.tenantId,
    required this.fileName,
    required this.storagePath,
    required this.fileSize,
    required this.cardCount,
    this.templateType,
    this.networkName,
    this.profileName,
    this.batchId,
    this.metadata,
    this.createdById,
    required this.createdAt,
    this.updatedAt,
    this.signedUrl,
  });

  factory CardPdfArchiveModel.fromJson(Map<String, dynamic> json) {
    DateTime parseDate(dynamic dateVal) {
      if (dateVal is DateTime) return dateVal;
      if (dateVal is String) {
        return DateTime.tryParse(dateVal) ?? DateTime.now();
      }
      return DateTime.now();
    }

    return CardPdfArchiveModel(
      id: json['id']?.toString() ?? '',
      tenantId: json['tenantId']?.toString() ?? '',
      fileName: json['fileName']?.toString() ?? 'Cards.pdf',
      storagePath: json['storagePath']?.toString() ?? '',
      fileSize: (json['fileSize'] is num) ? (json['fileSize'] as num).toInt() : 0,
      cardCount: (json['cardCount'] is num) ? (json['cardCount'] as num).toInt() : 0,
      templateType: json['templateType']?.toString(),
      networkName: json['networkName']?.toString(),
      profileName: json['profileName']?.toString(),
      batchId: json['batchId']?.toString(),
      metadata: json['metadata'] is Map ? Map<String, dynamic>.from(json['metadata'] as Map) : null,
      createdById: json['createdById']?.toString(),
      createdAt: parseDate(json['createdAt']),
      updatedAt: json['updatedAt'] != null ? parseDate(json['updatedAt']) : null,
      signedUrl: json['signedUrl']?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'tenantId': tenantId,
      'fileName': fileName,
      'storagePath': storagePath,
      'fileSize': fileSize,
      'cardCount': cardCount,
      'templateType': templateType,
      'networkName': networkName,
      'profileName': profileName,
      'batchId': batchId,
      'metadata': metadata,
      'createdById': createdById,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt?.toIso8601String(),
      'signedUrl': signedUrl,
    };
  }

  /// Formatted human-readable file size string (e.g. 245 KB or 1.8 MB)
  String get formattedFileSize {
    if (fileSize < 1024) {
      return '$fileSize بايت';
    } else if (fileSize < 1024 * 1024) {
      final kb = (fileSize / 1024).toStringAsFixed(1);
      return '$kb ك.ب';
    } else {
      final mb = (fileSize / (1024 * 1024)).toStringAsFixed(2);
      return '$mb م.ب';
    }
  }

  /// Formatted Arabic date string: YYYY/MM/DD
  String get formattedDate {
    final year = createdAt.year;
    final month = createdAt.month.toString().padLeft(2, '0');
    final day = createdAt.day.toString().padLeft(2, '0');
    return '$year/$month/$day';
  }

  /// Formatted Arabic 12-hour time string: HH:MM ص/م
  String get formattedTime {
    final hour24 = createdAt.hour;
    final minute = createdAt.minute.toString().padLeft(2, '0');
    final isPm = hour24 >= 12;
    final hour12 = hour24 == 0 ? 12 : (hour24 > 12 ? hour24 - 12 : hour24);
    final period = isPm ? 'م' : 'ص';
    return '$hour12:$minute $period';
  }

  CardPdfArchiveModel copyWith({
    String? id,
    String? tenantId,
    String? fileName,
    String? storagePath,
    int? fileSize,
    int? cardCount,
    String? templateType,
    String? networkName,
    String? profileName,
    String? batchId,
    Map<String, dynamic>? metadata,
    String? createdById,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? signedUrl,
  }) {
    return CardPdfArchiveModel(
      id: id ?? this.id,
      tenantId: tenantId ?? this.tenantId,
      fileName: fileName ?? this.fileName,
      storagePath: storagePath ?? this.storagePath,
      fileSize: fileSize ?? this.fileSize,
      cardCount: cardCount ?? this.cardCount,
      templateType: templateType ?? this.templateType,
      networkName: networkName ?? this.networkName,
      profileName: profileName ?? this.profileName,
      batchId: batchId ?? this.batchId,
      metadata: metadata ?? this.metadata,
      createdById: createdById ?? this.createdById,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      signedUrl: signedUrl ?? this.signedUrl,
    );
  }
}
