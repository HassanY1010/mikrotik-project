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
    maxRouters: number;
    maxCardsPerMonth: number;
    status: string;
    expiresAt: string;
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
