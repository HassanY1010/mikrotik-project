import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../models/card_pdf_archive_model.dart';
import '../network/api_client.dart';
import '../constants/api_endpoints.dart';

class CardPdfArchiveService {
  final ApiClient? _apiClient;
  ApiClient get apiClient => _apiClient!;

  CardPdfArchiveService({required ApiClient apiClient}) : _apiClient = apiClient;
  CardPdfArchiveService.mock() : _apiClient = null;

  /// Uploads a generated PDF file to the archive asynchronously.
  /// Designed to never throw or break caller flow if network/server is unavailable.
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
        debugPrint('Successfully archived PDF: $fileName (${pdfBytes.length} bytes)');
        return CardPdfArchiveModel.fromJson(payload);
      }
      return null;
    } catch (e) {
      debugPrint('Failed to archive PDF in background: $e');
      return null;
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
