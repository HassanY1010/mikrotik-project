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

export class CreateDeviceDto {
  @ApiProperty({ description: 'Router name / identifier', example: 'Main Branch Gateway' })
  @IsString()
  @IsNotEmpty()
  name!: string;

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

  @ApiPropertyOptional({ description: 'Router port alias (mapped to apiPort or restPort)', example: 8728 })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  port?: number;

  @ApiPropertyOptional({ description: 'Use SSL/TLS for API connection', default: false })
  @IsBoolean()
  @IsOptional()
  useSsl?: boolean;

  @ApiPropertyOptional({ description: 'Alias for useSsl', default: false })
  @IsBoolean()
  @IsOptional()
  useTls?: boolean;

  @ApiPropertyOptional({ description: 'Connection type (e.g. API_SOCKET, REST)', example: 'API_SOCKET' })
  @IsString()
  @IsOptional()
  connectionType?: string;

  @ApiProperty({ description: 'Router administrative username', example: 'admin' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({
    description: 'Router administrative password (encrypted at rest)',
    example: 'RouterPassword123!',
  })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiPropertyOptional({ enum: RouterOsVersion, default: RouterOsVersion.V7 })
  @IsEnum(RouterOsVersion)
  @IsOptional()
  rosVersion?: RouterOsVersion;
}
