import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SyncPullQueryDto {
  @ApiPropertyOptional({ description: 'Fetch updates occurring after this ISO timestamp' })
  @IsDateString()
  @IsOptional()
  since?: string;

  @ApiPropertyOptional({ description: 'Filter delta updates by device ID' })
  @IsUUID()
  @IsOptional()
  deviceId?: string;
}
