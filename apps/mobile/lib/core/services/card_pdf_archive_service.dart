import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/card_pdf_archive_model.dart';
import '../network/api_client.dart';
import '../constants/api_endpoints.dart';

class CardPdfArchiveService {
  static const String _pendingQueueKey = 'pending_pdf_archive_queue';
  final ApiClient? _apiClient;
  ApiClient get apiClient => _apiClient!;

  CardPdfArchiveService({required ApiClient apiClient}) : _apiClient = apiClient;
  CardPdfArchiveService.mock() : _apiClient = null;

  /// Uploads a generated PDF file to the archive asynchronously.
  /// Automatically caches the PDF to disk locally before uploading,
  /// ensuring the file is never lost if network fails or the app is closed.
  Future<CardPdfArchiveModel?> uploadPdfArchive({
    required Uint8List pdfBytes,
    required String fileName,
    required int cardCount,
    String? templateType,
    String? networkName,
    String? profileName,
    String? batchId,
    Map<String, dynamic>? metadata,
  }) async {
    // 1. Immediately cache the PDF to local storage for offline resilience
    final safeBatch = (batchId ?? '${DateTime.now().millisecondsSinceEpoch}').replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_');
    final pendingId = 'pending_$safeBatch';
    String? localSavedPath;

    try {
      final cacheDir = await getApplicationDocumentsDirectory();
      final pdfDir = Directory('${cacheDir.path}/pdf_archive_cache');
      if (!await pdfDir.exists()) {
        await pdfDir.create(recursive: true);
      }
      final localFile = File('${pdfDir.path}/batch_$safeBatch.pdf');
      await localFile.writeAsBytes(pdfBytes, flush: true);
      localSavedPath = localFile.path;

      // Register in pending offline queue
      await _addPendingUpload(
        id: pendingId,
        filePath: localSavedPath,
        fileName: fileName,
        cardCount: cardCount,
        templateType: templateType,
        networkName: networkName,
        profileName: profileName,
        batchId: batchId,
        metadata: metadata,
      );
    } catch (saveErr) {
      debugPrint('Warning: Could not save local backup of PDF: $saveErr');
    }

    // 2. Attempt cloud upload to backend / Supabase Storage
    try {
      final formData = FormData.fromMap({
        'file': MultipartFile.fromBytes(
          pdfBytes,
          filename: fileName,
        ),
        'fileName': fileName,
        'cardCount': cardCount,
        if (templateType != null && templateType.isNotEmpty)
          'templateType': templateType,
        if (networkName != null && networkName.isNotEmpty)
          'networkName': networkName,
        if (profileName != null && profileName.isNotEmpty)
          'profileName': profileName,
        if (batchId != null && batchId.isNotEmpty)
          'batchId': batchId,
        if (metadata != null)
          'metadata': jsonEncode(metadata),
      });

      final response = await apiClient.dio.post(
        ApiEndpoints.cardPdfArchivesUpload,
        data: formData,
        options: Options(
          contentType: 'multipart/form-data',
          sendTimeout: const Duration(seconds: 45),
          receiveTimeout: const Duration(seconds: 45),
        ),
      );

      final raw = response.data;
      final payload = (raw is Map && raw['data'] != null) ? raw['data'] : raw;

      if (payload is Map<String, dynamic>) {
        debugPrint('Successfully archived PDF to cloud: $fileName (${pdfBytes.length} bytes)');
        // Upload succeeded: remove from pending queue
        await _removePendingUpload(pendingId);
        return CardPdfArchiveModel.fromJson(payload);
      }
      return null;
    } catch (e) {
      debugPrint('Failed to archive PDF to cloud (safely kept in local offline queue): $e');
      return null;
    }
  }

  /// Adds a pending item to local queue
  Future<void> _addPendingUpload({
    required String id,
    required String filePath,
    required String fileName,
    required int cardCount,
    String? templateType,
    String? networkName,
    String? profileName,
    String? batchId,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final list = await getPendingUploads();
      // Remove any existing with same id
      list.removeWhere((item) => item['id'] == id);
      list.insert(0, {
        'id': id,
        'filePath': filePath,
        'fileName': fileName,
        'cardCount': cardCount,
        'templateType': templateType,
        'networkName': networkName,
        'profileName': profileName,
        'batchId': batchId,
        'metadata': metadata,
        'createdAt': DateTime.now().toIso8601String(),
      });
      await prefs.setString(_pendingQueueKey, jsonEncode(list));
    } catch (e) {
      debugPrint('Error writing to pending queue: $e');
    }
  }

  /// Removes a pending item after successful cloud upload
  Future<void> _removePendingUpload(String id) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final list = await getPendingUploads();
      list.removeWhere((item) => item['id'] == id);
      await prefs.setString(_pendingQueueKey, jsonEncode(list));
    } catch (e) {
      debugPrint('Error removing from pending queue: $e');
    }
  }

  /// Retrieves list of pending offline uploads awaiting cloud synchronization
  Future<List<Map<String, dynamic>>> getPendingUploads() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_pendingQueueKey);
      if (raw == null || raw.isEmpty) return [];
      final List decoded = jsonDecode(raw);
      return decoded.map((e) => Map<String, dynamic>.from(e)).toList();
    } catch (_) {
      return [];
    }
  }

  /// Retries uploading a pending offline PDF archive to the cloud
  Future<bool> retryPendingUpload(Map<String, dynamic> item) async {
    final filePath = item['filePath'] as String?;
    if (filePath == null) return false;

    final file = File(filePath);
    if (!await file.exists()) {
      await _removePendingUpload(item['id'] as String);
      return false;
    }

    try {
      final bytes = await file.readAsBytes();
      final result = await uploadPdfArchive(
        pdfBytes: bytes,
        fileName: item['fileName'] as String? ?? 'Archive.pdf',
        cardCount: (item['cardCount'] as num?)?.toInt() ?? 0,
        templateType: item['templateType'] as String?,
        networkName: item['networkName'] as String?,
        profileName: item['profileName'] as String?,
        batchId: item['batchId'] as String?,
        metadata: item['metadata'] as Map<String, dynamic>?,
      );
      return result != null;
    } catch (e) {
      debugPrint('Retry upload failed: $e');
      return false;
    }
  }

  /// Deletes a pending offline archive and its cached file
  Future<void> deletePendingUpload(String id) async {
    try {
      final list = await getPendingUploads();
      final item = list.firstWhere((e) => e['id'] == id, orElse: () => {});
      if (item.isNotEmpty && item['filePath'] != null) {
        final file = File(item['filePath'] as String);
        if (await file.exists()) {
          await file.delete();
        }
      }
      await _removePendingUpload(id);
    } catch (e) {
      debugPrint('Error deleting pending upload: $e');
    }
  }

  /// Retrieves paginated list of archived PDF files with search and date filters.
  Future<Map<String, dynamic>> getArchives({
    String? search,
    DateTime? startDate,
    DateTime? endDate,
    bool sortAsc = false,
    int page = 1,
    int limit = 20,
  }) async {
    final queryParams = <String, dynamic>{
      'page': page,
      'limit': limit,
      'sort': sortAsc ? 'asc' : 'desc',
      if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
      if (startDate != null) 'startDate': startDate.toIso8601String(),
      if (endDate != null) 'endDate': endDate.toIso8601String(),
    };

    final response = await apiClient.get(
      ApiEndpoints.cardPdfArchives,
      queryParameters: queryParams,
    );

    final raw = response.data;
    final payload = (raw is Map && raw['data'] != null) ? raw['data'] : raw;

    final List<CardPdfArchiveModel> list = [];
    int total = 0;
    int totalPages = 1;

    if (payload is Map<String, dynamic>) {
      total = (payload['total'] is num) ? (payload['total'] as num).toInt() : 0;
      totalPages = (payload['totalPages'] is num) ? (payload['totalPages'] as num).toInt() : 1;
      final rawList = payload['data'];
      if (rawList is List) {
        for (final item in rawList) {
          if (item is Map<String, dynamic>) {
            list.add(CardPdfArchiveModel.fromJson(item));
          }
        }
      }
    } else if (payload is List) {
      for (final item in payload) {
        if (item is Map<String, dynamic>) {
          list.add(CardPdfArchiveModel.fromJson(item));
        }
      }
      total = list.length;
    }

    return {
      'data': list,
      'total': total,
      'page': page,
      'totalPages': totalPages,
    };
  }

  /// Retrieves single archive detail with a fresh signed URL.
  Future<CardPdfArchiveModel> getArchiveDetail(String id) async {
    final response = await apiClient.get(ApiEndpoints.cardPdfArchiveItem(id));
    final raw = response.data;
    final payload = (raw is Map && raw['data'] != null) ? raw['data'] : raw;
    return CardPdfArchiveModel.fromJson(payload as Map<String, dynamic>);
  }

  /// Downloads raw PDF bytes for viewing in viewer or sharing.
  Future<Uint8List> downloadArchivePdf(String id, {String? signedUrl}) async {
    // 1. If fresh signed URL is provided, download directly
    if (signedUrl != null && signedUrl.startsWith('http')) {
      try {
        final res = await Dio().get<List<int>>(
          signedUrl,
          options: Options(
            responseType: ResponseType.bytes,
            receiveTimeout: const Duration(seconds: 40),
          ),
        );
        if (res.data != null) {
          return Uint8List.fromList(res.data!);
        }
      } catch (e) {
        debugPrint('Direct signedUrl download failed, falling back to API proxy: $e');
      }
    }

    // 2. Fallback to API stream endpoint
    final response = await apiClient.dio.get<List<int>>(
      ApiEndpoints.cardPdfArchiveDownload(id),
      options: Options(
        responseType: ResponseType.bytes,
        receiveTimeout: const Duration(seconds: 40),
      ),
    );

    if (response.data != null) {
      return Uint8List.fromList(response.data!);
    }

    throw Exception('Failed to download archived PDF bytes');
  }

  /// Deletes an archived PDF record and its storage file.
  Future<bool> deleteArchive(String id) async {
    final response = await apiClient.dio.delete(ApiEndpoints.cardPdfArchiveItem(id));
    return response.statusCode == 200 || response.statusCode == 204;
  }
}
