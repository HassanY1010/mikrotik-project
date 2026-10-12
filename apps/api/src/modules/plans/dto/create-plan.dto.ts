import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreatePlanDto {
  @ApiProperty({ example: 'ENTERPRISE', description: 'Unique code/slug for the plan' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'باقة الشركات الكبرى', description: 'Arabic display name' })
  @IsString()
  @IsNotEmpty()
  nameAr!: string;

  @ApiPropertyOptional({ example: 'باقة مخصصة لشبكات الألياف والشركات الكبيرة', description: 'Plan description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 10, description: 'Maximum allowed MikroTik routers' })
  @IsNumber()
  @Min(1)
  maxRouters!: number;

  @ApiProperty({ example: 100, description: 'Monthly price in SDG or USD' })
  @IsNumber()
  @Min(0)
  priceMonthly!: number;

  @ApiProperty({ example: 1000, description: 'Yearly price in SDG or USD' })
  @IsNumber()
  @Min(0)
  priceYearly!: number;

  @ApiPropertyOptional({
    description: 'Dynamic features configuration including cardGenerationLimit, isUnlimited, etc.',
    example: {
      cardGenerationLimit: 500000,
      isUnlimited: false,
      a4Printing: true,
      thermalPrinting: true,
      offlineSales: true,
      multiCashier: true,
      advancedReports: true,
      customTemplates: true,
    },
  })
  @IsOptional()
  @IsObject()
  features?: Record<string, any>;

  @ApiPropertyOptional({ example: true, description: 'Whether the plan is active for subscriptions' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
