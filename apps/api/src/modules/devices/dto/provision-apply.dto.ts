import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProvisionPreviewDto } from './provision-preview.dto';

export class ProvisionApplyDto extends ProvisionPreviewDto {
  @ApiPropertyOptional({
    description: 'Explicit confirmation from user when applying Clean Setup on an in-use router',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  cleanSetupConfirmed?: boolean;

  @ApiPropertyOptional({
    description: 'Explicitly allow overwriting or adapting detected conflicting configurations',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  allowOverwrite?: boolean;

  @ApiPropertyOptional({
    description: 'Skip provisioning if pre-backup fails (safety mechanism)',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  skipBackupOnError?: boolean;

  @ApiPropertyOptional({
    description: 'Custom name for the pre-configuration backup',
    example: 'my-router-pre-provision',
  })
  @IsString()
  @IsOptional()
  customBackupName?: string;

  @ApiPropertyOptional({
    description: 'Update the saved device host IP in SudaFi if the management IP changes to the new gateway',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  updateRouterHostIfChanged?: boolean;

  @ApiPropertyOptional({
    description: 'Optional custom password for the pre-configuration backup (useful for lab / offline manual recovery)',
    example: 'LabSecret2026!',
  })
  @IsString()
  @IsOptional()
  @MinLength(8, { message: 'يجب ألا تقل كلمة مرور النسخة الاحتياطية عن 8 خانات' })
  @MaxLength(64, { message: 'يجب ألا تتجاوز كلمة مرور النسخة الاحتياطية 64 خانة' })
  customBackupPassword?: string;
}

