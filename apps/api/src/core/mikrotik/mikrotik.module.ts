import { Global, Module } from '@nestjs/common';
import { MikrotikClientFactory } from './mikrotik-client.factory';
import { MikrotikOperationExecutorService } from './services/mikrotik-operation-executor.service';
import { MikrotikReconciliationService } from './services/mikrotik-reconciliation.service';

@Global()
@Module({
  providers: [
    MikrotikClientFactory,
    MikrotikOperationExecutorService,
    MikrotikReconciliationService,
  ],
  exports: [
    MikrotikClientFactory,
    MikrotikOperationExecutorService,
    MikrotikReconciliationService,
  ],
})
export class MikrotikModule {}
