import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
  path: string;
  requestId?: string;
}

@Injectable()
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const requestId =
      (request.headers['x-request-id'] as string) || (request as unknown as { id?: string }).id;

    let errorCode = HttpStatus[status] || 'HTTP_EXCEPTION';
    let errorMessage = exception.message;
    let details: unknown = undefined;

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const resp = exceptionResponse as Record<string, unknown>;
      if (resp['error'] && typeof resp['error'] === 'string') {
        errorCode = resp['error'].toUpperCase().replace(/\s+/g, '_');
      }
      if (resp['message']) {
        if (Array.isArray(resp['message'])) {
          errorMessage = 'Validation failed';
          details = resp['message'];
        } else {
          errorMessage = String(resp['message']);
        }
      }
    }

    const errorPayload: ApiErrorResponse = {
      success: false,
      statusCode: status,
      error: {
        code: errorCode,
        message: errorMessage,
        ...(details ? { details } : {}),
      },
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(requestId ? { requestId } : {}),
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`HttpException ${status} [${errorCode}]: ${errorMessage}`, exception.stack);
    } else {
      this.logger.warn(`HttpException ${status} [${errorCode}]: ${errorMessage}`);
    }

    response.status(status).json(errorPayload);
  }
}
