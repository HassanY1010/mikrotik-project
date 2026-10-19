import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({
    example: 'SecretPass@2026',
    description: 'Current user password required to authorize permanent account deletion',
  })
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Current password is required to delete your account' })
  password!: string;

  @ApiPropertyOptional({
    example: 'No longer need this service',
    description: 'Optional feedback / reason for closing account',
  })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Explicit confirmation to delete tenant organization and all its network devices if user is sole admin',
  })
  @IsBoolean()
  @IsOptional()
  confirmDeleteOrganization?: boolean;
}
