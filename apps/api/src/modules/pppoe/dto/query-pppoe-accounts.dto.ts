import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { PppoeAccountStatus } from '@prisma/client';

export class QueryPppoeAccountsDto {
  @ApiPropertyOptional({
    description: 'Filter by account status (ACTIVE, DISABLED, EXPIRED, SUSPENDED)',
    enum: PppoeAccountStatus,
  })
  @IsEnum(PppoeAccountStatus)
  @IsOptional()
  status?: PppoeAccountStatus;

  @ApiPropertyOptional({
    description: 'Filter by profile UUID',
  })
  @IsUUID('4')
  @IsOptional()
  profileId?: string;

  @ApiPropertyOptional({
    description: 'Search string matching username, customerName, or customerPhone',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Page number for pagination',
    default: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of records per page',
    default: 20,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  @IsOptional()
  limit?: number = 20;
}
