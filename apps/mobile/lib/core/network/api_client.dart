import 'package:dio/dio.dart';
import '../storage/local_storage.dart';

class ApiClient {
  late final Dio dio;
  final LocalStorage localStorage;

  ApiClient({required this.localStorage}) {
    dio = Dio(
      BaseOptions(
        baseUrl: localStorage.getBaseUrl(),
        connectTimeout: const Duration(seconds: 60),
        receiveTimeout: const Duration(seconds: 60),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    // Request interceptor to inject dynamic baseUrl and Auth Bearer token
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
        onError: (DioException error, handler) {
          return handler.next(error);
        },
      ),
    );
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
}
