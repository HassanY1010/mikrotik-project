import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterTenantDto {
  @ApiProperty({
    example: 'شبكة الشروق هوت سبوت',
    description: 'Tenant network or business name',
  })
  @IsString()
  @IsNotEmpty({ message: 'Tenant name is required' })
  @MinLength(3, { message: 'Tenant name must be at least 3 characters' })
  @MaxLength(100, { message: 'Tenant name cannot exceed 100 characters' })
  tenantName!: string;

  @ApiProperty({
    example: 'al-shorooq',
    description: 'Unique URL slug for the tenant (alphanumeric and dashes only)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Slug is required' })
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug can only contain lowercase letters, numbers, and hyphens',
  })
  @MinLength(3, { message: 'Slug must be at least 3 characters' })
  @MaxLength(50, { message: 'Slug cannot exceed 50 characters' })
  slug!: string;

  @ApiProperty({
    example: 'محمد عبدالله',
    description: 'Full name of the primary administrator',
  })
  @IsString()
  @IsNotEmpty({ message: 'Admin full name is required' })
  @MinLength(3, { message: 'Full name must be at least 3 characters' })
  adminFullName!: string;

  @ApiProperty({
    example: 'admin@al-shorooq.local',
    description: 'Admin email for login and critical notifications',
  })
  @IsEmail({}, { message: 'Invalid admin email address' })
  @IsNotEmpty({ message: 'Admin email is required' })
  adminEmail!: string;

  @ApiProperty({
    example: 'SecurePass@2026',
    description: 'Admin password (min 8 chars)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Admin password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  adminPassword!: string;

  @ApiPropertyOptional({
    example: '+967771122334',
    description: 'Contact phone number',
  })
  @IsOptional()
  @IsString()
  adminPhone?: string;

  @ApiPropertyOptional({
    example: 'YER',
    description: 'Primary currency code (e.g. YER, SAR, USD)',
    default: 'YER',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  currency?: string;

  @ApiPropertyOptional({
    example: 'BASIC',
    description: 'Selected subscription plan (BASIC, PRO, BUSINESS)',
    default: 'BASIC',
  })
  @IsOptional()
  @IsString()
  planName?: string;
}
