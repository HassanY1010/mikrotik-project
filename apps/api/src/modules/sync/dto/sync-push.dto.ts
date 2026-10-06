import {
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SyncMutationDto {
  @ApiProperty({ description: 'Client-generated idempotent UUID for this mutation' })
  @IsUUID()
  @IsNotEmpty()
  clientMutationId!: string;

  @ApiProperty({ description: 'Mutation type', enum: ['SALE', 'CARD_STATUS', 'PRINT'] })
  @IsIn(['SALE', 'CARD_STATUS', 'PRINT'])
  type!: 'SALE' | 'CARD_STATUS' | 'PRINT';

  @ApiProperty({ description: 'Mutation payload (sale details, status change, or print job)' })
  @IsObject()
  @IsNotEmpty()
  payload!: Record<string, unknown>;

  @ApiProperty({ description: 'ISO timestamp when mutation occurred on device offline' })
  @IsDateString()
  createdAt!: string;
}

export class SyncPushDto {
  @ApiPropertyOptional({ description: 'Timestamp of client last successful pull' })
  @IsDateString()
  @IsOptional()
  lastSyncTimestamp?: string;

  @ApiProperty({
    description: 'Array of offline mutations to reconcile with the server',
    type: [SyncMutationDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncMutationDto)
  mutations!: SyncMutationDto[];
}
