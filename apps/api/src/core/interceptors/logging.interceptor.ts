import {
  Injectable,
  Logger,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const startTime = Date.now();
    const { method, url } = req;
    const requestId =
      (req.headers['x-request-id'] as string) || (req as unknown as { id?: string }).id;

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = res.statusCode;

          this.logger.log(`HTTP ${method} ${url} ${statusCode} - ${duration}ms [req:${requestId}]`);
        },
        error: (err: unknown) => {
          const duration = Date.now() - startTime;
          const statusCode = res.statusCode || 500;
          const errorMessage = err instanceof Error ? err.message : String(err);

          this.logger.error(
            `HTTP ${method} ${url} ${statusCode} - ${duration}ms [req:${requestId}] (Failed: ${errorMessage})`,
          );
        },
      }),
    );
  }
}
