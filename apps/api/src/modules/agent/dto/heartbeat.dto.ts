import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class AgentMetricsDto {
  @ApiPropertyOptional({ description: 'Host agent uptime in seconds', example: 86400 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  uptimeSeconds?: number;

  @ApiPropertyOptional({ description: 'CPU usage percent [0-100]', example: 12.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  cpuUsagePercent?: number;

  @ApiPropertyOptional({ description: 'Available RAM in bytes', example: 2147483648 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  freeMemoryBytes?: number;

  @ApiPropertyOptional({ description: 'Host agent uptime in seconds (alias for uptimeSeconds)', example: 86400 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  agentUptimeSeconds?: number;

  @ApiPropertyOptional({ description: 'Agent memory usage in MB', example: 45 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  memoryUsage?: number;

  @ApiPropertyOptional({ description: 'Local router latency in milliseconds', example: 1.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  routerPingMs?: number;
}

export class AgentHeartbeatDto {
  @ApiPropertyOptional({ description: 'Agent software version', example: '1.0.0' })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiPropertyOptional({ description: 'Agent host and router performance metrics', type: AgentMetricsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AgentMetricsDto)
  metrics?: AgentMetricsDto;
}

export class PendingCommandDto {
  @ApiProperty({ description: 'Unique backend command ID' })
  id!: string;

  @ApiProperty({ description: 'Idempotency operation ID' })
  operationId!: string;

  @ApiProperty({ description: 'Strict whitelisted command type' })
  type!: string;

  @ApiProperty({ description: 'Typed parameters for command execution' })
  payload!: Record<string, any>;

  @ApiProperty({ description: 'Timestamp when command was queued' })
  createdAt!: Date;

  @ApiProperty({ description: 'Expiration timestamp' })
  expiresAt!: Date;
}

export class HeartbeatResponseDto {
  @ApiPropertyOptional({ example: true })
  success?: boolean;

  @ApiProperty({ example: 'ACK' })
  status!: string;

  @ApiProperty({ description: 'Current UTC server timestamp' })
  serverTime!: Date;

  @ApiProperty({ description: 'Recommended heartbeat interval in milliseconds', example: 25000 })
  heartbeatIntervalMs!: number;

  @ApiProperty({ description: 'Threshold after which server marks agent OFFLINE in ms', example: 60000 })
  offlineThresholdMs!: number;

  @ApiProperty({ description: 'List of pending commands queued for this agent', type: [PendingCommandDto] })
  pendingCommands!: PendingCommandDto[];
}
