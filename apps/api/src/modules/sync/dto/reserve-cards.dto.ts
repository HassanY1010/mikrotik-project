import { IsInt, IsNotEmpty, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReserveCardsDto {
  @ApiPropertyOptional({ description: 'Target MikroTik router ID (UUID, optional if bound to profile)' })
  @IsUUID()
  @IsOptional()
  deviceId?: string;

  @ApiProperty({ description: 'Hotspot profile ID to reserve cards from (UUID)' })
  @IsUUID()
  @IsNotEmpty()
  profileId!: string;

  @ApiProperty({
    description: 'Quantity of cards to reserve for offline wallet (1-100)',
    example: 20,
    default: 20,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;
}
