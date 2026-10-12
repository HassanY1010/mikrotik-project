import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DisconnectPppoeSessionDto {
  @ApiPropertyOptional({
    description: 'Subscriber username to disconnect',
    example: 'user_001_home',
  })
  @IsString()
  @IsOptional()
  username?: string;

  @ApiPropertyOptional({
    description: 'MikroTik session ID string to disconnect',
    example: 'sess-p001',
  })
  @IsString()
  @IsOptional()
  sessionId?: string;
}
