import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { BillingCycle } from '@prisma/client';

export class CreatePppoeAccountDto {
  @ApiProperty({
    description: 'UUID of the target PPPoE profile',
    example: 'f87a32d1-2c1b-4f81-9b19-61ab938f29ea',
  })
  @IsUUID('4', { message: 'profileId must be a valid UUIDv4' })
  @IsNotEmpty()
  profileId!: string;

  @ApiProperty({
    description: 'PPPoE subscriber username (used for CPE router dial-in)',
    example: 'user_001_home',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  username!: string;

  @ApiProperty({
    description: 'PPPoE subscriber secret/password (will be encrypted with AES-256-GCM at rest and never exposed)',
    example: 'Secr3tP@ssw0rd',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  password!: string;

  @ApiPropertyOptional({
    description: 'MAC address lock / Caller ID for CPE device binding',
    example: '00:1A:2B:3C:4D:5E',
  })
  @IsString()
  @IsOptional()
  callerId?: string;

  @ApiPropertyOptional({
    description: 'Dedicated static IP address for the subscriber',
    example: '10.100.1.50',
  })
  @IsString()
  @IsOptional()
  staticIp?: string;

  @ApiPropertyOptional({
    description: 'Customer or subscriber full name',
    example: 'Ahmed Ali Mohamed',
  })
  @IsString()
  @IsOptional()
  customerName?: string;

  @ApiPropertyOptional({
    description: 'Customer contact phone number',
    example: '+249912345678',
  })
  @IsString()
  @IsOptional()
  customerPhone?: string;

  @ApiPropertyOptional({
    description: 'Custom subscription price (defaults to profile price if not specified)',
    example: 6000,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({
    description: 'Subscription billing cycle',
    enum: BillingCycle,
    default: BillingCycle.MONTHLY,
  })
  @IsEnum(BillingCycle)
  @IsOptional()
  billingCycle?: BillingCycle;

  @ApiPropertyOptional({
    description: 'Expiration date/time (ISO 8601 string)',
    example: '2026-11-12T00:00:00.000Z',
  })
  @IsOptional()
  expiresAt?: string | Date;

  @ApiPropertyOptional({
    description: 'Administrative or installation notes',
    example: 'Fiber terminal box #4, 2nd floor',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
