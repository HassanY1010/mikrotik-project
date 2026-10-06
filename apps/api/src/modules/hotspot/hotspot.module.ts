import { Module } from '@nestjs/common';
import { HotspotController, TenantHotspotController } from './hotspot.controller';
import { HotspotService } from './hotspot.service';

@Module({
  controllers: [HotspotController, TenantHotspotController],
  providers: [HotspotService],
  exports: [HotspotService],
})
export class HotspotModule {}
