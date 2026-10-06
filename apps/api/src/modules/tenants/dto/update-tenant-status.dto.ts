import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
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
}
