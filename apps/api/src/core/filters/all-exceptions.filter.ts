import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { ApiErrorResponse } from './http-exception.filter';

@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly configService: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    const requestId =
      (request.headers['x-request-id'] as string) || (request as unknown as { id?: string }).id;

    const error = exception instanceof Error ? exception : new Error(String(exception));

    this.logger.error(
      `Unhandled Exception: ${error.message}`,
      error.stack,
      JSON.stringify({
        requestId,
        path: request.url,
        method: request.method,
      }),
    );

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let errorMessage = isProduction
      ? 'An internal server error occurred. Please contact support.'
      : error.message;

    // Gracefully handle Prisma ORM errors without leaking connection credentials
    const errorRecord = error as unknown as Record<string, unknown>;
    if (errorRecord && typeof errorRecord['code'] === 'string') {
      const prismaCode = errorRecord['code'];
      if (prismaCode === 'P2002') {
        statusCode = HttpStatus.CONFLICT;
        errorCode = 'UNIQUE_CONSTRAINT_FAILED';
        errorMessage = 'يوجد سجل مسبق بنفس الاسم أو البيانات المدخلة في النظام';
      } else if (prismaCode === 'P2025') {
        statusCode = HttpStatus.NOT_FOUND;
        errorCode = 'RECORD_NOT_FOUND';
        errorMessage = 'السجل المطلوب غير موجود في قاعدة البيانات';
      } else if (prismaCode === 'P2003') {
        statusCode = HttpStatus.BAD_REQUEST;
        errorCode = 'FOREIGN_KEY_VIOLATION';
        errorMessage = 'فشلت العملية لارتباط السجل ببيانات أخرى أو تم حذفه';
      } else if (prismaCode === 'P2022') {
        statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
        errorCode = 'DATABASE_SCHEMA_DRIFT';
        errorMessage = 'خطأ في توافق مخطط قاعدة البيانات، يرجى تحديث النظام';
      }
    }

    const errorPayload: ApiErrorResponse = {
      success: false,
      statusCode,
      error: {
        code: errorCode,
        message: errorMessage,
        ...(!isProduction && error.stack ? { details: error.stack } : {}),
      },
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(requestId ? { requestId } : {}),
    };

    response.status(statusCode).json(errorPayload);
  }
}
