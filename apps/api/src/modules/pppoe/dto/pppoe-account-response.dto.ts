import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingCycle, PppoeAccountStatus, SyncStatus } from '@prisma/client';

export class PppoeAccountResponseDto {
  @ApiProperty({ description: 'Account UUID', example: 'd3c45678-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ description: 'Tenant UUID', example: 'tenant-1' })
  tenantId!: string;

  @ApiProperty({ description: 'MikroTik Device UUID', example: 'device-1' })
  deviceId!: string;

  @ApiProperty({ description: 'Assigned Profile UUID', example: 'f87a32d1-2c1b-4f81-9b19-61ab938f29ea' })
  profileId!: string;

  @ApiPropertyOptional({ description: 'Assigned Profile Name', example: '10Mbps-Home' })
  profileName?: string;

  @ApiProperty({ description: 'Subscriber PPPoE username', example: 'user_001_home' })
  username!: string;

  @ApiProperty({ enum: PppoeAccountStatus, description: 'Account status (ACTIVE, DISABLED, EXPIRED, SUSPENDED)' })
  status!: PppoeAccountStatus;

  @ApiPropertyOptional({ description: 'MAC address lock / Caller ID' })
  callerId?: string | null;

  @ApiPropertyOptional({ description: 'Assigned static IP' })
  staticIp?: string | null;

  @ApiPropertyOptional({ description: 'Customer full name' })
  customerName?: string | null;

  @ApiPropertyOptional({ description: 'Customer phone number' })
  customerPhone?: string | null;

  @ApiProperty({ description: 'Subscription price' })
  price!: number;

  @ApiProperty({ enum: BillingCycle, description: 'Billing cycle' })
  billingCycle!: BillingCycle;

  @ApiPropertyOptional({ description: 'Subscription expiration date' })
  expiresAt?: Date | null;

  @ApiPropertyOptional({ description: 'Administrative notes' })
  notes?: string | null;

  @ApiProperty({ enum: SyncStatus, description: 'Router synchronization status (PENDING, SYNCED, FAILED)' })
  syncStatus!: SyncStatus;

  @ApiPropertyOptional({ description: 'Last synchronization error message if failed' })
  syncError?: string | null;

  @ApiPropertyOptional({ description: 'ID of agent command queued for router synchronization if applicable' })
  queuedCommandId?: string | null;

  @ApiProperty({ description: 'Account created timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Account updated timestamp' })
  updatedAt!: Date;
}
