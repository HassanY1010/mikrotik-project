import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class AssignPermissionsDto {
  @ApiProperty({
    description: 'List of permission codes granted directly to the user',
    type: [String],
    example: ['reports:view', 'finance:view'],
  })
  @IsArray()
  @IsString({ each: true })
  permissionCodes!: string[];
}
