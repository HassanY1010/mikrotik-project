import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreatePppoeProfileDto {
  @ApiProperty({
    description: 'Name of the PPPoE profile (e.g. 10Mbps-Home, Fiber-VIP)',
    example: '10Mbps-Home',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    description: 'Rate limit in MikroTik rx/tx format (e.g. 5M/10M or 10M/10M)',
    example: '5M/10M',
  })
  @IsString()
  @IsOptional()
  rateLimit?: string;

  @ApiPropertyOptional({
    description: 'Gateway IP address or pool name (local-address in MikroTik)',
    example: '10.100.0.1',
  })
  @IsString()
  @IsOptional()
  localAddress?: string;

  @ApiPropertyOptional({
    description: 'Client IP pool name or static IP (remote-address in MikroTik)',
    example: 'pppoe-pool',
  })
  @IsString()
  @IsOptional()
  remoteAddress?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated DNS server addresses',
    example: '8.8.8.8,1.1.1.1',
  })
  @IsString()
  @IsOptional()
  dnsServers?: string;

  @ApiPropertyOptional({
    description: 'Restricts simultaneous logins with the same secret to 1',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  onlyOne?: boolean;

  @ApiPropertyOptional({
    description: 'Monthly/periodic price for this profile subscription in local currency',
    example: 5000,
    default: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({
    description: 'Optional human-readable description of the package',
    example: 'Residential 10 Mbps unlimited broadband plan',
  })
  @IsString()
  @IsOptional()
  description?: string;
}
