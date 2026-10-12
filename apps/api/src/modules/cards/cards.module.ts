import { Module } from '@nestjs/common';
import { CardsController } from './controllers/cards.controller';
import { CardsService } from './services/cards.service';
import { CardCodeGeneratorService } from './services/card-code-generator.service';
import { QuotasService } from './services/quotas.service';

@Module({
  controllers: [CardsController],
  providers: [CardsService, CardCodeGeneratorService, QuotasService],
  exports: [CardsService, CardCodeGeneratorService, QuotasService],
})
export class CardsModule {}
