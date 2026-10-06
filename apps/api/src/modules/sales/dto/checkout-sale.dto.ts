import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class CheckoutSaleDto {
  @ApiProperty({ description: 'Target MikroTik router device ID (UUID)' })
  @IsUUID()
  @IsNotEmpty()
  deviceId!: string;

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
    description: 'Payment method used',
    enum: PaymentMethod,
    default: PaymentMethod.CASH,
  })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

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
  @Max(10)
  @IsOptional()
  quantity?: number;
}
