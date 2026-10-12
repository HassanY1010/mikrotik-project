import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PppoeSessionResponseDto {
  @ApiProperty({ description: 'Session UUID or RouterOS identifier', example: '*1A' })
  id!: string;

  @ApiProperty({ description: 'Tenant UUID', example: 'tenant-1' })
  tenantId!: string;

  @ApiProperty({ description: 'MikroTik Device UUID', example: 'device-1' })
  deviceId!: string;

  @ApiPropertyOptional({ description: 'Linked PppoeAccount UUID if matched' })
  accountId?: string | null;

  @ApiProperty({ description: 'Subscriber PPPoE username', example: 'user_001_home' })
  username!: string;

  @ApiProperty({ description: 'Assigned IP address', example: '10.100.1.50' })
  ipAddress!: string;

  @ApiPropertyOptional({ description: 'Caller ID / MAC address', example: '00:1A:2B:3C:4D:5E' })
  macAddress?: string | null;

  @ApiProperty({ description: 'Session uptime in seconds', example: 3600 })
  uptimeSeconds!: number;

  @ApiProperty({ description: 'Total bytes received', example: 10485760 })
  bytesIn!: number;

  @ApiProperty({ description: 'Total bytes sent', example: 52428800 })
  bytesOut!: number;

  @ApiPropertyOptional({ description: 'RouterOS Session ID string', example: 'sess-p001' })
  sessionId?: string | null;

  @ApiProperty({ description: 'Session start timestamp' })
  startedAt!: Date;
}
