import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCardPdfArchiveDto {
  @ApiProperty({ description: 'File name of the PDF', example: 'SudaFi_Batch_100_Cards.pdf' })
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiProperty({ description: 'Number of cards in the PDF', example: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cardCount!: number;

  @ApiPropertyOptional({ description: 'Template type or preset', example: 'FOOTBALL' })
  @IsOptional()
  @IsString()
  templateType?: string;

  @ApiPropertyOptional({ description: 'Network or branding title', example: 'سودافاي | SudaFi Net' })
  @IsOptional()
  @IsString()
  networkName?: string;

  @ApiPropertyOptional({ description: 'Profile name associated with cards', example: 'HR (يوم واحد)' })
  @IsOptional()
  @IsString()
  profileName?: string;

  @ApiPropertyOptional({ description: 'Batch ID if associated with a generated batch' })
  @IsOptional()
  @IsString()
  batchId?: string;

  @ApiPropertyOptional({ description: 'JSON metadata for print layout and styles', type: 'string' })
  @IsOptional()
  @IsString()
  metadata?: string;
}
