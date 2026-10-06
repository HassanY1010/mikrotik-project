import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContextData {
  tenantId: string;
  slug?: string;
  userId?: string;
  role?: string;
}

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContextData>();

  runWithContext<R>(context: TenantContextData, fn: () => R): R {
    return this.storage.run(context, fn);
  }

  getTenantId(): string | undefined {
    return this.storage.getStore()?.tenantId;
  }

  getContext(): TenantContextData | undefined {
    return this.storage.getStore();
  }
}
