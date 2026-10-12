import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { BillingCycle, PppoeAccountStatus } from '@prisma/client';

export class UpdatePppoeAccountDto {
  @ApiPropertyOptional({
    description: 'Updated PPPoE profile UUID',
    example: 'f87a32d1-2c1b-4f81-9b19-61ab938f29ea',
  })
  @IsUUID('4', { message: 'profileId must be a valid UUIDv4' })
  @IsOptional()
  profileId?: string;

  @ApiPropertyOptional({
    description: 'New password for the subscriber (will be re-encrypted at rest and synced to router)',
    example: 'NewSecr3tP@ss',
  })
  @IsString()
  @MinLength(4)
  @IsOptional()
  password?: string;

  @ApiPropertyOptional({
    description: 'Account status (ACTIVE, DISABLED, EXPIRED, SUSPENDED)',
    enum: PppoeAccountStatus,
  })
  @IsEnum(PppoeAccountStatus)
  @IsOptional()
  status?: PppoeAccountStatus;

  @ApiPropertyOptional({
    description: 'Updated MAC address lock / Caller ID',
    example: '00:1A:2B:3C:4D:5E',
  })
  @IsString()
  @IsOptional()
  callerId?: string;

  @ApiPropertyOptional({
    description: 'Updated dedicated static IP',
    example: '10.100.1.51',
  })
  @IsString()
  @IsOptional()
  staticIp?: string;

  @ApiPropertyOptional({
    description: 'Updated customer full name',
    example: 'Ahmed Ali Mohamed',
  })
  @IsString()
  @IsOptional()
  customerName?: string;

  @ApiPropertyOptional({
    description: 'Updated customer contact phone',
    example: '+249912345678',
  })
  @IsString()
  @IsOptional()
  customerPhone?: string;

  @ApiPropertyOptional({
    description: 'Updated price in local currency',
    example: 6500,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({
    description: 'Updated billing cycle',
    enum: BillingCycle,
  })
  @IsEnum(BillingCycle)
  @IsOptional()
  billingCycle?: BillingCycle;

  @ApiPropertyOptional({
    description: 'Updated expiration timestamp (ISO 8601 string)',
    example: '2026-12-12T00:00:00.000Z',
  })
  @IsOptional()
  expiresAt?: string | Date;

  @ApiPropertyOptional({
    description: 'Updated administrative notes',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
