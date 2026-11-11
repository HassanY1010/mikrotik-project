import type {
  RouterBackupItem,
  RouterBridgeItem,
  RouterBridgePortItem,
  RouterDhcpClientItem,
  RouterDhcpNetworkItem,
  RouterDhcpServerItem,
  RouterDnsConfigItem,
  RouterHotspotServerItem,
  RouterHotspotServerProfileItem,
  RouterInterfaceItem,
  RouterIpAddressItem,
  RouterIpPoolItem,
  RouterNatRuleItem,
  RouterPackageItem,
  RouterPppoeClientItem,
  RouterBondingItem,
  RouterQueueTypeItem,
  RouterResource,
  RouterRouteItem,
  RouterSchedulerItem,
  RouterVlanItem,
  RouterWifiInterfaceItem,
  RouterWirelessInterfaceItem,
  RouterboardInfo,
  HotspotProfileItem,
} from '../../../core/mikrotik/interfaces/mikrotik-client.interface';

export interface DiscoveryCompletenessReport {
  isComplete: boolean;
  failedCoreQueries: string[];
  failedOptionalQueries: string[];
  warnings: string[];
}

export type RouterOsMajorFamily = 'ROS6' | 'ROS7' | 'UNKNOWN';
export type WirelessStackType = 'LEGACY_WIRELESS' | 'WIFIWAVE2' | 'WIFI_QCOM' | 'NONE';
export type NtpStackType = 'SNTP_V6' | 'NTP_PKG_V6' | 'NTP_V7' | 'NONE';

export type ProvisioningStageId =
  | 'WAN'
  | 'LAN_BRIDGE'
  | 'IP_ADDRESSING'
  | 'DHCP'
  | 'DNS'
  | 'FIREWALL'
  | 'NAT'
  | 'WIRELESS_WIFI'
  | 'HOTSPOT'
  | 'USER_PROFILES'
  | 'QUEUES'
  | 'SCHEDULER_MONITORING';

export interface DiscoveredDeviceMetadata {
  deviceId: string;
  deviceName: string;
  host: string;
  boardName: string;
  model: string;
  version: string;
  majorVersion: number;
  minorVersion: number;
  osFamily: RouterOsMajorFamily;
  architecture: string;
  platform: string;
  identity: string;
  uptime: string;
  cpuLoad: number;
  freeMemoryBytes: number;
  totalMemoryBytes: number;
  freeHddBytes: number;
  totalHddBytes: number;
  serialNumber?: string;
  currentFirmware?: string;
  factorySoftware?: string;
}

export type InferredInterfaceRole = 'WAN' | 'LAN' | 'MANAGEMENT' | 'UNUSED' | 'AMBIGUOUS';

export interface InterfaceRoleAssessment {
  name: string;
  type: string;
  enabled: boolean;
  running: boolean;
  hasIp: boolean;
  ipAddresses: string[];
  bridged: boolean;
  bridgeName?: string;
  role: InferredInterfaceRole;
  confidence: 'CONFIRMED' | 'INFERRED' | 'AMBIGUOUS';
  isWanCandidate: boolean;
  isLanCandidate: boolean;
  isManagementPath: boolean;
  hasExistingConfig: boolean;
  reasons: string[];
}

export interface RouterCapabilities {
  osFamily: RouterOsMajorFamily;
  version: string;
  majorVersion: number;
  minorVersion: number;
  boardName: string;
  model: string;
  architecture: string;
  supportsHotspot: boolean;
  wirelessStack: WirelessStackType;
  supportsWireless: boolean;
  supportsWifi: boolean;
  wirelessInterfaces: Array<{ name: string; defaultName?: string; ssid?: string; disabled: boolean }>;
  wifiInterfaces: Array<{ name: string; defaultName?: string; ssid?: string; disabled: boolean }>;
  ntpStack: NtpStackType;
  supportsNtpServersTable: boolean;
  supportsQueueTypes: boolean;
  supportsScheduler: boolean;
  supportsNetwatch: boolean;
  supportsRscExport: boolean;
  supportsBinaryBackup: boolean;
  supportsRestApi: boolean;
  supportsSafeModeInCurrentSession: boolean;
  safeModeReason: string;
  hasEnoughDiskForBackup: boolean;
  freeHddBytes: number;
  ethernetPorts: string[];
  sfpPorts: string[];
  totalPhysicalPorts: number;
  installedPackages: Array<{ name: string; version?: string; disabled: boolean }>;
  isCompatible: boolean;
  compatibilityStatus: 'COMPATIBLE' | 'COMPATIBLE_WITH_LIMITATIONS' | 'INCOMPATIBLE';
  compatibilitySummary: string;
  warnings: string[];
}

export interface FullRouterDiscoveryReport {
  device: DiscoveredDeviceMetadata;
  capabilities: RouterCapabilities;
  interfacesAssessment: InterfaceRoleAssessment[];
  resource: RouterResource;
  routerboard: RouterboardInfo;
  packages: RouterPackageItem[];
  interfaces: RouterInterfaceItem[];
  bridges: RouterBridgeItem[];
  bridgePorts: RouterBridgePortItem[];
  vlans: RouterVlanItem[];
  wirelessInterfaces: RouterWirelessInterfaceItem[];
  wifiInterfaces: RouterWifiInterfaceItem[];
  ipAddresses: RouterIpAddressItem[];
  pools: RouterIpPoolItem[];
  dhcpClients: RouterDhcpClientItem[];
  dhcpServers: RouterDhcpServerItem[];
  dhcpNetworks: RouterDhcpNetworkItem[];
  dnsConfig: RouterDnsConfigItem;
  natRules: RouterNatRuleItem[];
  mangleRules: Array<{ id?: string; chain?: string; action?: string; outInterface?: string; comment?: string; disabled?: boolean }>;
  filterRules: Array<{ id?: string; chain?: string; action?: string; inInterface?: string; protocol?: string; dstPort?: string; comment?: string; disabled?: boolean }>;
  routes: RouterRouteItem[];
  bondingInterfaces?: RouterBondingItem[];
  pppoeClients?: RouterPppoeClientItem[];
  hotspotServers: RouterHotspotServerItem[];
  hotspotServerProfiles: RouterHotspotServerProfileItem[];
  hotspotUserProfiles: HotspotProfileItem[];
  queueTypes: RouterQueueTypeItem[];
  schedulers: RouterSchedulerItem[];
  existingBackups: RouterBackupItem[];
  discoveryCompleteness?: DiscoveryCompletenessReport;
  wanRoleAmbiguous: boolean;
  suggestedWanInterface?: string;
  suggestedLanInterfaces: string[];
  managementInterface?: string;
  discoveredAt: string;
  snapshotHash: string;
}

export interface PlannedCommandSpec {
  order: number;
  stage: ProvisioningStageId;
  description: string;
  commandMasked: string;
  executionWords: string[];
  cliPreview: string;
  idempotent: boolean;
  safeToRetry: boolean;
  checkExistingStrategy?: string;
  rollbackWords?: string[];
  createdResourceType?: string;
}

export interface PlannedStageDiffSummary {
  currentItems: string[];
  addedItems: string[];
  changedItems: string[];
  skippedItems: string[];
}

export interface PlannedProvisioningStage {
  stepOrder: number;
  stage: ProvisioningStageId;
  title: string;
  description: string;
  status: 'PLANNED' | 'SKIPPED_UNSUPPORTED' | 'SKIPPED_EXISTING';
  skipReason?: string;
  dependsOn: ProvisioningStageId[];
  preconditions: string[];
  requiredCapabilities: string[];
  expectedResult: string;
  validationRule: string;
  rollbackAction: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  diffSummary: PlannedStageDiffSummary;
  commands: PlannedCommandSpec[];
}

export interface ManagementSafetyReport {
  isDetermined: boolean;
  isSevered: boolean;
  mgmtIp: string;
  mgmtInterface?: string;
  mgmtPhysicalPorts: string[];
  conflictType?: string;
  blockedReasons: string[];
  warnings: string[];
}

export interface AutoProvisioningPlan {
  planId: string;
  planHash: string;
  deviceId: string;
  deviceName: string;
  template: string;
  rosVersion: string;
  osFamily: RouterOsMajorFamily;
  boardName: string;
  model: string;
  capabilities: RouterCapabilities;
  managementSafety: ManagementSafetyReport;
  wanConfirmationRequired: boolean;
  wanConfirmationReasons: string[];
  diffOverview: {
    currentSettings: string[];
    newSettings: string[];
    addedItems: string[];
    changedItems: string[];
    skippedItems: string[];
    riskNotes: string[];
  };
  stages: PlannedProvisioningStage[];
  totalPlannedCommands: number;
  canProceed: boolean;
  blockedReasons: string[];
  warnings: Array<{ code: string; severity: 'INFO' | 'WARNING' | 'CRITICAL'; message: string; suggestedAction?: string }>;
  requiresBackup: boolean;
  createdAt: string;
  planToken?: {
    tenantId: string;
    deviceId: string;
    sessionId: string;
    nonce: string;
    planHash: string;
    snapshotHash: string;
    issuedAt: string;
    expiresAt: string;
    canonicalPayload: string;
    signature: string;
    publicKey: string;
  };
}
