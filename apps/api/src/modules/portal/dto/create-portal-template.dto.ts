import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  HotspotPortalThemePreset,
  HotspotPortalLoginMethod,
} from '@mikrotik-saas/shared-types';

export class CreatePortalTemplateDto {
  @ApiProperty({ description: 'Template display name', example: 'تصميم الهوتسبوت الداكن' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    description: 'Theme visual preset',
    enum: HotspotPortalThemePreset,
    default: HotspotPortalThemePreset.MODERN_DARK,
  })
  @IsEnum(HotspotPortalThemePreset)
  @IsOptional()
  themePreset?: HotspotPortalThemePreset = HotspotPortalThemePreset.MODERN_DARK;

  @ApiProperty({ description: 'Network branding name', example: 'شبكة ستارلينك كوستي' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  networkName!: string;

  @ApiPropertyOptional({ description: 'Main banner title', example: 'مرحباً بكم في شبكتنا' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  title?: string = 'مرحباً بكم في شبكتنا';

  @ApiPropertyOptional({
    description: 'Subtitle / Instructions',
    example: 'سجل دخولك باستخدام كرت الإنترنت للوصول إلى شبكة عالية السرعة',
  })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  subtitle?: string = 'سجل دخولك باستخدام كرت الإنترنت للوصول إلى شبكة عالية السرعة';

  @ApiPropertyOptional({ description: 'Logo image URL or base64', example: 'https://example.com/logo.png' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Brand primary color (Hex)', example: '#0EA5E9' })
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'primaryColor must be a valid 6-char hex color (#RRGGBB)' })
  @IsOptional()
  primaryColor?: string = '#0EA5E9';

  @ApiPropertyOptional({ description: 'Accent/Button color (Hex)', example: '#10B981' })
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'accentColor must be a valid 6-char hex color (#RRGGBB)' })
  @IsOptional()
  accentColor?: string = '#10B981';

  @ApiPropertyOptional({ description: 'Page background color (Hex)', example: '#0F172A' })
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'backgroundColor must be a valid 6-char hex color (#RRGGBB)' })
  @IsOptional()
  backgroundColor?: string = '#0F172A';

  @ApiPropertyOptional({ description: 'Card surface color (Hex)', example: '#1E293B' })
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'cardColor must be a valid 6-char hex color (#RRGGBB)' })
  @IsOptional()
  cardColor?: string = '#1E293B';

  @ApiPropertyOptional({ description: 'Text color (Hex)', example: '#F8FAFC' })
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'textColor must be a valid 6-char hex color (#RRGGBB)' })
  @IsOptional()
  textColor?: string = '#F8FAFC';

  @ApiPropertyOptional({
    description: 'Login input mode',
    enum: HotspotPortalLoginMethod,
    default: HotspotPortalLoginMethod.VOUCHER,
  })
  @IsEnum(HotspotPortalLoginMethod)
  @IsOptional()
  loginMethod?: HotspotPortalLoginMethod = HotspotPortalLoginMethod.VOUCHER;

  @ApiPropertyOptional({ description: 'Whether to show remaining time/data notice', default: true })
  @IsBoolean()
  @IsOptional()
  showRemainingTime?: boolean = true;

  @ApiPropertyOptional({ description: 'Customer support / contact phone', example: '0912345678' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  contactPhone?: string;

  @ApiPropertyOptional({ description: 'Terms of service text' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  termsText?: string;

  @ApiPropertyOptional({ description: 'Footer copyright or powered-by text' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  footerText?: string = 'مدعوم بواسطة منصة SudaFi';

  @ApiPropertyOptional({ description: 'Sanitized custom CSS rules' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  customCss?: string;

  @ApiPropertyOptional({ description: 'Set as default template for this network', default: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean = false;
}
