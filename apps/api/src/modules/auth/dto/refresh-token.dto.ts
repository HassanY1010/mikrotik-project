import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiPropertyOptional({
    description: 'Refresh token string (can also be passed automatically via httpOnly cookie)',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
