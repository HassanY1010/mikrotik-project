import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { BillingCycle } from '@prisma/client';

export class ApproveSubscriptionDto {
  @ApiProperty({
    example: 'PRO',
    description: 'Subscription plan name (BASIC, PRO, BUSINESS)',
  })
  @IsString()
  @IsNotEmpty()
  planName!: string;

  @ApiProperty({
    enum: BillingCycle,
    example: BillingCycle.MONTHLY,
    description: 'Billing cycle (MONTHLY, YEARLY)',
  })
  @IsEnum(BillingCycle)
  @IsNotEmpty()
  billingCycle!: BillingCycle;

  @ApiPropertyOptional({
    example: 12,
    description: 'Duration in months (default: 1 for monthly, 12 for yearly)',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  durationMonths?: number;

  @ApiPropertyOptional({
    example: 'تم استلام الحوالة نقدًا وتفعيل الاشتراك لمدة سنة',
    description: 'Super admin approval notes',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
