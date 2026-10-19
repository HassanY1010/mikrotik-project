import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTemplateDto {
  @ApiProperty({ description: 'Template name', example: 'Default 85x54 Business Card' })
  @IsString({ message: 'اسم القالب يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم القالب مطلوب' })
  name!: string;

  @ApiPropertyOptional({ description: 'Width in millimeters', example: 85, default: 85 })
  @Type(() => Number)
  @IsInt({ message: 'عرض الكرت يجب أن يكون رقماً صحيحاً بالمليمتر' })
  @Min(10, { message: 'أقل عرض مسموح به هو 10 مم' })
  @Max(1000, { message: 'أقصى عرض مسموح به هو 1000 مم' })
  @IsOptional()
  widthMm?: number;

  @ApiPropertyOptional({ description: 'Height in millimeters', example: 54, default: 54 })
  @Type(() => Number)
  @IsInt({ message: 'ارتفاع الكرت يجب أن يكون رقماً صحيحاً بالمليمتر' })
  @Min(10, { message: 'أقل ارتفاع مسموح به هو 10 مم' })
  @Max(1000, { message: 'أقصى ارتفاع مسموح به هو 1000 مم' })
  @IsOptional()
  heightMm?: number;

  @ApiPropertyOptional({
    description: 'Orientation',
    enum: ['landscape', 'portrait'],
    default: 'landscape',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase().trim() : value))
  @IsIn(['landscape', 'portrait'], { message: 'الاتجاه يجب أن يكون إما أفقي (landscape) أو عمودي (portrait)' })
  @IsOptional()
  orientation?: string;

  @ApiPropertyOptional({ description: 'Background image URL or base64 pattern' })
  @IsString()
  @IsOptional()
  backgroundDesign?: string;

  @ApiProperty({
    description: 'JSON layout configuration (positions, font sizes, QR visibility)',
    example: {
      showQr: true,
      qrSizeMm: 24,
      showPin: true,
      showPrice: true,
      showValidity: true,
      networkName: 'شبكة النور هوت سبوت',
      instructions: 'اتصل بالشبكة وامسح الرمز لتسجيل الدخول الفوري',
    },
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value ?? {};
  })
  @IsObject({ message: 'إعدادات عناصر الكرت layoutConfig يجب أن تكون كائناً صحيحاً' })
  @IsOptional()
  layoutConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Theme preset style', example: 'FOOTBALL' })
  @IsString()
  @IsOptional()
  themePreset?: string;

  @ApiPropertyOptional({ description: 'Primary hex color', example: '#1E3A8A' })
  @IsString()
  @IsOptional()
  primaryColor?: string;

  @ApiPropertyOptional({ description: 'Accent hex color', example: '#10B981' })
  @IsString()
  @IsOptional()
  accentColor?: string;

  @ApiPropertyOptional({ description: 'Set as tenant default template', default: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

