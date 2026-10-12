import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AgentStatus } from '@prisma/client';

export class PairingCodeResponseDto {
  @ApiProperty({ description: 'Six-digit temporary pairing code', example: '482910' })
  code!: string;

  @ApiProperty({ description: 'Expiration date and time' })
  expiresAt!: Date;

  @ApiProperty({ description: 'Validity duration in seconds', example: 300 })
  expiresInSeconds!: number;
}

export class AgentPairSuccessDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ description: 'Unique agent ID' })
  agentId!: string;

  @ApiProperty({ description: 'Issued long-lived agent authentication token (64-char hex)' })
  agentToken!: string;

  @ApiPropertyOptional({ description: 'Direct token alias for agent client backward-compatibility' })
  token?: string;

  @ApiProperty({ description: 'Paired router device ID' })
  deviceId!: string;

  @ApiProperty({ description: 'Authorized tenant ID' })
  tenantId!: string;
}

export class AgentStatusResponseDto {
  @ApiProperty({ description: 'Unique agent ID' })
  id!: string;

  @ApiProperty({ description: 'Tenant ID' })
  tenantId!: string;

  @ApiProperty({ description: 'Device ID' })
  deviceId!: string;

  @ApiProperty({ description: 'Host machine name' })
  name!: string;

  @ApiProperty({ enum: AgentStatus, example: AgentStatus.OFFLINE })
  status!: AgentStatus;

  @ApiPropertyOptional({ description: 'Agent software version' })
  version?: string | null;

  @ApiPropertyOptional({ description: 'Last known public IP address' })
  ipAddress?: string | null;

  @ApiPropertyOptional({ description: 'Timestamp of last heartbeat' })
  lastPingAt?: Date | null;

  @ApiProperty({ description: 'Pairing timestamp' })
  pairedAt!: Date;

  @ApiPropertyOptional({ description: 'Revocation timestamp' })
  revokedAt?: Date | null;
}
