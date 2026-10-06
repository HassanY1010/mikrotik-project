import { Global, Module } from '@nestjs/common';
import { HashingService } from './hashing.service';
import { EncryptionService } from './encryption.service';

@Global()
@Module({
  providers: [HashingService, EncryptionService],
  exports: [HashingService, EncryptionService],
})
export class SecurityModule {}
