import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const requestId =
      (req.headers['x-request-id'] as string) || (req as unknown as { id?: string }).id || uuidv4();

    // Attach to request object and response header
    (req as unknown as { id: string }).id = requestId;
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-Id', requestId);

    return next.handle();
  }
}
