import { Module } from '@nestjs/common';
import { CardPdfArchiveController } from './card-pdf-archive.controller';
import { CardPdfArchiveService } from './card-pdf-archive.service';
import { SupabaseStorageService } from './supabase-storage.service';
import { PrismaService } from '../../core/database/prisma.service';

@Module({
  controllers: [CardPdfArchiveController],
  providers: [CardPdfArchiveService, SupabaseStorageService, PrismaService],
  exports: [CardPdfArchiveService, SupabaseStorageService],
})
export class CardPdfArchiveModule {}
