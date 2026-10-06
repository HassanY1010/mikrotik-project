import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBatchDto {
  @ApiPropertyOptional({ description: 'Target MikroTik Device ID (UUID)' })
  @IsUUID()
  @IsOptional()
  deviceId?: string;

  @ApiProperty({ description: 'Target Hotspot Profile ID (UUID)' })
  @IsUUID()
  @IsNotEmpty()
  profileId!: string;

  @ApiPropertyOptional({
    description: 'Number of cards to generate in this batch (1-5000)',
    example: 100,
    default: 100,
  })
  @IsInt()
  @Min(1)
  @Max(5000)
  @IsOptional()
  totalCards?: number;

  @ApiPropertyOptional({ description: 'Alias for totalCards (quantity)', example: 100 })
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({ description: 'Optional prefix for code (e.g. "N")', example: 'N' })
  @IsString()
  @MaxLength(10)
  @IsOptional()
  prefix?: string;

  @ApiPropertyOptional({ description: 'Length of random code', example: 8, default: 8 })
  @IsInt()
  @Min(4)
  @Max(16)
  @IsOptional()
  length?: number;

  @ApiPropertyOptional({ description: 'Alias for length (codeLength)', example: 8 })
  @IsOptional()
  codeLength?: number;

  @ApiPropertyOptional({
    description: 'Code pattern type',
    enum: ['NUMERIC', 'ALPHANUMERIC', 'ALPHABETIC', 'HEX'],
    default: 'NUMERIC',
  })
  @IsIn(['NUMERIC', 'ALPHANUMERIC', 'ALPHABETIC', 'HEX'])
  @IsOptional()
  pattern?: 'NUMERIC' | 'ALPHANUMERIC' | 'ALPHABETIC' | 'HEX';

  @ApiPropertyOptional({ description: 'Selling price per card in tenant currency', example: 500 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({ description: 'Validity duration in days once activated', example: 30 })
  @IsInt()
  @Min(1)
  @IsOptional()
  validityDays?: number;

  @ApiPropertyOptional({
    description: 'RouterOS session time limit (e.g. "1h", "2h", "1d")',
    example: '1h',
  })
  @IsString()
  @IsOptional()
  timeLimit?: string;

  @ApiPropertyOptional({
    description: 'Data limit quota in Megabytes (e.g. 1024 for 1GB)',
    example: 1024,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  dataLimitMb?: number;

  @ApiPropertyOptional({
    description:
      'If true, card username equals card password (PIN-only login). If false, separate PIN is generated.',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  singleUserPin?: boolean;

  @ApiPropertyOptional({
    description: 'Whether to immediately provision cards on the MikroTik router',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  syncToRouter?: boolean;
}
