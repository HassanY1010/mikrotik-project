import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProvisionPreviewDto } from './provision-preview.dto';

export class ProvisionApplyDto extends ProvisionPreviewDto {
  @ApiProperty({
    description: 'Explicit confirmation from user when applying Clean Setup on an in-use router',
    example: true,
  })
  @IsBoolean()
  declare cleanSetupConfirmed: boolean;

  @ApiPropertyOptional({
    description: 'Explicitly allow overwriting or adapting detected conflicting configurations',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  declare allowOverwrite?: boolean;

  @ApiPropertyOptional({
    description: 'Skip provisioning if pre-backup fails (safety mechanism)',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  declare skipBackupOnError?: boolean;

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
  declare updateRouterHostIfChanged?: boolean;

  @ApiPropertyOptional({
    description: 'Optional custom password for the pre-configuration backup (useful for lab / offline manual recovery)',
    example: 'LabSecret2026!',
  })
  @IsString()
  @IsOptional()
  @MinLength(8, { message: 'يجب ألا تقل كلمة مرور النسخة الاحتياطية عن 8 خانات' })
  @MaxLength(64, { message: 'يجب ألا تتجاوز كلمة مرور النسخة الاحتياطية 64 خانة' })
  customBackupPassword?: string;

  @ApiPropertyOptional({
    description: 'Execution mode: "LOCAL" (executed by mobile client locally) or "CLOUD" (executed by backend server)',
    default: 'CLOUD',
  })
  @IsString()
  @IsOptional()
  executionMode?: 'LOCAL' | 'CLOUD';

  @ApiPropertyOptional({
    description: 'If executed locally by client, provide the execution result to record in audit log and session',
  })
  @IsOptional()
  clientExecutionResult?: any;

  @ApiPropertyOptional({
    description: 'Signed plan token returned by preview step for cryptographic verification upon apply',
  })
  @IsOptional()
  planToken?: any;
}

