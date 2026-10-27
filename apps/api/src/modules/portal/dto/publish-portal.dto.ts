import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, Matches, IsArray, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PortalFileItemDto {
  @IsString()
  name: string;

  @IsString()
  content: string;

  @IsString()
  @IsOptional()
  encoding?: 'utf-8' | 'base64';
}

export class PublishPortalDto {
  @ApiPropertyOptional({ description: 'ID of the template to compile and publish' })
  @IsUUID('4', { message: 'templateId must be a valid UUID' })
  @IsOptional()
  templateId?: string;

  @ApiPropertyOptional({
    description: 'Target directory name on the router',
    example: 'hotspot',
    default: 'hotspot',
  })
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]+$/, { message: 'directoryName must be alphanumeric (no spaces or slashes)' })
  @IsOptional()
  directoryName?: string = 'hotspot';

  @ApiPropertyOptional({
    description: 'HotSpot Server Profile to assign html-directory to',
    example: 'hsprof1',
  })
  @IsString()
  @IsOptional()
  applyToProfile?: string;

  @ApiPropertyOptional({
    description: 'Custom portal files imported from user device (HTML, CSS, JS, images)',
    type: [PortalFileItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PortalFileItemDto)
  @IsOptional()
  files?: PortalFileItemDto[];

  @ApiPropertyOptional({
    description: 'Explicit user confirmation to overwrite existing files in the hotspot directory',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  overwriteConfirmed?: boolean;

  @ApiPropertyOptional({ description: 'Theme preset to compile if templateId not specified', example: 'MODERN_DARK' })
  @IsString()
  @IsOptional()
  themePreset?: string;

  @ApiPropertyOptional({ description: 'Custom network name to display on the portal', example: 'شبكة ستارلينك' })
  @IsString()
  @IsOptional()
  networkName?: string;

  @ApiPropertyOptional({ description: 'Login method (VOUCHER, USER_PASS, or BOTH)', example: 'VOUCHER' })
  @IsString()
  @IsOptional()
  loginMethod?: string;

  @ApiPropertyOptional({ description: 'Custom title to display on the portal' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Custom subtitle to display on the portal' })
  @IsString()
  @IsOptional()
  subtitle?: string;

  @ApiPropertyOptional({ description: 'Custom footer text to display on the portal' })
  @IsString()
  @IsOptional()
  footerText?: string;
}
