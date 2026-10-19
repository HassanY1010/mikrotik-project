import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

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
