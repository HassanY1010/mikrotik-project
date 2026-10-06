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

    const errorPayload: ApiErrorResponse = {
      success: false,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: isProduction
          ? 'An internal server error occurred. Please contact support.'
          : error.message,
        ...(!isProduction && error.stack ? { details: error.stack } : {}),
      },
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(requestId ? { requestId } : {}),
    };

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(errorPayload);
  }
}
