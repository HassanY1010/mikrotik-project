import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class AssignDevicesDto {
  @ApiProperty({
    description: 'List of MikroTik device IDs assigned to the user',
    type: [String],
    example: ['d290f1ee-6c54-4b01-90e6-d701748f0851'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  deviceIds!: string[];
}
