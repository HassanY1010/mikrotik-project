import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RestoreBackupDto {
  @ApiProperty({
    description: 'Name of the backup file stored on the router',
    example: 'pre-sudafi-2026-10-23.backup',
  })
  @IsNotEmpty({ message: 'اسم ملف النسخة الاحتياطية مطلوب' })
  @IsString()
  @MaxLength(128)
  filename: string;

  @ApiPropertyOptional({
    description: 'Decryption password if the backup was encrypted',
    example: 'RouterP@ss2026',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  password?: string;

  @ApiProperty({
    description: 'Explicit confirmation that user understands router will reboot and overwrite config',
    example: true,
  })
  @IsNotEmpty({ message: 'التأكيد الصريح مطلوب لبدء الاستعادة' })
  @IsBoolean()
  confirmed: boolean;
}
