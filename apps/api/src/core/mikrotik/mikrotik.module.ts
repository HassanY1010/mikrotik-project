import { Global, Module } from '@nestjs/common';
import { MikrotikClientFactory } from './mikrotik-client.factory';

@Global()
@Module({
  providers: [MikrotikClientFactory],
  exports: [MikrotikClientFactory],
})
export class MikrotikModule {}
