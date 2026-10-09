class ApiEndpoints {
  // Default base URL (Cloud Render API)
  static const String defaultBaseUrl = 'https://mikrotik-api-yn0e.onrender.com/api/v1';

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
  static const String hotspotSessions = '/hotspot/sessions';

  // Devices endpoint
  static const String devices = '/devices';
  static String deviceEmergencyLock(String id) => '/devices/$id/emergency-lock';
  static String deviceAntiTethering(String id) => '/devices/$id/anti-tethering';
  static String deviceTest(String id) => '/devices/$id/test';

  // Hotspot
  static String hotspotKick(String sessionId) => '/hotspot/sessions/$sessionId/kick';

  // Cards & Batch Studio
  static const String cards = '/cards';
  static String cardStatus(String id) => '/cards/$id/status';
  static const String cardBatches = '/cards/batches';
  static const String cardTemplates = '/card-templates';

  // Analytics & Reports
  static const String analyticsDashboard = '/analytics/dashboard';
  static const String financialReport = '/analytics/financial-report';

  // Cloud Wallet
  static const String wallet = '/tenants/current/wallet';
  static const String walletRecharge = '/tenants/current/wallet/recharge';
  static const String walletTransactions = '/tenants/current/wallet/transactions';
  static const String walletSettings = '/tenants/current/wallet/settings';
  static const String walletRedeemPoints = '/tenants/current/wallet/redeem-points';
}
