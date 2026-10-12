import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { TenantStatus } from '@prisma/client';

export class UpdateTenantStatusDto {
  @ApiProperty({
    enum: TenantStatus,
    example: TenantStatus.ACTIVE,
    description: 'New status for the tenant organization',
  })
  @IsEnum(TenantStatus, { message: 'Invalid tenant status' })
  @IsNotEmpty()
  status!: TenantStatus;

  @ApiPropertyOptional({
    example: 'Non-payment of monthly service fees',
    description: 'Administrative reason for updating status',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
