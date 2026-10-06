import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AuditLogQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Records per page', default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by action name (e.g. LOGIN, DEVICE_ADDED, CARDS_GENERATED)',
  })
  @IsString()
  @IsOptional()
  action?: string;

  @ApiPropertyOptional({
    description: 'Filter by entity type (e.g. Card, User, Device, SaleTransaction)',
  })
  @IsString()
  @IsOptional()
  entity?: string;

  @ApiPropertyOptional({ description: 'Filter by user ID who performed the action' })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({ description: 'Start date filter (YYYY-MM-DD or ISO)' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date filter (YYYY-MM-DD or ISO)' })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}
