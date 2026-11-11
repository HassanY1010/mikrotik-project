import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { RouterOs6Adapter } from './adapters/routeros6.adapter';
import { RouterOs7Adapter } from './adapters/routeros7.adapter';
import { MikrotikProvisioningController } from './mikrotik-provisioning.controller';
import { MikrotikProvisioningService } from './mikrotik-provisioning.service';
import { CommandExecutorService } from './services/command-executor.service';
import { ConfigurationPlannerService } from './services/configuration-planner.service';
import { ProvisioningBackupStorageService } from './services/provisioning-backup-storage.service';
import { ProvisioningBackupService } from './services/provisioning-backup.service';
import { ProvisioningLoggerService } from './services/provisioning-logger.service';
import { ProvisioningRecoveryService } from './services/provisioning-recovery.service';
import { ProvisioningValidatorService } from './services/provisioning-validator.service';
import { RouterCapabilityService } from './services/router-capability.service';
import { RouterCompatibilityService } from './services/router-compatibility.service';
import { RouterDiscoveryEngineService } from './services/router-discovery-engine.service';

@Module({
  imports: [DevicesModule],
  controllers: [MikrotikProvisioningController],
  providers: [
    RouterOs6Adapter,
    RouterOs7Adapter,
    RouterCapabilityService,
    RouterCompatibilityService,
    RouterDiscoveryEngineService,
    ProvisioningValidatorService,
    ConfigurationPlannerService,
    ProvisioningBackupStorageService,
    ProvisioningBackupService,
    ProvisioningRecoveryService,
    ProvisioningLoggerService,
    CommandExecutorService,
    MikrotikProvisioningService,
  ],
  exports: [
    MikrotikProvisioningService,
    RouterCapabilityService,
    RouterCompatibilityService,
    RouterDiscoveryEngineService,
    ProvisioningValidatorService,
    ConfigurationPlannerService,
    ProvisioningBackupService,
    ProvisioningRecoveryService,
    ProvisioningLoggerService,
    CommandExecutorService,
  ],
})
export class MikrotikProvisioningModule {}
