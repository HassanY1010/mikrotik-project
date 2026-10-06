import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import type { Request } from 'express';
import { type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: unknown;
  timestamp: string;
  requestId?: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | T> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T> | T> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const path = req.url;

    // Skip transform for health endpoints and swagger
    if (path.startsWith('/health') || path.startsWith('/docs')) {
      return next.handle();
    }

    const requestId =
      (req.headers['x-request-id'] as string) || (req as unknown as { id?: string }).id;

    return next.handle().pipe(
      map((response) => {
        // If response is null/undefined
        if (response === undefined || response === null) {
          return {
            success: true,
            data: null as unknown as T,
            timestamp: new Date().toISOString(),
            ...(requestId ? { requestId } : {}),
          };
        }

        // If response is already in { success: ..., data: ... } format
        if (
          typeof response === 'object' &&
          'success' in response &&
          typeof response.success === 'boolean'
        ) {
          return response;
        }

        // If response has { data, meta } structure (common for paginated queries)
        if (typeof response === 'object' && 'data' in response && 'meta' in response) {
          return {
            success: true,
            data: response.data,
            meta: response.meta,
            timestamp: new Date().toISOString(),
            ...(requestId ? { requestId } : {}),
          };
        }

        return {
          success: true,
          data: response,
          timestamp: new Date().toISOString(),
          ...(requestId ? { requestId } : {}),
        };
      }),
    );
  }
}
