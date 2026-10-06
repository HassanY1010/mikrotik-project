import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProfileDto {
  @ApiProperty({
    description: 'Profile name (e.g. 1hour-unlimited, 1day-1gb)',
    example: '1hour-unlimited',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Rate limit rx/tx (e.g. 2M/2M)', example: '2M/2M' })
  @IsString()
  @IsOptional()
  rateLimit?: string;

  @ApiPropertyOptional({ description: 'Session timeout (e.g. 1h, 1d)', example: '1h' })
  @IsString()
  @IsOptional()
  sessionTimeout?: string;

  @ApiPropertyOptional({ description: 'Idle timeout (e.g. 5m)', example: '5m' })
  @IsString()
  @IsOptional()
  idleTimeout?: string;

  @ApiPropertyOptional({ description: 'Keepalive timeout (e.g. 2m)', example: '2m' })
  @IsString()
  @IsOptional()
  keepaliveTimeout?: string;

  @ApiPropertyOptional({
    description: 'Number of shared users allowed simultaneously',
    example: 1,
    default: 1,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  sharedUsers?: number;

  @ApiPropertyOptional({ description: 'RouterOS IP pool name', example: 'hs-pool-1' })
  @IsString()
  @IsOptional()
  addressPool?: string;
}
