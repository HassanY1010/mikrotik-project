import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserStatus } from '@prisma/client';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'أحمد الجديد' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  fullName?: string;

  @ApiPropertyOptional({ example: '+967770011223' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'MANAGER' })
  @IsOptional()
  @IsString()
  roleName?: string;

  @ApiPropertyOptional({ enum: UserStatus, example: UserStatus.ACTIVE })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
