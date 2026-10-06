import 'package:dio/dio.dart';
import '../storage/local_storage.dart';

class ApiClient {
  late final Dio dio;
  final LocalStorage localStorage;

  ApiClient({required this.localStorage}) {
    dio = Dio(
      BaseOptions(
        baseUrl: localStorage.getBaseUrl(),
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 15),
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
          options.baseUrl = localStorage.getBaseUrl();
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
