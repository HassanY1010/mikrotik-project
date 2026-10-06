import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefundSaleDto {
  @ApiProperty({
    description: 'Reason for processing refund',
    example: 'Customer purchased incorrect package',
  })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
