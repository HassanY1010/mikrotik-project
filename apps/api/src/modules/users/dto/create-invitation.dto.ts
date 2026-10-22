import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  IsArray,
  IsUUID,
} from 'class-validator';

export class CreateInvitationDto {
  @ApiProperty({
    example: 'cashier@network.local',
    description: 'Email address of the staff member to invite',
  })
  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @ApiProperty({
    example: 'عمر خالد',
    description: 'Full name of the staff member',
  })
  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  @MinLength(3)
  fullName!: string;

  @ApiPropertyOptional({
    example: '+967771234567',
    description: 'Optional phone number',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    example: 'CASHIER',
    description: 'Assigned role (e.g. CASHIER, MANAGER)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Role is required' })
  roleName!: string;

  @ApiPropertyOptional({
    description: 'Optional list of MikroTik device IDs to assign',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assignedDeviceIds?: string[];

  @ApiPropertyOptional({
    description: 'Optional list of specific permission codes',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionCodes?: string[];
}
