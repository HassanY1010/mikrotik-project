import { Module } from '@nestjs/common';
import { CardsController } from './controllers/cards.controller';
import { CardsService } from './services/cards.service';
import { CardCodeGeneratorService } from './services/card-code-generator.service';

@Module({
  controllers: [CardsController],
  providers: [CardsService, CardCodeGeneratorService],
  exports: [CardsService, CardCodeGeneratorService],
})
export class CardsModule {}
