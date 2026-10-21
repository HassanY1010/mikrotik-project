import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WanConfigDto {
  @ApiProperty({ description: 'WAN interface name (e.g. ether1)', example: 'ether1' })
  @IsString()
  @IsNotEmpty()
  interface!: string;

  @ApiProperty({
    description: 'WAN connection mode (DHCP, PPPOE, STATIC)',
    enum: ['DHCP', 'PPPOE', 'STATIC'],
    example: 'DHCP',
  })
  @IsEnum(['DHCP', 'PPPOE', 'STATIC'])
  mode!: 'DHCP' | 'PPPOE' | 'STATIC';

  @ApiPropertyOptional({ description: 'PPPoE Username if mode is PPPOE' })
  @IsString()
  @IsOptional()
  pppoeUser?: string;

  @ApiPropertyOptional({ description: 'PPPoE Password if mode is PPPOE' })
  @IsString()
  @IsOptional()
  pppoePassword?: string;

  @ApiPropertyOptional({ description: 'Static IP with CIDR if mode is STATIC (e.g. 192.168.1.50/24)' })
  @IsString()
  @IsOptional()
  staticIp?: string;

  @ApiPropertyOptional({ description: 'Static Default Gateway if mode is STATIC (e.g. 192.168.1.1)' })
  @IsString()
  @IsOptional()
  staticGateway?: string;

  @ApiPropertyOptional({ description: 'Static DNS servers if mode is STATIC', example: ['8.8.8.8', '1.1.1.1'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  staticDns?: string[];

  @ApiPropertyOptional({ description: 'Enable NAT Masquerade rule for WAN interface', default: true })
  @IsBoolean()
  @IsOptional()
  enableNat?: boolean;
}

export class LanConfigDto {
  @ApiPropertyOptional({ description: 'Name of the Hotspot Bridge', default: 'bridge-hotspot' })
  @IsString()
  @IsOptional()
  bridgeName?: string;

  @ApiProperty({
    description: 'Interfaces included in the Hotspot LAN Bridge (e.g. ether2, ether3)',
    example: ['ether2', 'ether3', 'ether4', 'ether5'],
  })
  @IsArray()
  @IsString({ each: true })
  memberInterfaces!: string[];

  @ApiProperty({
    description: 'Gateway IP address with CIDR for Hotspot network',
    example: '10.5.50.1/24',
    default: '10.5.50.1/24',
  })
  @IsString()
  @IsNotEmpty()
  gatewayIp!: string;

  @ApiPropertyOptional({
    description: 'DHCP IP pool range (e.g. 10.5.50.10-10.5.50.254)',
    example: '10.5.50.10-10.5.50.254',
  })
  @IsString()
  @IsOptional()
  poolRange?: string;

  @ApiPropertyOptional({ description: 'DHCP Lease time', default: '1h' })
  @IsString()
  @IsOptional()
  dhcpLeaseTime?: string;

  @ApiPropertyOptional({ description: 'DNS Servers distributed to clients', example: ['10.5.50.1', '8.8.8.8'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  dnsServers?: string[];
}

export class HotspotServerConfigDto {
  @ApiPropertyOptional({ description: 'Hotspot server name', default: 'hs-sudafi' })
  @IsString()
  @IsOptional()
  serverName?: string;

  @ApiPropertyOptional({ description: 'Hotspot server profile name', default: 'hsp-sudafi' })
  @IsString()
  @IsOptional()
  profileName?: string;

  @ApiPropertyOptional({ description: 'Hotspot DNS login domain name', default: 'login.sudafi.net' })
  @IsString()
  @IsOptional()
  dnsName?: string;

  @ApiPropertyOptional({ description: 'HTML directory inside router', default: 'hotspot' })
  @IsString()
  @IsOptional()
  htmlDirectory?: string;

  @ApiPropertyOptional({ description: 'Login methods (e.g. http-chap,http-pap)', default: 'http-chap,http-pap' })
  @IsString()
  @IsOptional()
  loginBy?: string;

  @ApiPropertyOptional({ description: 'Default user profile rate limit (e.g. 2M/5M)' })
  @IsString()
  @IsOptional()
  defaultRateLimit?: string;

  @ApiPropertyOptional({ description: 'Default user profile session timeout (e.g. 1d)' })
  @IsString()
  @IsOptional()
  defaultSessionTimeout?: string;
}

export class ProvisionPreviewDto {
  @ApiProperty({
    description: 'Provisioning template selection',
    enum: ['CLEAN_SETUP', 'HOTSPOT_ON_EXISTING', 'CUSTOM'],
    example: 'CLEAN_SETUP',
  })
  @IsEnum(['CLEAN_SETUP', 'HOTSPOT_ON_EXISTING', 'CUSTOM'])
  template!: 'CLEAN_SETUP' | 'HOTSPOT_ON_EXISTING' | 'CUSTOM';

  @ApiProperty({ description: 'WAN configuration settings' })
  @ValidateNested()
  @Type(() => WanConfigDto)
  wan!: WanConfigDto;

  @ApiProperty({ description: 'LAN and Bridge configuration settings' })
  @ValidateNested()
  @Type(() => LanConfigDto)
  lan!: LanConfigDto;

  @ApiPropertyOptional({ description: 'Hotspot server configuration settings' })
  @ValidateNested()
  @Type(() => HotspotServerConfigDto)
  @IsOptional()
  hotspot?: HotspotServerConfigDto;
}
