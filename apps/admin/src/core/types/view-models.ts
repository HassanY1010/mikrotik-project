export interface DeviceItem {
  id: string;
  name: string;
  host?: string;
  port?: number;
  apiPort?: number;
  restPort?: number;
  useSsl?: boolean;
  rosVersion?: string;
  connectionType?: string;
  status?: string;
  lastSeenAt?: string;
  username?: string;
  isLocked?: boolean;
  antiTetheringEnabled?: boolean;
  modelName?: string;
  cpuLoad?: number;
  memoryFree?: number;
  memoryTotal?: number;
  diskFree?: number;
  diskTotal?: number;
  uptime?: string;
}

export interface DiagnosticsData {
  cpuLoad: number;
  freeMemoryMb: number;
  totalMemoryMb: number;
  uptime: string;
  activeHotspotSessions: number;
  latencyMs?: number;
  boardName?: string;
  version?: string;
}

export interface HotspotProfileItem {
  id: string;
  name?: string;
  displayName?: string;
  price: number;
  validity?: string;
  sessionTimeout?: string;
  rateLimit?: string;
  sharedUsers?: number;
  deviceId?: string;
  device?: {
    name: string;
  };
  availableCards?: number;
}

export interface CardItem {
  id: string;
  serialNumber: string;
  username: string;
  clearPassword?: string;
  price: number;
  status: string;
  createdAt: string;
  profile?: {
    name?: string;
    displayName?: string;
    price?: number;
  };
  device?: {
    name: string;
  };
}

export interface SaleTransactionItem {
  id: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  customerPhone?: string;
  customerName?: string;
  createdAt: string;
  isRefunded: boolean;
  profileName?: string;
  cashierName?: string;
  deviceName?: string;
  cardUsername?: string;
  cardSerialNumber?: string;
  card?: {
    serialNumber: string;
    username: string;
    clearPassword?: string;
  };
}

export interface AuditLogItem {
  id: string;
  action: string;
  entity?: string;
  entityType?: string;
  entityId?: string;
  userName?: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  user?: {
    fullName?: string;
    email?: string;
  } | null;
}

export interface ShiftProfileBreakdown {
  profileName: string;
  count: number;
  totalAmount: number;
  total?: number;
}

export interface ShiftSummaryData {
  totalRevenue: number;
  totalSalesCount: number;
  totalTransactions?: number;
  grossRevenue?: number;
  totalRefunds?: number;
  refundedCount?: number;
  currency: string;
  profileBreakdown: ShiftProfileBreakdown[];
}

export interface DashboardData {
  kpis: {
    totalRevenue: number;
    availableCards: number;
    totalSoldCards: number;
    activeRouters: number;
    activeSessions: number;
    currency: string;
  };
  topProfiles: Array<{ name: string; count: number; revenue: number }>;
  recentSales: Array<{ invoice: string; profile: string; amount: number; time: string }>;
}

export interface TenantSettingsItem {
  name: string;
  slug: string;
  currency: string;
  contactEmail?: string;
  contactPhone?: string;
  subscription?: {
    plan: string;
    planNameAr?: string;
    maxRouters: number;
    maxCardsPerMonth: number | null;
    usedCards?: number;
    remainingCards?: number | null;
    isUnlimited?: boolean;
    cycleStart?: string | null;
    cycleEnd?: string | null;
    status: string;
    startsAt?: string | null;
    expiresAt: string | null;
  };
}

export interface UserItem {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  status: string;
  role?: {
    name: string;
  };
  createdAt?: string;
}

// =============================================================================
// PPPOE & BROADBAND VIEW MODELS
// =============================================================================

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
  accountsCount?: number;
  queuedCommandId?: string | null;
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
  status: 'ACTIVE' | 'DISABLED' | 'EXPIRED' | 'SUSPENDED';
  callerId?: string | null;
  staticIp?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  price: number;
  billingCycle: 'MONTHLY' | 'YEARLY';
  expiresAt?: string | null;
  notes?: string | null;
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
  syncError?: string | null;
  queuedCommandId?: string | null;
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

export interface AgentCommandStatusItem {
  id: string;
  operationId: string;
  deviceId: string;
  agentId: string;
  type: string;
  status: 'PENDING' | 'DISPATCHED' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
  payload: Record<string, any>;
  result?: Record<string, any> | null;
  errorMessage?: string | null;
  createdAt: string;
  dispatchedAt?: string | null;
  completedAt?: string | null;
  expiresAt: string;
}

export interface HotspotPortalConfigItem {
  id: string;
  tenantId: string;
  name: string;
  themePreset: 'MODERN_DARK' | 'STARLINK_CYAN' | 'SUNSET_ORANGE' | 'MINIMAL_LIGHT';
  networkName: string;
  title: string;
  subtitle: string;
  logoUrl?: string | null;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  cardColor: string;
  textColor: string;
  loginMethod: 'VOUCHER' | 'USER_PASS' | 'BOTH';
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


