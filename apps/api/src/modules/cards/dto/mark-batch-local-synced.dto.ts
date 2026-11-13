import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class MarkBatchLocalSyncedDto {
  @ApiPropertyOptional({
    description: 'Usernames that were successfully provisioned on the local router',
    type: [String],
    example: ['user101', 'user102'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  syncedUsernames?: string[];

  @ApiPropertyOptional({
    description: 'Usernames that failed during local provisioning',
    type: [String],
    example: [],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  failedUsernames?: string[];

  @ApiPropertyOptional({
    description: 'Error message if any cards failed to provision',
    example: 'Socket timeout during local provisioning',
  })
  @IsString()
  @IsOptional()
  syncError?: string;
}
