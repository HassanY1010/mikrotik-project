import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PppoeProfileResponseDto {
  @ApiProperty({ description: 'Profile UUID', example: 'f87a32d1-2c1b-4f81-9b19-61ab938f29ea' })
  id!: string;

  @ApiProperty({ description: 'Tenant UUID', example: 'tenant-1' })
  tenantId!: string;

  @ApiProperty({ description: 'MikroTik Device UUID', example: 'device-1' })
  deviceId!: string;

  @ApiProperty({ description: 'Profile name', example: '10Mbps-Home' })
  name!: string;

  @ApiPropertyOptional({ description: 'Rate limit', example: '5M/10M' })
  rateLimit?: string | null;

  @ApiPropertyOptional({ description: 'Local gateway address', example: '10.100.0.1' })
  localAddress?: string | null;

  @ApiPropertyOptional({ description: 'Remote pool or address', example: 'pppoe-pool' })
  remoteAddress?: string | null;

  @ApiPropertyOptional({ description: 'DNS servers', example: '8.8.8.8,1.1.1.1' })
  dnsServers?: string | null;

  @ApiProperty({ description: 'Only one session allowed', example: true })
  onlyOne!: boolean;

  @ApiProperty({ description: 'Package price', example: 5000 })
  price!: number;

  @ApiPropertyOptional({ description: 'Description' })
  description?: string | null;

  @ApiPropertyOptional({ description: 'Number of accounts currently using this profile', example: 12 })
  accountsCount?: number;

  @ApiPropertyOptional({ description: 'ID of agent command queued for router synchronization if applicable' })
  queuedCommandId?: string | null;

  @ApiProperty({ description: 'Created timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Updated timestamp' })
  updatedAt!: Date;
}
