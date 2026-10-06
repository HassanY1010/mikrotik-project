export interface DeviceItem {
  id: string;
  name: string;
  host?: string;
  port?: number;
  rosVersion?: string;
  connectionType?: string;
  status?: string;
  lastSeenAt?: string;
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
  entityType: string;
  entityId: string;
  ipAddress?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
  user?: {
    fullName: string;
    email: string;
  };
}

export interface ShiftProfileBreakdown {
  profileName: string;
  count: number;
  totalAmount: number;
}

export interface ShiftSummaryData {
  totalRevenue: number;
  totalSalesCount: number;
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
