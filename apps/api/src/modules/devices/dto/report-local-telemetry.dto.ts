import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RouterOsVersion } from '@prisma/client';

export class ReportLocalTelemetryDto {
  @ApiProperty({ description: 'Whether the local LAN probe succeeded' })
  @IsBoolean()
  isOnline!: boolean;

  @ApiPropertyOptional({
    description: 'Reported local connectivity status',
    enum: ['ONLINE', 'OFFLINE', 'ERROR'],
  })
  @IsOptional()
  @IsIn(['ONLINE', 'OFFLINE', 'ERROR'])
  status?: 'ONLINE' | 'OFFLINE' | 'ERROR';

  @ApiPropertyOptional({
    description: 'ISO-8601 UTC timestamp when the mobile probe verified the router',
  })
  @IsOptional()
  @IsISO8601()
  verifiedAt?: string;

  @ApiPropertyOptional({
    description: 'Host/IP address verified locally by the mobile client (must match registered host)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reportedHost?: string;

  @ApiPropertyOptional({ description: 'Measured local probe latency in milliseconds' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60000)
  latencyMs?: number;

  @ApiPropertyOptional({ description: 'Router CPU load percentage (0-100)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  cpuLoad?: number;

  @ApiPropertyOptional({ description: 'Free RAM in bytes' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  memoryFree?: number;

  @ApiPropertyOptional({ description: 'Total RAM in bytes' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  memoryTotal?: number;

  @ApiPropertyOptional({ description: 'Free disk/storage in bytes' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  diskFree?: number;

  @ApiPropertyOptional({ description: 'Total disk/storage in bytes' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  diskTotal?: number;

  @ApiPropertyOptional({ description: 'RouterOS reported uptime string' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  uptime?: string;

  @ApiPropertyOptional({ description: 'Router hardware board/model name' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  modelName?: string;

  @ApiPropertyOptional({ enum: RouterOsVersion })
  @IsOptional()
  @IsEnum(RouterOsVersion)
  rosVersion?: RouterOsVersion;

  @ApiPropertyOptional({ description: 'Raw RouterOS firmware version string (e.g. 7.23.8)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  versionString?: string;

  @ApiPropertyOptional({ description: 'Live Hotspot active session count read locally' })
  @IsOptional()
  @IsInt()
  @Min(0)
  activeHotspotSessions?: number;

  @ApiPropertyOptional({ description: 'Structured failure code if offline/error' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  errorCode?: string;

  @ApiPropertyOptional({ description: 'Error description if probe failed' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  lastError?: string;

  @ApiPropertyOptional({ description: 'Protocol used for local probe (REST / API_SOCKET)' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  protocol?: string;
}
