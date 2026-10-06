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
