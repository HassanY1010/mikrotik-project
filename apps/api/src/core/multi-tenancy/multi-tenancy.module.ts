import { Global, Module } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';
import { TenantGuard } from './tenant.guard';

@Global()
@Module({
  providers: [TenantContextService, TenantGuard],
  exports: [TenantContextService, TenantGuard],
})
export class MultiTenancyModule {}
