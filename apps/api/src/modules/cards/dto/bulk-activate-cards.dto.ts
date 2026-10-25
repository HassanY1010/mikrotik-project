import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ArrayNotEmpty, IsString } from 'class-validator';

export class BulkActivateCardsDto {
  @ApiProperty({
    description: 'Array of card IDs to activate / re-enable on the system and MikroTik routers',
    example: ['c1a2b3c4-d5e6-7890-abcd-ef1234567890'],
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'يجب اختيار كرت واحد على الأقل لتنفيذ التفعيل' })
  @IsString({ each: true, message: 'معرف الكرت يجب أن يكون نصياً صالحاً' })
  cardIds!: string[];
}
