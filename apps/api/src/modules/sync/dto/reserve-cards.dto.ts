import { IsInt, IsNotEmpty, IsUUID, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReserveCardsDto {
  @ApiProperty({ description: 'Target MikroTik router ID (UUID)' })
  @IsUUID()
  @IsNotEmpty()
  deviceId!: string;

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
