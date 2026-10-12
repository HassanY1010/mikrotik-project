import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdatePppoeProfileDto {
  @ApiPropertyOptional({
    description: 'Updated name of the PPPoE profile',
    example: '15Mbps-Home',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated rate limit in MikroTik format',
    example: '15M/15M',
  })
  @IsString()
  @IsOptional()
  rateLimit?: string;

  @ApiPropertyOptional({
    description: 'Gateway IP address or pool name',
    example: '10.100.0.1',
  })
  @IsString()
  @IsOptional()
  localAddress?: string;

  @ApiPropertyOptional({
    description: 'Client IP pool name or static IP',
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
    description: 'Restricts simultaneous logins to 1',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  onlyOne?: boolean;

  @ApiPropertyOptional({
    description: 'Subscription price in local currency',
    example: 7000,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({
    description: 'Description of the package',
    example: 'Upgraded residential broadband package',
  })
  @IsString()
  @IsOptional()
  description?: string;
}
