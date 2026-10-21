import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { RouterProvisioningService } from './services/router-provisioning.service';

@Module({
  controllers: [DevicesController],
  providers: [DevicesService, RouterProvisioningService],
  exports: [DevicesService, RouterProvisioningService],
})
export class DevicesModule {}
