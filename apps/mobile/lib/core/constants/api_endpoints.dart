class ApiEndpoints {
  // Default base URL (Android emulator: 10.0.2.2, Localhost/Desktop: 127.0.0.1)
  static const String defaultBaseUrl = 'http://10.0.2.2:3000/api/v1';

  // Auth endpoints
  static const String login = '/auth/login';
  static const String profile = '/auth/profile';

  // Sync endpoints
  static const String syncPush = '/sync/push';
  static const String syncPull = '/sync/pull';
  static const String syncReserveCards = '/sync/reserve-cards';

  // Sales endpoints
  static const String salesCheckout = '/sales/checkout';
  static const String shiftSummary = '/sales/shift-summary';
  static const String dailyReport = '/sales/daily-report';

  // Hotspot profiles endpoint
  static const String hotspotProfiles = '/hotspot/profiles';

  // Devices endpoint
  static const String devices = '/devices';
}
