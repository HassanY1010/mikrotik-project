import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VALIDITY_DURATION_REGEX } from '../../../common/utils/validity-duration.util';

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

  @ApiPropertyOptional({ description: 'Session timeout (e.g. 1m, 1h, 1d)', example: '1h' })
  @IsString()
  @IsOptional()
  @Matches(VALIDITY_DURATION_REGEX, {
    message: 'مدة الصلاحية / الجلسة يجب أن تكون رقماً صحيحاً موجباً متبوعاً بوحدة m (دقيقة) أو h (ساعة) أو d (يوم)، مثل 1m أو 1h أو 1d',
  })
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

  @ApiPropertyOptional({ description: 'Price in SDG', example: 500 })
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({ description: 'Validity duration (e.g. 1m, 1h, 1d)', example: '1d' })
  @IsString()
  @IsOptional()
  @Matches(VALIDITY_DURATION_REGEX, {
    message: 'مدة الصلاحية يجب أن تكون رقماً صحيحاً موجباً متبوعاً بوحدة m (دقيقة) أو h (ساعة) أو d (يوم)، مثل 1m أو 1h أو 1d',
  })
  validity?: string;

  @ApiPropertyOptional({ description: 'Commercial display name', example: 'باقة يومية' })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional({ description: 'Router device ID', example: 'uuid' })
  @IsString()
  @IsOptional()
  deviceId?: string;

  @ApiPropertyOptional({
    description: 'Data limit in Gigabytes (e.g. 1, 5, 10). If omitted or null, package is unlimited',
    example: 5,
  })
  @IsOptional()
  @ValidateIf((o) => o.dataLimitGb !== null && o.dataLimitGb !== undefined)
  @IsNumber({}, { message: 'حجم البيانات يجب أن يكون رقماً' })
  @IsPositive({ message: 'حجم البيانات بالجيجابايت يجب أن يكون رقماً موجباً أكبر من الصفر' })
  dataLimitGb?: number | null;

  @ApiPropertyOptional({
    description: 'Data limit in raw bytes. If null or 0, package is unlimited',
    example: 5368709120,
  })
  @IsOptional()
  dataLimitBytes?: number | string | null;
}
