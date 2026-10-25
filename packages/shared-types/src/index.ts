// =============================================================================
// Shared Types — MikroTik SaaS Platform
// =============================================================================
// This package contains TypeScript types, interfaces, and enums that are
// shared between the backend API, admin web app, and (via code generation)
// the mobile app.
// =============================================================================

// ---------- Enumerations ----------

/** Tenant account status */
export enum TenantStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  CANCELLED = 'CANCELLED',
  PENDING = 'PENDING',
}

/** User account status */
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
}

/** Platform-wide role names */
export enum RoleName {
  SUPER_ADMIN = 'SUPER_ADMIN',
  OWNER = 'OWNER',
  TENANT_ADMIN = 'TENANT_ADMIN',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  CASHIER = 'CASHIER',
  EMPLOYEE = 'EMPLOYEE',
}

/** Permission actions */
export enum PermissionAction {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  MANAGE = 'manage',
}

/** Permission resources */
export enum PermissionResource {
  TENANT = 'tenant',
  USER = 'user',
  ROLE = 'role',
  SUBSCRIPTION = 'subscription',
  PLAN = 'plan',
  MIKROTIK_DEVICE = 'mikrotik_device',
  HOTSPOT_PROFILE = 'hotspot_profile',
  HOTSPOT_USER = 'hotspot_user',
  CARD = 'card',
  CARD_GENERATION = 'card_generation',
  SALE = 'sale',
  TEMPLATE = 'template',
  PRINTER = 'printer',
  PRINT_JOB = 'print_job',
  REPORT = 'report',
  ANALYTICS = 'analytics',
  AUDIT_LOG = 'audit_log',
  SETTINGS = 'settings',
}

/** MikroTik device connection status */
export enum MikroTikDeviceStatus {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  TESTING = 'TESTING',
  AUTH_FAILED = 'AUTH_FAILED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  ROUTER_UNREACHABLE = 'ROUTER_UNREACHABLE',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  CONFIG_REQUIRED = 'CONFIG_REQUIRED',
  UNSUPPORTED_METHOD = 'UNSUPPORTED_METHOD',
  ERROR = 'ERROR',
  UNKNOWN = 'UNKNOWN',
}

/** MikroTik connection protocol */
export enum MikroTikProtocol {
  API = 'API',
  API_SSL = 'API_SSL',
  REST = 'REST',
}

/** RouterOS major version */
export enum RouterOSVersion {
  V6 = 'V6',
  V7 = 'V7',
  UNKNOWN = 'UNKNOWN',
}

/** Card lifecycle states */
export enum CardStatus {
  GENERATED = 'GENERATED',
  AVAILABLE = 'AVAILABLE',
  SOLD = 'SOLD',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  DISABLED = 'DISABLED',
  FAILED = 'FAILED',
}

/** Legal card state transitions */
export const CARD_TRANSITIONS: Readonly<Record<CardStatus, CardStatus[]>> = {
  [CardStatus.GENERATED]: [CardStatus.AVAILABLE, CardStatus.FAILED],
  [CardStatus.AVAILABLE]: [CardStatus.SOLD, CardStatus.DISABLED],
  [CardStatus.SOLD]: [CardStatus.ACTIVE],
  [CardStatus.ACTIVE]: [CardStatus.EXPIRED, CardStatus.DISABLED],
  [CardStatus.EXPIRED]: [],
  [CardStatus.DISABLED]: [],
  [CardStatus.FAILED]: [CardStatus.AVAILABLE], // retry/recovery
};

/** Card generation job status */
export enum CardGenerationJobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/** Subscription status */
export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  SUSPENDED = 'SUSPENDED',
  CANCELLED = 'CANCELLED',
  TRIAL = 'TRIAL',
}

/** Subscription billing period */
export enum BillingPeriod {
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

/** Subscription plan names */
export enum PlanName {
  BASIC = 'BASIC',
  PRO = 'PRO',
  BUSINESS = 'BUSINESS',
}

/** Sale status */
export enum SaleStatus {
  COMPLETED = 'COMPLETED',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
}

/** Print job status */
export enum PrintJobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/** Printer type */
export enum PrinterType {
  A4 = 'A4',
  THERMAL_58MM = 'THERMAL_58MM',
  THERMAL_80MM = 'THERMAL_80MM',
}

/** Printer connection type */
export enum PrinterConnectionType {
  USB = 'USB',
  BLUETOOTH = 'BLUETOOTH',
  WIFI = 'WIFI',
  NETWORK = 'NETWORK',
}

/** Offline sync operation states */
export enum SyncStatus {
  PENDING = 'PENDING',
  SYNCING = 'SYNCING',
  SYNCED = 'SYNCED',
  FAILED = 'FAILED',
  CONFLICT = 'CONFLICT',
}

/** Audit log action types */
export enum AuditAction {
  // Auth
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  LOGIN_FAILED = 'LOGIN_FAILED',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  PASSWORD_RESET_REQUESTED = 'PASSWORD_RESET_REQUESTED',
  TOKEN_REFRESHED = 'TOKEN_REFRESHED',
  // Users
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DELETED = 'USER_DELETED',
  USER_SUSPENDED = 'USER_SUSPENDED',
  USER_ACTIVATED = 'USER_ACTIVATED',
  // Roles & Permissions
  ROLE_ASSIGNED = 'ROLE_ASSIGNED',
  ROLE_REVOKED = 'ROLE_REVOKED',
  PERMISSION_CHANGED = 'PERMISSION_CHANGED',
  // Tenants
  TENANT_CREATED = 'TENANT_CREATED',
  TENANT_UPDATED = 'TENANT_UPDATED',
  TENANT_SUSPENDED = 'TENANT_SUSPENDED',
  // Subscriptions
  SUBSCRIPTION_ACTIVATED = 'SUBSCRIPTION_ACTIVATED',
  SUBSCRIPTION_CHANGED = 'SUBSCRIPTION_CHANGED',
  SUBSCRIPTION_SUSPENDED = 'SUBSCRIPTION_SUSPENDED',
  SUBSCRIPTION_CANCELLED = 'SUBSCRIPTION_CANCELLED',
  // MikroTik
  DEVICE_ADDED = 'DEVICE_ADDED',
  DEVICE_UPDATED = 'DEVICE_UPDATED',
  DEVICE_DELETED = 'DEVICE_DELETED',
  DEVICE_CONNECTION_TESTED = 'DEVICE_CONNECTION_TESTED',
  // Cards
  CARDS_GENERATED = 'CARDS_GENERATED',
  CARD_STATE_CHANGED = 'CARD_STATE_CHANGED',
  CARD_DISABLED = 'CARD_DISABLED',
  // Sales
  SALE_CREATED = 'SALE_CREATED',
  SALE_REFUNDED = 'SALE_REFUNDED',
  // Printing
  PRINT_JOB_CREATED = 'PRINT_JOB_CREATED',
  PRINT_JOB_REPRINTED = 'PRINT_JOB_REPRINTED',
  // Templates
  TEMPLATE_CREATED = 'TEMPLATE_CREATED',
  TEMPLATE_UPDATED = 'TEMPLATE_UPDATED',
  TEMPLATE_DELETED = 'TEMPLATE_DELETED',
  // Settings
  SETTINGS_UPDATED = 'SETTINGS_UPDATED',
}

// ---------- Common API Response types ----------

/** Standard paginated response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/** Pagination metadata */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/** Standard API success response */
export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
  requestId?: string;
  timestamp: string;
}

/** Standard API error response */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
  timestamp: string;
}

/** Pagination query parameters */
export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ---------- Health Check types ----------

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  uptime: number;
  checks: Record<string, HealthCheckResult>;
}

export interface HealthCheckResult {
  status: 'ok' | 'error';
  message?: string;
  details?: Record<string, unknown>;
  responseTimeMs?: number;
}

// ---------- Auth types ----------

export interface JwtPayload {
  sub: string;
  tenantId: string | null;
  email: string;
  roles: string[];
  permissions: string[];
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ---------- Dashboard / Analytics types ----------

export interface DashboardMetrics {
  tenantId: string;
  cards: {
    total: number;
    available: number;
    sold: number;
    active: number;
    expired: number;
    disabled: number;
  };
  sales: {
    total: number;
    todayTotal: number;
    thisMonthTotal: number;
    revenue: number;
    todayRevenue: number;
    thisMonthRevenue: number;
  };
  devices: {
    total: number;
    connected: number;
    disconnected: number;
    error: number;
  };
  jobs: {
    pendingGenerations: number;
    failedJobs: number;
  };
  updatedAt: string;
}

// ---------- Agent Remote Connectivity types ----------

export enum AgentStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  REVOKED = 'REVOKED',
}

export enum AgentCommandStatus {
  PENDING = 'PENDING',
  DISPATCHED = 'DISPATCHED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

export enum AgentCommandType {
  ROUTER_HEALTH = 'system.router.health',
  HOTSPOT_BATCH_ADD = 'hotspot.user.batch_add',
  HOTSPOT_USER_REMOVE = 'hotspot.user.remove',
  HOTSPOT_VERIFY_BATCH = 'hotspot.user.verify_batch',
  HOTSPOT_SESSION_LIST = 'hotspot.session.list',
  // PPPoE & Broadband Command Types
  PPPOE_PROFILE_SYNC = 'pppoe.profile.sync',
  PPPOE_SECRET_ADD = 'pppoe.secret.add',
  PPPOE_SECRET_UPDATE = 'pppoe.secret.update',
  PPPOE_SECRET_DISABLE = 'pppoe.secret.disable',
  PPPOE_SECRET_ENABLE = 'pppoe.secret.enable',
  PPPOE_SECRET_REMOVE = 'pppoe.secret.remove',
  PPPOE_SESSION_LIST = 'pppoe.session.list',
  PPPOE_SESSION_DISCONNECT = 'pppoe.session.disconnect',
  // Hotspot Captive Portal Designer & Publisher
  HOTSPOT_PORTAL_PUBLISH = 'hotspot.portal.publish',
}

// ---------- PPPoE / Broadband Domain Types ----------

export enum PppoeAccountStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
  EXPIRED = 'EXPIRED',
  SUSPENDED = 'SUSPENDED',
}

export interface PppoeProfileItem {
  id: string;
  tenantId: string;
  deviceId: string;
  name: string;
  rateLimit?: string | null;
  localAddress?: string | null;
  remoteAddress?: string | null;
  dnsServers?: string | null;
  onlyOne: boolean;
  price: number;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PppoeAccountItem {
  id: string;
  tenantId: string;
  deviceId: string;
  profileId: string;
  profileName?: string;
  username: string;
  status: PppoeAccountStatus;
  callerId?: string | null;
  staticIp?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  price: number;
  billingCycle: string;
  expiresAt?: string | null;
  notes?: string | null;
  syncStatus: string;
  syncError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PppoeActiveSessionItem {
  id: string;
  tenantId: string;
  deviceId: string;
  accountId?: string | null;
  username: string;
  ipAddress: string;
  macAddress?: string | null;
  uptimeSeconds: number;
  bytesIn: number;
  bytesOut: number;
  sessionId?: string | null;
  startedAt: string;
}

// ---------- PPPoE Agent Command Payloads ----------

export interface PppoeProfileSyncPayload {
  name: string;
  rateLimit?: string;
  localAddress?: string;
  remoteAddress?: string;
  dnsServers?: string;
  onlyOne?: boolean;
}

export interface PppoeSecretAddPayload {
  username: string;
  password?: string;
  profile: string;
  callerId?: string;
  remoteAddress?: string;
  comment?: string;
  disabled?: boolean;
}

export interface PppoeSecretUpdatePayload {
  username: string;
  password?: string;
  profile?: string;
  callerId?: string;
  remoteAddress?: string;
  comment?: string;
  disabled?: boolean;
}

export interface PppoeSecretStatusPayload {
  username: string;
  disconnectActive?: boolean;
}

export interface PppoeSecretRemovePayload {
  username: string;
  disconnectActive?: boolean;
}

export interface PppoeSessionDisconnectPayload {
  username?: string;
  sessionId?: string;
}

export interface PppoeBatchResult {
  total: number;
  createdCount: number;
  alreadyExistingCount: number;
  failedCount: number;
  errors?: Array<{ username: string; error: string }>;
}

// ---------- HotSpot Captive Portal Domain Types ----------

export enum HotspotPortalThemePreset {
  MODERN_DARK = 'MODERN_DARK',
  STARLINK_CYAN = 'STARLINK_CYAN',
  SUNSET_ORANGE = 'SUNSET_ORANGE',
  MINIMAL_LIGHT = 'MINIMAL_LIGHT',
}

export enum HotspotPortalLoginMethod {
  VOUCHER = 'VOUCHER',
  USER_PASS = 'USER_PASS',
  BOTH = 'BOTH',
}

export interface HotspotPortalConfig {
  id: string;
  tenantId: string;
  name: string;
  themePreset: HotspotPortalThemePreset;
  networkName: string;
  title: string;
  subtitle: string;
  logoUrl?: string | null;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  cardColor: string;
  textColor: string;
  loginMethod: HotspotPortalLoginMethod;
  showRemainingTime: boolean;
  contactPhone?: string | null;
  termsText?: string | null;
  footerText?: string | null;
  customCss?: string | null;
  isDefault: boolean;
  publishedDeviceId?: string | null;
  lastPublishedAt?: string | null;
  syncStatus: string;
  syncError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HotspotPortalFile {
  name: string;
  content: string;
  encoding?: 'utf-8' | 'base64';
}

export interface HotspotPortalPublishPayload {
  templateId?: string;
  directoryName: string; // e.g. "hotspot" or "hotspot-sudafi"
  files: HotspotPortalFile[];
  applyToProfile?: string; // e.g. "hsprof1" or undefined
  overwriteConfirmed?: boolean;
}

export interface HotspotPortalPublishResult {
  published: boolean;
  directory: string;
  stagingDirectory?: string;
  filesWritten: string[];
  filesVerified?: string[];
  profileUpdated?: string;
  originalProfileName?: string;
  originalHtmlDirectory?: string;
  rollbackSupported?: boolean;
  message?: string;
}

export interface HotspotProfileRollbackDto {
  profileName: string;
  htmlDirectory: string;
}

export interface HotspotInspectionResult {
  deviceId: string;
  deviceName: string;
  activeDirectory: string;
  hasFlashStorage: boolean;
  profiles: Array<{ name: string; htmlDirectory?: string }>;
  existingFilesCount: number;
  existingFiles: string[];
}


