import { IsArray, IsString, ArrayNotEmpty, ArrayMaxSize, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BulkDeleteCardsDto {
  @ApiProperty({
    description: 'Array of card UUIDs to delete',
    type: [String],
    example: ['b1b9e02c-4f1e-4509-90b5-e63c0a52be22'],
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'يجب تحديد كرت واحد على الأقل للحذف' })
  @ArrayMaxSize(5000, { message: 'الحد الأقصى للعملية الواحدة هو 5000 كرت' })
  @IsString({ each: true })
  cardIds!: string[];

  @ApiPropertyOptional({
    description: 'Optional force flag for deletion',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}
