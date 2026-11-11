import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const SAFE_IDENTIFIER_REGEX = /^[a-zA-Z0-9._:@/-]+$/;
const SAFE_LABEL_REGEX = /^[^;\r\n`$<>|&\[\]{}]+$/;
const SAFE_IP_OR_CIDR_REGEX = /^\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?$/;
const SAFE_INTERVAL_REGEX = /^(?:\d+[smhdw]|(?:\d{2}:)?\d{2}:\d{2})$/;

export class WanProvisionConfigDto {
  @ApiProperty({ example: 'ether1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(SAFE_IDENTIFIER_REGEX, { message: 'اسم واجهة WAN يحتوي على أحرف غير مسموح بها' })
  interface!: string;

  @ApiProperty({ enum: ['DHCP', 'PPPOE', 'STATIC'], example: 'DHCP' })
  @IsEnum(['DHCP', 'PPPOE', 'STATIC'])
  mode!: 'DHCP' | 'PPPOE' | 'STATIC';

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(64)
  @Matches(SAFE_IDENTIFIER_REGEX)
  pppoeUser?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(128)
  @Matches(SAFE_LABEL_REGEX)
  pppoePassword?: string;

  @ApiPropertyOptional({ example: '192.168.1.50/24' })
  @IsString()
  @IsOptional()
  @Matches(SAFE_IP_OR_CIDR_REGEX)
  staticIp?: string;

  @ApiPropertyOptional({ example: '192.168.1.1' })
  @IsString()
  @IsOptional()
  @Matches(SAFE_IP_OR_CIDR_REGEX)
  staticGateway?: string;

  @ApiPropertyOptional({ example: ['8.8.8.8', '1.1.1.1'] })
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @Matches(SAFE_IP_OR_CIDR_REGEX, { each: true })
  @IsOptional()
  staticDns?: string[];

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  enableNat?: boolean;

  @ApiPropertyOptional({ description: 'Optional safe custom label/rename when confirmed' })
  @IsString()
  @IsOptional()
  @MaxLength(32)
  @Matches(SAFE_IDENTIFIER_REGEX)
  renameInterfaceTo?: string;
}

export class LanProvisionConfigDto {
  @ApiPropertyOptional({ default: 'bridge-hotspot' })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  @Matches(SAFE_IDENTIFIER_REGEX)
  bridgeName?: string;

  @ApiProperty({ example: ['ether2', 'ether3'] })
  @IsArray()
  @ArrayMaxSize(48)
  @IsString({ each: true })
  @Matches(SAFE_IDENTIFIER_REGEX, { each: true })
  memberInterfaces!: string[];

  @ApiProperty({ example: '10.5.50.1/24' })
  @IsString()
  @IsNotEmpty()
  @Matches(SAFE_IP_OR_CIDR_REGEX, { message: 'بوابة LAN يجب أن تكون بصيغة IPv4/CIDR صالحة' })
  gatewayIp!: string;

  @ApiPropertyOptional({ example: '10.5.50.10-10.5.50.254' })
  @IsString()
  @IsOptional()
  @MaxLength(128)
  @Matches(/^[0-9.,-]+$/)
  poolRange?: string;

  @ApiPropertyOptional({ default: '1h' })
  @IsString()
  @IsOptional()
  @Matches(SAFE_INTERVAL_REGEX)
  dhcpLeaseTime?: string;

  @ApiPropertyOptional({ example: ['10.5.50.1', '8.8.8.8'] })
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @Matches(SAFE_IP_OR_CIDR_REGEX, { each: true })
  @IsOptional()
  dnsServers?: string[];

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  autoMac?: boolean;
}

export class DnsProvisionConfigDto {
  @ApiPropertyOptional({ example: ['8.8.8.8', '1.1.1.1'] })
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @Matches(SAFE_IP_OR_CIDR_REGEX, { each: true })
  @IsOptional()
  servers?: string[];

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  allowRemoteRequests?: boolean;
}

export class WirelessProvisionConfigDto {
  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ example: 'SudaFi-Hotspot' })
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(32)
  @Matches(SAFE_LABEL_REGEX)
  ssid?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MinLength(8)
  @MaxLength(63)
  @Matches(SAFE_LABEL_REGEX)
  password?: string;

  @ApiPropertyOptional({ example: 'Sudan', description: 'Regulatory country domain (never hardcoded)' })
  @IsString()
  @IsOptional()
  @MaxLength(32)
  @Matches(/^[a-zA-Z ]+$/)
  country?: string;

  @ApiPropertyOptional({ example: ['wlan1'] })
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @Matches(SAFE_IDENTIFIER_REGEX, { each: true })
  @IsOptional()
  interfaceNames?: string[];

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  disableWps?: boolean;
}

export class HotspotProvisionConfigDto {
  @ApiPropertyOptional({ default: 'hs-sudafi' })
  @IsString()
  @IsOptional()
  @MaxLength(48)
  @Matches(SAFE_IDENTIFIER_REGEX)
  serverName?: string;

  @ApiPropertyOptional({ default: 'hsp-server-sudafi' })
  @IsString()
  @IsOptional()
  @MaxLength(48)
  @Matches(SAFE_IDENTIFIER_REGEX)
  serverProfileName?: string;

  @ApiPropertyOptional({ default: 'hsp-sudafi' })
  @IsString()
  @IsOptional()
  @MaxLength(48)
  @Matches(SAFE_IDENTIFIER_REGEX)
  userProfileName?: string;

  @ApiPropertyOptional({ default: 'login.sudafi.net' })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9.-]+$/)
  dnsName?: string;

  @ApiPropertyOptional({ default: 'hotspot' })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  @Matches(SAFE_IDENTIFIER_REGEX)
  htmlDirectory?: string;

  @ApiPropertyOptional({ default: 'http-chap,http-pap,cookie,mac-cookie' })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  @Matches(/^[a-zA-Z,-]+$/)
  loginBy?: string;

  @ApiPropertyOptional({ default: '3d' })
  @IsString()
  @IsOptional()
  @Matches(SAFE_INTERVAL_REGEX)
  cookieLifetime?: string;

  @ApiPropertyOptional({ default: '2M/5M' })
  @IsString()
  @IsOptional()
  @MaxLength(32)
  @Matches(/^[0-9kKmMgG/ ]+$/)
  defaultRateLimit?: string;

  @ApiPropertyOptional({ default: '1d' })
  @IsString()
  @IsOptional()
  @Matches(SAFE_INTERVAL_REGEX)
  sessionTimeout?: string;

  @ApiPropertyOptional({ default: '2m' })
  @IsString()
  @IsOptional()
  @Matches(SAFE_INTERVAL_REGEX)
  keepaliveTimeout?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  sharedUsers?: number;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  enableLocalUsageScript?: boolean;
}

export class QueueProvisionConfigDto {
  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  applySfqToDefaults?: boolean;

  @ApiPropertyOptional({ default: 'sfq-sudafi' })
  @IsString()
  @IsOptional()
  @MaxLength(32)
  @Matches(SAFE_IDENTIFIER_REGEX)
  customQueueName?: string;
}

export class SystemProvisionConfigDto {
  @ApiPropertyOptional({ example: 'SudaFi-Hotspot-Router' })
  @IsString()
  @IsOptional()
  @MaxLength(48)
  @Matches(SAFE_LABEL_REGEX)
  identity?: string;

  @ApiPropertyOptional({ example: 'Africa/Khartoum' })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  @Matches(/^[A-Za-z_+-]+\/[A-Za-z0-9_+-]+$/)
  timezone?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  ntpEnabled?: boolean;

  @ApiPropertyOptional({ example: ['time.google.com', 'pool.ntp.org'] })
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @Matches(/^[a-zA-Z0-9.-]+$/, { each: true })
  @IsOptional()
  ntpServers?: string[];

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  hideLoginNote?: boolean;
}

export class SchedulerProvisionConfigDto {
  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  enableAutoBackupSchedule?: boolean;

  @ApiPropertyOptional({ default: '12h' })
  @IsString()
  @IsOptional()
  @Matches(SAFE_INTERVAL_REGEX)
  autoBackupInterval?: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  enableNetwatch?: boolean;

  @ApiPropertyOptional({ default: '8.8.8.8' })
  @IsString()
  @IsOptional()
  @Matches(SAFE_IP_OR_CIDR_REGEX)
  netwatchHost?: string;

  @ApiPropertyOptional({ default: '1m' })
  @IsString()
  @IsOptional()
  @Matches(SAFE_INTERVAL_REGEX)
  netwatchInterval?: string;
}

export class SecurityPoliciesProvisionDto {
  @IsBoolean() @IsOptional() antiTethering?: boolean;
  @IsBoolean() @IsOptional() clientIsolation?: boolean;
  @IsBoolean() @IsOptional() protectManagementAccess?: boolean;
  @IsBoolean() @IsOptional() protectWanAccess?: boolean;
  @IsBoolean() @IsOptional() forceRouterDns?: boolean;
  @IsBoolean() @IsOptional() enforceSingleDevice?: boolean;
  @IsBoolean() @IsOptional() blockUnauthenticatedBypass?: boolean;
}

export class AutoProvisionConfigDto {
  @ApiPropertyOptional({ enum: ['CLEAN_SETUP', 'HOTSPOT_ON_EXISTING', 'CUSTOM'], default: 'CLEAN_SETUP' })
  @IsEnum(['CLEAN_SETUP', 'HOTSPOT_ON_EXISTING', 'CUSTOM'])
  @IsOptional()
  template?: 'CLEAN_SETUP' | 'HOTSPOT_ON_EXISTING' | 'CUSTOM';

  @ValidateNested()
  @Type(() => WanProvisionConfigDto)
  wan!: WanProvisionConfigDto;

  @ValidateNested()
  @Type(() => LanProvisionConfigDto)
  lan!: LanProvisionConfigDto;

  @ValidateNested()
  @Type(() => DnsProvisionConfigDto)
  @IsOptional()
  dns?: DnsProvisionConfigDto;

  @ValidateNested()
  @Type(() => WirelessProvisionConfigDto)
  @IsOptional()
  wireless?: WirelessProvisionConfigDto;

  @ValidateNested()
  @Type(() => HotspotProvisionConfigDto)
  @IsOptional()
  hotspot?: HotspotProvisionConfigDto;

  @ValidateNested()
  @Type(() => QueueProvisionConfigDto)
  @IsOptional()
  queues?: QueueProvisionConfigDto;

  @ValidateNested()
  @Type(() => SystemProvisionConfigDto)
  @IsOptional()
  system?: SystemProvisionConfigDto;

  @ValidateNested()
  @Type(() => SchedulerProvisionConfigDto)
  @IsOptional()
  scheduler?: SchedulerProvisionConfigDto;

  @ValidateNested()
  @Type(() => SecurityPoliciesProvisionDto)
  @IsOptional()
  securityPolicies?: SecurityPoliciesProvisionDto;

  @IsBoolean()
  @IsOptional()
  confirmWanChange?: boolean;

  @IsBoolean()
  @IsOptional()
  confirmCleanSetup?: boolean;
}

export class StartAutoProvisioningDto extends AutoProvisionConfigDto {
  @ApiProperty({ description: 'Explicit user confirmation after viewing preview plan' })
  @IsBoolean()
  confirmPlan!: boolean;

  @ApiPropertyOptional({ enum: ['CLOUD', 'LOCAL'], default: 'CLOUD' })
  @IsEnum(['CLOUD', 'LOCAL'])
  @IsOptional()
  executionMode?: 'CLOUD' | 'LOCAL';

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  createPreBackup?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(64)
  @Matches(SAFE_LABEL_REGEX)
  backupPassword?: string;

  @ApiProperty({ description: 'Signed Ed25519 plan token generated by buildPreview' })
  @IsObject()
  planToken!: Record<string, unknown>;
}

export class CreateProvisionBackupDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(48)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  backupName?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  includeRscExport?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(64)
  @Matches(SAFE_LABEL_REGEX)
  password?: string;
}

export class RestoreProvisionBackupDto {
  @ApiPropertyOptional({ description: 'Backup record ID from RouterBackup table' })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  backupId?: string;

  @ApiPropertyOptional({ description: 'Backup file name directly on router' })
  @IsString()
  @IsOptional()
  @MaxLength(128)
  @Matches(/^[a-zA-Z0-9_.-]+$/)
  routerFilename?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(64)
  password?: string;

  @ApiProperty()
  @IsBoolean()
  confirmed!: boolean;

  @ApiProperty()
  @IsBoolean()
  acknowledgeReboot!: boolean;

  @ApiProperty()
  @IsBoolean()
  acknowledgeDisconnect!: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  acknowledgeCompatibilityRisk?: boolean;
}
