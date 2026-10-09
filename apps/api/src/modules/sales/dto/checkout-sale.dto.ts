import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CheckoutSaleDto {
  @ApiPropertyOptional({ description: 'Target MikroTik router device ID (UUID). Auto-resolved from profile if omitted.' })
  @IsUUID()
  @IsOptional()
  deviceId?: string;

  @ApiProperty({ description: 'Hotspot profile ID to sell card from (UUID)' })
  @IsUUID()
  @IsNotEmpty()
  profileId!: string;

  @ApiPropertyOptional({
    description: 'Specific card ID to sell (if selling a physical card with known ID)',
  })
  @IsUUID()
  @IsOptional()
  cardId?: string;

  @ApiPropertyOptional({
    description: 'Payment method used (CASH, BANK, CASH_FAWRI, MOBILE_WALLET, TRANSFER, CARD)',
    default: 'CASH',
  })
  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: 'Customer phone number for digital receipt' })
  @IsString()
  @IsOptional()
  customerPhone?: string;

  @ApiPropertyOptional({ description: 'Customer name' })
  @IsString()
  @IsOptional()
  customerName?: string;

  @ApiPropertyOptional({ description: 'Quantity of cards to sell', example: 1, default: 1 })
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({ description: 'Unique idempotency key to prevent duplicate sales on network retries' })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
