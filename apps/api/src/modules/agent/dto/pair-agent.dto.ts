import { IsString, Matches, Length, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PairAgentDto {
  @ApiPropertyOptional({
    description: 'Six-digit one-time pairing code',
    example: '482910',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Pairing code must be exactly 6 digits' })
  pairingCode?: string;

  @ApiPropertyOptional({
    description: 'Six-digit one-time pairing code (alias for pairingCode)',
    example: '482910',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Pairing code must be exactly 6 digits' })
  code?: string;

  @ApiProperty({
    description: 'Host machine hostname or friendly identifier',
    example: 'Cashier-POS-PC',
  })
  @IsString()
  @Length(2, 100, { message: 'Agent name must be between 2 and 100 characters' })
  name!: string;

  @ApiPropertyOptional({
    description: 'Agent software version',
    example: '1.0.0',
  })
  @IsOptional()
  @IsString()
  version?: string;
}
