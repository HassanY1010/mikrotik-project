import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { PortalCompilerService } from './portal-compiler.service';
import { DevicesModule } from '../devices/devices.module';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [DevicesModule, AgentModule],
  controllers: [PortalController],
  providers: [PortalService, PortalCompilerService],
  exports: [PortalService, PortalCompilerService],
})
export class PortalModule {}
