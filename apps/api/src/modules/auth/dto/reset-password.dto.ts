import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiPropertyOptional({
    example: 'admin@alnoor-wifi.local',
    description: 'Registered user email address (required when resetting using code)',
  })
  @IsOptional()
  @IsEmail({}, { message: 'صيغة البريد الإلكتروني غير صحيحة' })
  email?: string;

  @ApiPropertyOptional({
    example: '123456',
    description: '6-digit verification code received by email',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({
    example: '4d87f9e8a7c2b5d4e1f0...',
    description: 'Cryptographic reset token received via link or code verification',
  })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiProperty({
    example: 'NewSecretPass@2026',
    description: 'New password (minimum 8 characters)',
  })
  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور الجديدة مطلوبة' })
  @MinLength(8, { message: 'كلمة المرور يجب ألا تقل عن 8 أحرف' })
  newPassword!: string;

  @ApiPropertyOptional({
    example: 'NewSecretPass@2026',
    description: 'Confirmation of new password',
  })
  @IsOptional()
  @IsString()
  confirmPassword?: string;
}
