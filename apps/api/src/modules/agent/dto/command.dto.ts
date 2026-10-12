import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEnum, IsUUID, IsObject, IsOptional, IsIn } from 'class-validator';
import { AgentCommandStatus } from '@prisma/client';

export enum AgentCommandType {
  ROUTER_HEALTH = 'system.router.health',
  HOTSPOT_BATCH_ADD = 'hotspot.user.batch_add',
  HOTSPOT_USER_REMOVE = 'hotspot.user.remove',
  HOTSPOT_VERIFY_BATCH = 'hotspot.user.verify_batch',
  HOTSPOT_SESSION_LIST = 'hotspot.session.list',
  // PPPoE & Broadband Command Types
  PPPOE_PROFILE_SYNC = 'pppoe.profile.sync',
  PPPOE_SECRET_ADD = 'pppoe.secret.add',
  PPPOE_SECRET_UPDATE = 'pppoe.secret.update',
  PPPOE_SECRET_DISABLE = 'pppoe.secret.disable',
  PPPOE_SECRET_ENABLE = 'pppoe.secret.enable',
  PPPOE_SECRET_REMOVE = 'pppoe.secret.remove',
  PPPOE_SESSION_LIST = 'pppoe.session.list',
  PPPOE_SESSION_DISCONNECT = 'pppoe.session.disconnect',
  HOTSPOT_PORTAL_PUBLISH = 'hotspot.portal.publish',
}

export class QueueCommandDto {
  @ApiProperty({
    description: 'Unique client-supplied idempotency key (UUIDv4) preventing duplicate execution',
    example: 'c6d23156-f084-482a-a92c-15a0c8413b52',
  })
  @IsUUID('4', { message: 'operationId must be a valid UUIDv4' })
  operationId!: string;

  @ApiProperty({
    description: 'Strict whitelisted command type',
    enum: AgentCommandType,
    example: AgentCommandType.ROUTER_HEALTH,
  })
  @IsEnum(AgentCommandType, {
    message: `type must be one of: ${Object.values(AgentCommandType).join(', ')}`,
  })
  type!: AgentCommandType;

  @ApiProperty({
    description: 'Typed payload matching the command specification',
    example: { timeoutMs: 3000 },
  })
  @IsObject()
  payload!: Record<string, any>;
}

export class SubmitCommandResultDto {
  @ApiProperty({
    description: 'The operationId of the executed command',
    example: 'c6d23156-f084-482a-a92c-15a0c8413b52',
  })
  @IsUUID('4', { message: 'operationId must be a valid UUIDv4' })
  operationId!: string;

  @ApiProperty({
    description: 'Execution outcome status',
    enum: ['COMPLETED', 'FAILED'],
    example: 'COMPLETED',
  })
  @IsIn(['COMPLETED', 'FAILED'])
  status!: 'COMPLETED' | 'FAILED';

  @ApiPropertyOptional({
    description: 'Result output dictionary if completed',
  })
  @IsOptional()
  @IsObject()
  result?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Error message if failed',
  })
  @IsOptional()
  @IsString()
  errorMessage?: string;
}

export class CommandResponseDto {
  @ApiProperty({ description: 'Unique command ID' })
  id!: string;

  @ApiProperty({ description: 'Idempotency operation ID' })
  operationId!: string;

  @ApiProperty({ description: 'Target router device ID' })
  deviceId!: string;

  @ApiProperty({ description: 'Assigned agent ID' })
  agentId!: string;

  @ApiProperty({ description: 'Command type' })
  type!: string;

  @ApiProperty({ enum: AgentCommandStatus })
  status!: AgentCommandStatus;

  @ApiProperty({ description: 'Input payload' })
  payload!: Record<string, any>;

  @ApiPropertyOptional({ description: 'Output result' })
  result?: Record<string, any> | null;

  @ApiPropertyOptional({ description: 'Error message if failed' })
  errorMessage?: string | null;

  @ApiProperty({ description: 'Queued timestamp' })
  createdAt!: Date;

  @ApiPropertyOptional({ description: 'Dispatched to agent timestamp' })
  dispatchedAt?: Date | null;

  @ApiPropertyOptional({ description: 'Completed timestamp' })
  completedAt?: Date | null;

  @ApiProperty({ description: 'Expiration timestamp' })
  expiresAt!: Date;
}
