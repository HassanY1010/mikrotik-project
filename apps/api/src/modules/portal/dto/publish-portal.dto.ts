import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, Matches } from 'class-validator';

export class PublishPortalDto {
  @ApiPropertyOptional({ description: 'ID of the template to compile and publish' })
  @IsUUID('4', { message: 'templateId must be a valid UUID' })
  @IsOptional()
  templateId?: string;

  @ApiPropertyOptional({
    description: 'Target directory name on the router',
    example: 'hotspot',
    default: 'hotspot',
  })
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]+$/, { message: 'directoryName must be alphanumeric (no spaces or slashes)' })
  @IsOptional()
  directoryName?: string = 'hotspot';

  @ApiPropertyOptional({
    description: 'HotSpot Server Profile to assign html-directory to',
    example: 'hsprof1',
  })
  @IsString()
  @IsOptional()
  applyToProfile?: string;
}
