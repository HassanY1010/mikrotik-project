import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateBackupDto {
  @ApiPropertyOptional({
    description: 'Custom backup file name (without extension)',
    example: 'sudafi_backup_main',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @ApiPropertyOptional({
    description: 'Optional encryption password for the backup file',
    example: 'RouterP@ss2026',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  password?: string;
}

export class RecordLocalBackupDto {
  @ApiProperty({ description: 'Created backup filename on router flash', example: 'sudafi_backup.backup' })
  @IsString()
  @MaxLength(128)
  filename!: string;

  @ApiPropertyOptional({ description: 'Backup size in bytes' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  size?: number;

  @ApiPropertyOptional({ description: 'Creation time reported by RouterOS' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  creationTime?: string;
}
