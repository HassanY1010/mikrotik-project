import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CardStatus } from '@prisma/client';

export class UpdateCardStatusDto {
  @ApiProperty({ enum: CardStatus, example: CardStatus.DISABLED })
  @IsEnum(CardStatus)
  @IsNotEmpty()
  status!: CardStatus;

  @ApiPropertyOptional({
    description: 'Reason for status update',
    example: 'Damaged card reported by customer',
  })
  @IsString()
  @IsOptional()
  reason?: string;
}
