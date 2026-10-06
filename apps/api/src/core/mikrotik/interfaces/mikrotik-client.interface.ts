export interface RouterResource {
  uptime: string;
  version: string;
  cpuLoad: number;
  freeMemory: number;
  totalMemory: number;
  freeHdd: number;
  totalHdd: number;
  boardName?: string;
  architecture?: string;
}

export interface HotspotProfileItem {
  id?: string;
  name: string;
  rateLimit?: string;
  sessionTimeout?: string;
  idleTimeout?: string;
  keepaliveTimeout?: string;
  sharedUsers?: number;
  addressPool?: string;
}

export interface HotspotUserItem {
  id?: string;
  name: string;
  password?: string;
  profile?: string;
  limitUptime?: string;
  limitBytesTotal?: number;
  comment?: string;
  disabled?: boolean;
}

export interface HotspotActiveSessionItem {
  id: string;
  user: string;
  address: string;
  macAddress: string;
  uptime: string;
  bytesIn: number;
  bytesOut: number;
  sessionId?: string;
}

export interface IMikrotikClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  ping(): Promise<boolean>;
  getSystemResource(): Promise<RouterResource>;
  listHotspotProfiles(): Promise<HotspotProfileItem[]>;
  createHotspotProfile(profile: HotspotProfileItem): Promise<string>;
  updateHotspotProfile(name: string, profile: Partial<HotspotProfileItem>): Promise<void>;
  deleteHotspotProfile(name: string): Promise<void>;
  listHotspotUsers(): Promise<HotspotUserItem[]>;
  createHotspotUser(user: HotspotUserItem): Promise<string>;
  updateHotspotUser(name: string, user: Partial<HotspotUserItem>): Promise<void>;
  disableHotspotUser(name: string): Promise<void>;
  enableHotspotUser(name: string): Promise<void>;
  deleteHotspotUser(name: string): Promise<void>;
  listActiveSessions(): Promise<HotspotActiveSessionItem[]>;
  removeActiveSession(sessionOrUserId: string): Promise<void>;
}
