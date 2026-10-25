import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RouterConnectionStatusDto {
  @ApiProperty({ description: 'Device ID' })
  id: string;

  @ApiProperty({ description: 'Device Name' })
  name: string;

  @ApiProperty({ enum: ['online', 'offline', 'unreachable'] })
  status: 'online' | 'offline' | 'unreachable';

  @ApiPropertyOptional({ description: 'Error message if unreachable' })
  error?: string;
}

export class EnrichedHotspotSessionDto {
  @ApiProperty({ description: 'Session ID or Router record ID' })
  id: string;

  @ApiProperty({ description: 'Username or voucher card code' })
  user: string;

  @ApiProperty({ description: 'Client IP address' })
  address: string;

  @ApiProperty({ description: 'Client MAC address' })
  macAddress: string;

  @ApiProperty({ description: 'Formatted session uptime, e.g. 15د 32ث' })
  uptime: string;

  @ApiProperty({ description: 'Session uptime in seconds' })
  uptimeSeconds: number;

  @ApiProperty({ description: 'Bytes received from client (upload) in this session' })
  bytesIn: number;

  @ApiProperty({ description: 'Bytes transmitted to client (download) in this session' })
  bytesOut: number;

  @ApiPropertyOptional({ description: 'Router unique session identifier' })
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Hotspot server name' })
  server?: string;

  @ApiPropertyOptional({ description: 'Login method (cookie, http-chap, mac, etc.)' })
  loginBy?: string;

  // Router identification
  @ApiProperty({ description: 'Target MikroTik Device ID' })
  deviceId: string;

  @ApiProperty({ description: 'Target MikroTik Device Name' })
  deviceName: string;

  @ApiProperty({ enum: ['online', 'offline', 'unreachable'], description: 'Router availability status' })
  routerStatus: 'online' | 'offline' | 'unreachable';

  // Profile and speed limits
  @ApiProperty({ description: 'Applied Hotspot Profile name' })
  profileName: string;

  @ApiPropertyOptional({ description: 'Raw MikroTik rate-limit string (e.g. 2M/5M)' })
  rateLimit?: string | null;

  @ApiPropertyOptional({ description: 'Formatted download speed limit (e.g. 5 Mbps)' })
  downloadSpeedLimit?: string | null;

  @ApiPropertyOptional({ description: 'Formatted upload speed limit (e.g. 2 Mbps)' })
  uploadSpeedLimit?: string | null;

  @ApiPropertyOptional({ description: 'Download speed limit in bps' })
  downloadSpeedLimitBps?: number | null;

  @ApiPropertyOptional({ description: 'Upload speed limit in bps' })
  uploadSpeedLimitBps?: number | null;

  @ApiProperty({ description: 'Whether speed limit is unlimited / unrestricted' })
  isUnlimitedSpeed: boolean;

  // Internet consumption and quota
  @ApiPropertyOptional({ description: 'Total package quota in bytes (null if unlimited or unknown)' })
  totalQuotaBytes?: number | null;

  @ApiProperty({ description: 'Total data consumed in bytes' })
  consumedBytes: number;

  @ApiPropertyOptional({ description: 'Remaining data in bytes (null if unlimited or unknown)' })
  remainingBytes?: number | null;

  @ApiPropertyOptional({ description: 'Consumption percentage (0 to 100%)' })
  consumptionPercentage?: number | null;

  @ApiProperty({ description: 'Whether package data quota is open / unlimited' })
  isUnlimitedQuota: boolean;

  @ApiProperty({ description: 'Whether package quota has been completely exhausted' })
  isQuotaExhausted: boolean;

  @ApiProperty({ description: 'Whether quota/accounting data is unknown or unlinked' })
  isUnknownQuota: boolean;

  // Duration and validity
  @ApiPropertyOptional({ description: 'Package time limit (e.g. 1h, 1d)' })
  timeLimit?: string | null;

  @ApiPropertyOptional({ description: 'Formatted remaining session time from router' })
  sessionTimeLeft?: string | null;

  @ApiPropertyOptional({ description: 'Remaining package time in seconds until expiry' })
  remainingTimeSeconds?: number | null;

  @ApiPropertyOptional({ description: 'Card expiration date ISO string' })
  expiresAt?: string | null;

  @ApiProperty({ description: 'Whether package duration is open / unlimited' })
  isUnlimitedTime: boolean;

  @ApiProperty({ description: 'Whether card / package validity has expired' })
  isExpired: boolean;

  // Connection status & activity
  @ApiProperty({ enum: ['connected', 'disconnected', 'unreachable'] })
  connectionStatus: 'connected' | 'disconnected' | 'unreachable';

  @ApiProperty({ description: 'Timestamp of last activity / refresh' })
  lastSeen: string;
}

export class HotspotActiveSessionsResponseDto {
  @ApiProperty({ type: [EnrichedHotspotSessionDto] })
  data: EnrichedHotspotSessionDto[];

  @ApiProperty({ description: 'Total number of active sessions' })
  total: number;

  @ApiProperty({
    description: 'Metadata including last updated timestamp and router statuses',
    type: Object,
  })
  meta: {
    lastUpdated: string;
    routers: RouterConnectionStatusDto[];
  };
}
