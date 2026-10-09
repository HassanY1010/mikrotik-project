import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RouterOsVersion } from '@prisma/client';

export class TestDeviceConnectionDto {
  @ApiPropertyOptional({ description: 'Optional router ID if testing an already registered router' })
  @IsString()
  @IsOptional()
  id?: string;

  @ApiProperty({ description: 'Router IP address or DNS hostname', example: '192.168.88.1' })
  @IsString()
  @IsNotEmpty()
  host!: string;

  @ApiPropertyOptional({ description: 'RouterOS API port', example: 8728, default: 8728 })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  apiPort?: number;

  @ApiPropertyOptional({ description: 'RouterOS REST port (v7 only)', example: 443, default: 443 })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  restPort?: number;

  @ApiPropertyOptional({ description: 'Use SSL/TLS for API connection', default: false })
  @IsBoolean()
  @IsOptional()
  useSsl?: boolean;

  @ApiProperty({ description: 'Router administrative username', example: 'admin' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiPropertyOptional({
    description: 'Router administrative password (optional if id is provided)',
    example: 'RouterPassword123!',
  })
  @IsString()
  @IsOptional()
  password?: string;

  @ApiPropertyOptional({ enum: RouterOsVersion, default: RouterOsVersion.V7 })
  @IsEnum(RouterOsVersion)
  @IsOptional()
  rosVersion?: RouterOsVersion;
}
