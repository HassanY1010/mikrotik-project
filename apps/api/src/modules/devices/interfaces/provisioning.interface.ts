import {
  RouterInterfaceItem,
  RouterBridgeItem,
  RouterBridgePortItem,
  RouterIpAddressItem,
  RouterDhcpClientItem,
  RouterDhcpServerItem,
  RouterNatRuleItem,
  RouterRouteItem,
  RouterHotspotServerItem,
  RouterResource,
} from '../../../core/mikrotik/interfaces/mikrotik-client.interface';

export type ProvisioningTemplate = 'CLEAN_SETUP' | 'HOTSPOT_ON_EXISTING' | 'CUSTOM';
export type WanConnectionMode = 'DHCP' | 'PPPOE' | 'STATIC';

export interface WanConfig {
  interface: string;
  mode: WanConnectionMode;
  pppoeUser?: string;
  pppoePassword?: string;
  staticIp?: string; // e.g. 192.168.1.50/24
  staticGateway?: string; // e.g. 192.168.1.1
  staticDns?: string[]; // e.g. ['8.8.8.8', '1.1.1.1']
  enableNat?: boolean; // defaults to true
}

export interface LanConfig {
  bridgeName?: string; // e.g. bridge-hotspot
  memberInterfaces: string[]; // e.g. ['ether2', 'ether3', 'ether4', 'ether5']
  gatewayIp: string; // e.g. 10.5.50.1/24
  poolRange?: string; // e.g. 10.5.50.10-10.5.50.254
  dhcpLeaseTime?: string; // e.g. 1h
  dnsServers?: string[]; // e.g. ['10.5.50.1', '8.8.8.8']
}

export interface HotspotServerConfig {
  serverName?: string; // e.g. hs-sudafi
  profileName?: string; // e.g. hsp-sudafi
  dnsName?: string; // e.g. login.sudafi.net
  htmlDirectory?: string; // e.g. hotspot
  loginBy?: string; // e.g. http-chap,http-pap
  defaultRateLimit?: string; // e.g. 2M/5M
  defaultSessionTimeout?: string; // e.g. 1d
}

export interface RouterDiscoverySnapshot {
  resource: RouterResource;
  interfaces: RouterInterfaceItem[];
  bridges: RouterBridgeItem[];
  bridgePorts: RouterBridgePortItem[];
  ipAddresses: RouterIpAddressItem[];
  dhcpClients: RouterDhcpClientItem[];
  dhcpServers: RouterDhcpServerItem[];
  natRules: RouterNatRuleItem[];
  mangleRules?: Array<{ id?: string; chain?: string; action?: string; comment?: string; disabled?: boolean }>;
  filterRules?: Array<{ id?: string; chain?: string; action?: string; comment?: string; disabled?: boolean }>;
  hotspotUserProfiles?: Array<{ id?: string; name: string; sharedUsers?: number; rateLimit?: string }>;
  routes: RouterRouteItem[];
  hotspotServers: RouterHotspotServerItem[];
}

export interface ProvisioningConflict {
  resource: string;
  existingValue: string;
  proposedValue: string;
  details: string;
}

export interface ProvisioningWarning {
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  suggestedAction?: string;
}

export interface PlannedProvisioningStep {
  id: string;
  stage: string;
  title: string;
  description: string;
}

export interface SecurityPoliciesConfig {
  antiTethering?: boolean; // TTL Lock (new-ttl=1 on client downstream)
  clientIsolation?: boolean; // Bridge port horizon=1 (L2 isolation)
  protectManagementAccess?: boolean; // Drop Hotspot port 22,23,8291,8728,8729
  forceRouterDns?: boolean; // Redirect port 53 to router
  enforceSingleDevice?: boolean; // shared-users=1 + mac-cookie
  blockUnauthenticatedBypass?: boolean; // Drop unauthorized forward bypass
}

export interface SecurityPolicyReportItem {
  id: string;
  name: string;
  category: 'SHARING_PREVENTION' | 'ACCESS_CONTROL' | 'ACCOUNTING_PROTECTION';
  status: 'ACTIVE_ON_ROUTER' | 'PROPOSED' | 'DISABLED' | 'UNSUPPORTED';
  isSupported: boolean;
  description: string;
  realisticEffect: string; // What it can reliably prevent
  knownLimitations: string; // What cannot be guaranteed (e.g. rooted devices / L3 cloning)
}

export interface GeneratedCommandItem {
  stage: string;
  command: string;
  description?: string;
}

export interface ProvisioningPreviewResponse {
  template: ProvisioningTemplate;
  routerVersion: string;
  discovery: RouterDiscoverySnapshot;
  plannedSteps: PlannedProvisioningStep[];
  generatedCommands: GeneratedCommandItem[];
  warnings: ProvisioningWarning[];
  conflicts: ProvisioningConflict[];
  securityPoliciesReport: SecurityPolicyReportItem[];
  canProceed: boolean;
  requiresCleanConfirmation: boolean;
  backupRecommended: boolean;
}

export interface ExecutedStageLog {
  stage: string;
  command?: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  error?: string;
  timestamp: string;
}

export interface ProvisioningVerificationResult {
  internetReachable: boolean;
  wanConfigured: boolean;
  defaultRouteActive: boolean;
  hotspotOperational: boolean;
  pingPacketsReceived: number;
  securityPoliciesVerified: boolean;
  profileSpeedVerified?: boolean;
  portalFilesVerified?: boolean;
  overallStatus: 'VERIFIED_READY' | 'PARTIALLY_VERIFIED' | 'VERIFICATION_FAILED';
  diagnosticsMessage: string;
}

export interface ProvisioningApplyResult {
  success: boolean;
  deviceId: string;
  deviceName: string;
  backupFilename?: string;
  executedStages: ExecutedStageLog[];
  failedStage?: string;
  failureReason?: string;
  recoveryInstructions?: string;
  verification: ProvisioningVerificationResult;
}

