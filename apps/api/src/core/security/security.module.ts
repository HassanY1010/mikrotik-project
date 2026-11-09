import { Global, Module } from '@nestjs/common';
import { HashingService } from './hashing.service';
import { EncryptionService } from './encryption.service';
import { PlanSigningService } from './signing.service';

@Global()
@Module({
  providers: [HashingService, EncryptionService, PlanSigningService],
  exports: [HashingService, EncryptionService, PlanSigningService],
})
export class SecurityModule {}
