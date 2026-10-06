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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTemplateDto {
  @ApiProperty({ description: 'Template name', example: 'Default 85x54 Business Card' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Width in millimeters', example: 85, default: 85 })
  @IsInt()
  @Min(20)
  @Max(300)
  @IsOptional()
  widthMm?: number;

  @ApiPropertyOptional({ description: 'Height in millimeters', example: 54, default: 54 })
  @IsInt()
  @Min(20)
  @Max(300)
  @IsOptional()
  heightMm?: number;

  @ApiPropertyOptional({
    description: 'Orientation',
    enum: ['landscape', 'portrait'],
    default: 'landscape',
  })
  @IsIn(['landscape', 'portrait'])
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
  @IsObject()
  @IsNotEmpty()
  layoutConfig!: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Set as tenant default template', default: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
