import { Module } from '@nestjs/common';
import { CardTemplatesController } from './card-templates.controller';
import { CardTemplatesService } from './card-templates.service';

@Module({
  controllers: [CardTemplatesController],
  providers: [CardTemplatesService],
  exports: [CardTemplatesService],
})
export class CardTemplatesModule {}
