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
  platform?: string;
  model?: string;
  factorySoftware?: string;
}

export interface RouterboardInfo {
  model?: string;
  serialNumber?: string;
  firmwareType?: string;
  currentFirmware?: string;
  upgradeFirmware?: string;
  factoryFirmware?: string;
}

export interface RouterPackageItem {
  id?: string;
  name: string;
  version?: string;
  disabled?: boolean;
  scheduled?: string;
}

export interface RouterVlanItem {
  id?: string;
  name: string;
  vlanId: number;
  interface: string;
  disabled?: boolean;
  running?: boolean;
  comment?: string;
}

export interface RouterWirelessInterfaceItem {
  id?: string;
  name: string;
  defaultName?: string;
  ssid?: string;
  mode?: string;
  band?: string;
  frequency?: string;
  securityProfile?: string;
  wpsMode?: string;
  country?: string;
  disabled?: boolean;
  running?: boolean;
  comment?: string;
}

export interface RouterWifiInterfaceItem {
  id?: string;
  name: string;
  defaultName?: string;
  ssid?: string;
  mode?: string;
  country?: string;
  securityAuthenticationTypes?: string;
  disabled?: boolean;
  running?: boolean;
  masterInterface?: string;
  comment?: string;
}

export interface RouterIpPoolItem {
  id?: string;
  name: string;
  ranges: string;
  nextPool?: string;
  comment?: string;
}

export interface RouterDhcpNetworkItem {
  id?: string;
  address: string;
  gateway?: string;
  dnsServer?: string;
  domain?: string;
  comment?: string;
}

export interface RouterDnsConfigItem {
  servers?: string[];
  dynamicServers?: string[];
  allowRemoteRequests?: boolean;
  cacheSize?: number;
}

export interface RouterHotspotServerProfileItem {
  id?: string;
  name: string;
  hotspotAddress?: string;
  dnsName?: string;
  htmlDirectory?: string;
  loginBy?: string;
  httpCookieLifetime?: string;
  useRadius?: boolean;
  isDefault?: boolean;
}

export interface RouterQueueTypeItem {
  id?: string;
  name: string;
  kind: string;
  isDefault?: boolean;
}

export interface RouterSchedulerItem {
  id?: string;
  name: string;
  interval?: string;
  startDate?: string;
  startTime?: string;
  onEvent?: string;
  disabled?: boolean;
  comment?: string;
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
  uptime?: string;
  bytesIn?: number;
  bytesOut?: number;
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
  server?: string;
  loginBy?: string;
  sessionTimeLeft?: string;
  idleTime?: string;
  limitBytesTotal?: number;
}

export interface RouterBackupItem {
  name: string;
  size?: number;
  type?: string;
  creationTime?: string;
}

export interface RouterInterfaceItem {
  id?: string;
  name: string;
  type: string;
  running?: boolean;
  disabled?: boolean;
  macAddress?: string;
  comment?: string;
  mtu?: number;
}

export interface RouterBridgeItem {
  id?: string;
  name: string;
  disabled?: boolean;
  comment?: string;
}

export interface RouterBridgePortItem {
  id?: string;
  bridge: string;
  interface: string;
  horizon?: number;
  disabled?: boolean;
  comment?: string;
}

export interface RouterIpAddressItem {
  id?: string;
  address: string;
  network?: string;
  interface: string;
  disabled?: boolean;
  comment?: string;
  dynamic?: boolean | string;
}

export interface RouterDhcpClientItem {
  id?: string;
  interface: string;
  status?: string;
  address?: string;
  gateway?: string;
  disabled?: boolean;
  addDefaultRoute?: boolean;
  usePeerDns?: boolean;
  comment?: string;
}

export interface RouterDhcpServerItem {
  id?: string;
  name: string;
  interface: string;
  addressPool?: string;
  disabled?: boolean;
  comment?: string;
}

export interface RouterNatRuleItem {
  id?: string;
  chain: string;
  action: string;
  outInterface?: string;
  protocol?: string;
  dstPort?: string;
  toPorts?: string;
  disabled?: boolean;
  comment?: string;
}

export interface RouterRouteItem {
  id?: string;
  dstAddress: string;
  gateway?: string;
  gatewayStatus?: string;
  immediateGw?: string;
  distance?: number;
  routingTable?: string;
  active?: boolean;
  disabled?: boolean;
  comment?: string;
  dynamic?: boolean;
}

export interface RouterBondingItem {
  id?: string;
  name: string;
  slaves: string[];
  mode?: string;
  disabled?: boolean;
  running?: boolean;
  comment?: string;
}

export interface RouterPppoeClientItem {
  id?: string;
  name: string;
  interface: string;
  disabled?: boolean;
  running?: boolean;
  addDefaultRoute?: boolean;
  comment?: string;
}

export interface RouterHotspotServerItem {
  id?: string;
  name: string;
  interface: string;
  profile?: string;
  addressPool?: string;
  disabled?: boolean;
  invalid?: boolean;
  comment?: string;
}

export interface RouterPingResult {
  host: string;
  packetsSent: number;
  packetsReceived: number;
  packetLossPercent: number;
  avgRttMs?: number;
  isReachable: boolean;
}

export interface RouterDhcpLeaseItem {
  id?: string;
  address: string;
  macAddress: string;
  hostName?: string;
  server?: string;
  status?: string;
  expiresAfter?: string;
  lastSeen?: string;
  activeAddress?: string;
  activeMacAddress?: string;
  comment?: string;
  disabled?: boolean;
  dynamic?: boolean;
}

export interface RouterArpItem {
  id?: string;
  address: string;
  macAddress: string;
  interface?: string;
  complete?: boolean;
  disabled?: boolean;
  dynamic?: boolean;
  comment?: string;
}

export interface RouterNeighborItem {
  id?: string;
  interface?: string;
  address?: string;
  macAddress?: string;
  identity?: string;
  platform?: string;
  version?: string;
  board?: string;
  uptime?: string;
  age?: string;
}

export interface ConnectedDeviceItem {
  id: string;
  name: string;
  ipAddress: string;
  macAddress: string;
  interface?: string;
  status: string;
  isOnline: boolean;
  connectionCertainty: 'CONFIRMED_ONLINE' | 'LEASE_ACTIVE' | 'OFFLINE';
  deviceType: 'ACCESS_POINT' | 'PHONE' | 'COMPUTER' | 'ROUTER' | 'UNKNOWN';
  hostName?: string;
  vendor?: string;
  uptime?: string;
  expiresAfter?: string;
  lastSeen?: string;
  age?: string;
  source: 'DHCP' | 'ARP' | 'NEIGHBOR';
  sources: Array<'DHCP' | 'ARP' | 'NEIGHBOR'>;
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
  reboot?(): Promise<void>;
  setAntiTethering?(enabled: boolean): Promise<void>;
  setEmergencyLock?(locked: boolean): Promise<void>;
  createBackup?(
    name?: string,
    password?: string,
  ): Promise<{ filename: string; size?: number; creationTime?: string }>;
  listBackups?(): Promise<RouterBackupItem[]>;
  downloadBackup?(filename: string): Promise<Buffer>;
  restoreBackup?(
    filename: string,
    password?: string,
  ): Promise<{ success: boolean; message: string; rebootTriggered: boolean }>;
  listInterfaces?(): Promise<RouterInterfaceItem[]>;
  listBridges?(): Promise<RouterBridgeItem[]>;
  listBridgePorts?(): Promise<RouterBridgePortItem[]>;
  listIpAddresses?(): Promise<RouterIpAddressItem[]>;
  listDhcpClients?(): Promise<RouterDhcpClientItem[]>;
  listDhcpServers?(): Promise<RouterDhcpServerItem[]>;
  listDhcpLeases?(): Promise<RouterDhcpLeaseItem[]>;
  listArpTable?(): Promise<RouterArpItem[]>;
  listNeighbors?(): Promise<RouterNeighborItem[]>;
  listNatRules?(): Promise<RouterNatRuleItem[]>;
  listMangleRules?(): Promise<Array<{ id?: string; chain?: string; action?: string; outInterface?: string; comment?: string; disabled?: boolean }>>;
  listFilterRules?(): Promise<Array<{ id?: string; chain?: string; action?: string; inInterface?: string; protocol?: string; dstPort?: string; comment?: string; disabled?: boolean }>>;
  listRoutes?(): Promise<RouterRouteItem[]>;
  listBondingInterfaces?(): Promise<RouterBondingItem[]>;
  listPppoeClients?(): Promise<RouterPppoeClientItem[]>;
  fetchFileFromUrl?(url: string, dstPath: string): Promise<{ filename: string }>;
  listHotspotServers?(): Promise<RouterHotspotServerItem[]>;
  pingHost?(host: string, count?: number): Promise<RouterPingResult>;
  runRawCommand?(words: string[]): Promise<any>;
  getSystemIdentity?(): Promise<string>;
  getRouterboardInfo?(): Promise<RouterboardInfo>;
  listPackages?(): Promise<RouterPackageItem[]>;
  listVlans?(): Promise<RouterVlanItem[]>;
  listWirelessInterfaces?(): Promise<RouterWirelessInterfaceItem[]>;
  listWifiInterfaces?(): Promise<RouterWifiInterfaceItem[]>;
  listPools?(): Promise<RouterIpPoolItem[]>;
  listDhcpNetworks?(): Promise<RouterDhcpNetworkItem[]>;
  getDnsConfig?(): Promise<RouterDnsConfigItem>;
  listHotspotServerProfiles?(): Promise<RouterHotspotServerProfileItem[]>;
  listQueueTypes?(): Promise<RouterQueueTypeItem[]>;
  listSchedulers?(): Promise<RouterSchedulerItem[]>;
  listFiles?(): Promise<RouterBackupItem[]>;
  createRscExport?(
    name?: string,
    redactSensitive?: boolean,
  ): Promise<{ filename: string; size?: number; creationTime?: string }>;
  downloadFile?(filename: string): Promise<Buffer>;
}

