import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    example: 'كاشير المحل 2',
    description: 'User full name',
  })
  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  @MinLength(3)
  fullName!: string;

  @ApiProperty({
    example: 'cashier2@alnoor-wifi.local',
    description: 'Email address for login',
  })
  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @ApiProperty({
    example: 'Pass@123456',
    description: 'Initial password',
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8)
  password!: string;

  @ApiProperty({
    example: 'CASHIER',
    description: 'Role name (CASHIER or MANAGER)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Role is required' })
  roleName!: string;

  @ApiPropertyOptional({
    example: '+967771234560',
    description: 'User phone number',
  })
  @IsOptional()
  @IsString()
  phone?: string;
}
