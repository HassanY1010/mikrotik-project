import { Module } from '@nestjs/common';
import { HotspotController } from './hotspot.controller';
import { HotspotService } from './hotspot.service';

@Module({
  controllers: [HotspotController],
  providers: [HotspotService],
  exports: [HotspotService],
})
export class HotspotModule {}
