import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { PppoeController } from './pppoe.controller';
import { PppoeService } from './pppoe.service';

@Module({
  imports: [AgentModule],
  controllers: [PppoeController],
  providers: [PppoeService],
  exports: [PppoeService],
})
export class PppoeModule {}
