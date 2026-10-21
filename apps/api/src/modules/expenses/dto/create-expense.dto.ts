import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategory, PaymentMethod } from '@prisma/client';

export class CreateExpenseDto {
  @ApiProperty({ description: 'عنوان أو بند المصروف', example: 'اشتراك إنترنت فايبر شهري' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ enum: ExpenseCategory, default: ExpenseCategory.OTHER })
  @IsEnum(ExpenseCategory)
  category!: ExpenseCategory;

  @ApiProperty({ description: 'المبلغ الإجمالي للمصروف', example: 15000.0 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({ description: 'عملة المصروف', default: 'SDG' })
  @IsString()
  @IsOptional()
  currency?: string = 'SDG';

  @ApiPropertyOptional({ description: 'تاريخ حدوث المصروف (ISO)', example: '2026-10-21' })
  @IsDateString()
  @IsOptional()
  expenseDate?: string;

  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod = PaymentMethod.CASH;

  @ApiPropertyOptional({ description: 'الجهة المستفيدة أو المورد', example: 'شركة سوداتل' })
  @IsString()
  @IsOptional()
  vendor?: string;

  @ApiPropertyOptional({ description: 'ملاحظات وتفاصيل إضافية عن المصروف' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'رابط إيصال أو فاتورة الدفع إن وجد' })
  @IsString()
  @IsOptional()
  receiptUrl?: string;
}
