import 'dart:async';
import 'package:dio/dio.dart';
import '../storage/local_storage.dart';
import '../constants/api_endpoints.dart';

class ApiClient {
  late final Dio dio;
  late final Dio _refreshDio;
  Dio get refreshDio => _refreshDio;
  final LocalStorage localStorage;

  /// Callback triggered when session is definitively expired/revoked and refresh failed
  void Function()? onSessionExpired;

  /// Singleton completer to serialize concurrent token refresh operations
  Completer<String?>? _refreshCompleter;

  ApiClient({required this.localStorage, this.onSessionExpired}) {
    final baseOptions = BaseOptions(
      baseUrl: localStorage.getBaseUrl(),
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 20),
      sendTimeout: const Duration(seconds: 20),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    );

    dio = Dio(baseOptions);
    // Separate instance for refresh calls to avoid recursion or interceptor loops
    _refreshDio = Dio(baseOptions);

    // Request & Response interceptor to inject tokens and handle 401 auto-refresh with retry
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          var base = localStorage.getBaseUrl().trim();
          if (!base.endsWith('/')) {
            base = '$base/';
          }
          options.baseUrl = base;

          // Prevent leading slash in path from overriding the baseUrl path segment (/api/v1)
          if (options.path.startsWith('/')) {
            options.path = options.path.substring(1);
          }

          final token = localStorage.getToken();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
        onError: (DioException error, handler) async {
          final statusCode = error.response?.statusCode;
          final path = error.requestOptions.path;

          // Only attempt refresh on 401 Unauthorized, excluding auth endpoints and already retried requests
          final isAuthEndpoint = path.contains('/auth/login') ||
              path.contains('/auth/register') ||
              path.contains('/auth/refresh');
          final isAlreadyRetried = error.requestOptions.extra['_isRetry'] == true;

          if (statusCode == 401 && !isAuthEndpoint && !isAlreadyRetried) {
            final newAccessToken = await _performTokenRefresh();

            if (newAccessToken != null && newAccessToken.isNotEmpty) {
              final options = error.requestOptions;
              options.headers['Authorization'] = 'Bearer $newAccessToken';
              options.extra['_isRetry'] = true;

              try {
                final response = await dio.fetch(options);
                return handler.resolve(response);
              } on DioException catch (retryErr) {
                return handler.next(retryErr);
              } catch (_) {
                return handler.next(error);
              }
            }
          }

          return handler.next(error);
        },
      ),
    );
  }

  /// Thread-safe singleton token refresh mechanism.
  /// If multiple requests fail with 401 concurrently, they all await the same refresh operation.
  Future<String?> _performTokenRefresh() async {
    if (_refreshCompleter != null && !_refreshCompleter!.isCompleted) {
      return _refreshCompleter!.future;
    }

    _refreshCompleter = Completer<String?>();

    final refreshToken = localStorage.getRefreshToken();
    if (refreshToken == null || refreshToken.trim().isEmpty) {
      _refreshCompleter!.complete(null);
      onSessionExpired?.call();
      return null;
    }

    try {
      var base = localStorage.getBaseUrl().trim();
      if (!base.endsWith('/')) {
        base = '$base/';
      }
      _refreshDio.options.baseUrl = base;

      final res = await _refreshDio.post(
        ApiEndpoints.refresh.startsWith('/')
            ? ApiEndpoints.refresh.substring(1)
            : ApiEndpoints.refresh,
        data: {'refreshToken': refreshToken.trim()},
      );

      final raw = res.data;
      final payload = (raw is Map && raw['data'] != null) ? raw['data'] : raw;

      if (payload is Map<String, dynamic>) {
        final newAccess = payload['accessToken'] as String?;
        final newRefresh = payload['refreshToken'] as String?;

        if (newAccess != null && newAccess.isNotEmpty) {
          await localStorage.setToken(newAccess);
          if (newRefresh != null && newRefresh.isNotEmpty) {
            await localStorage.setRefreshToken(newRefresh);
          }
          _refreshCompleter!.complete(newAccess);
          return newAccess;
        }
      }

      _refreshCompleter!.complete(null);
      return null;
    } catch (e) {
      if (e is DioException) {
        final code = e.response?.statusCode;
        // If refresh token is invalid, expired, or revoked (401/403)
        if (code == 401 || code == 403) {
          await localStorage.clearAuth();
          onSessionExpired?.call();
        }
      }
      _refreshCompleter!.complete(null);
      return null;
    }
  }

  /// Public method to preemptively refresh tokens or check session validity
  Future<bool> refreshTokenManually() async {
    final token = await _performTokenRefresh();
    return token != null && token.isNotEmpty;
  }

  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    return dio.get<T>(path, queryParameters: queryParameters);
  }

  Future<Response<T>> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
  }) async {
    return dio.post<T>(path, data: data, queryParameters: queryParameters);
  }

  Future<Response<T>> patch<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
  }) async {
    return dio.patch<T>(path, data: data, queryParameters: queryParameters);
  }

  Future<Response<T>> put<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
  }) async {
    return dio.put<T>(path, data: data, queryParameters: queryParameters);
  }

  Future<Response<T>> delete<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
  }) async {
    return dio.delete<T>(path, data: data, queryParameters: queryParameters);
  }
}

