import {
  Injectable,
  NotFoundException,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../core/database/prisma.service';
import { SupabaseStorageService } from './supabase-storage.service';
import { CreateCardPdfArchiveDto } from './dto/create-card-pdf-archive.dto';
import { QueryCardPdfArchiveDto } from './dto/query-card-pdf-archive.dto';
import { Prisma } from '@prisma/client';

export interface CardPdfArchiveResponse {
  id: string;
  tenantId: string;
  fileName: string;
  storagePath: string;
  fileSize: number;
  cardCount: number;
  templateType: string | null;
  networkName: string | null;
  profileName: string | null;
  batchId: string | null;
  metadata: any;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  signedUrl?: string;
}

export interface PaginatedArchivesResponse {
  data: CardPdfArchiveResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class CardPdfArchiveService {
  private readonly logger = new Logger(CardPdfArchiveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseStorage: SupabaseStorageService,
  ) {}

  /**
   * Uploads and archives a generated PDF file with complete tenant isolation and orphan cleanup.
   */
  async archivePdf(
    tenantId: string,
    createdById: string | undefined,
    fileBuffer: Buffer,
    dto: CreateCardPdfArchiveDto,
  ): Promise<CardPdfArchiveResponse> {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('PDF file buffer cannot be empty');
    }

    // Idempotency check: if the same batch and file size was archived within the last 5 minutes, return it
    if (dto.batchId && dto.batchId.trim().length > 0) {
      const existing = await this.prisma.cardPdfArchive.findFirst({
        where: {
          tenantId,
          batchId: dto.batchId.trim(),
          fileSize: fileBuffer.length,
          createdAt: {
            gte: new Date(Date.now() - 5 * 60 * 1000),
          },
        },
      });

      if (existing) {
        this.logger.log(`Idempotent hit: PDF archive for batch ${dto.batchId} already exists (${existing.id})`);
        const signedUrl = await this.supabaseStorage.createSignedUrl(existing.storagePath).catch(() => undefined);
        return { ...existing, signedUrl };
      }
    }

    const fileId = uuidv4();
    let parsedMetadata: any = undefined;
    if (dto.metadata) {
      try {
        parsedMetadata = typeof dto.metadata === 'string' ? JSON.parse(dto.metadata) : dto.metadata;
      } catch (_) {
        parsedMetadata = { raw: dto.metadata };
      }
    }

    // 1. Upload to Supabase Storage in tenant folder
    const uploadResult = await this.supabaseStorage.uploadPdf(
      tenantId,
      fileId,
      fileBuffer,
      dto.fileName,
    );

    // 2. Persist record in PostgreSQL with rollback on failure
    try {
      const archive = await this.prisma.cardPdfArchive.create({
        data: {
          id: fileId,
          tenantId,
          fileName: dto.fileName.trim(),
          storagePath: uploadResult.storagePath,
          fileSize: uploadResult.fileSize,
          cardCount: dto.cardCount,
          templateType: dto.templateType?.trim() || null,
          networkName: dto.networkName?.trim() || null,
          profileName: dto.profileName?.trim() || null,
          batchId: dto.batchId?.trim() || null,
          metadata: parsedMetadata ? parsedMetadata : Prisma.JsonNull,
          createdById: createdById || null,
        },
      });

      this.logger.log(`Created PDF archive record ${archive.id} for tenant ${tenantId}`);

      // Generate initial signed URL for immediate preview/access
      const signedUrl = await this.supabaseStorage.createSignedUrl(archive.storagePath).catch(() => undefined);

      return {
        ...archive,
        signedUrl,
      };
    } catch (dbError: any) {
      this.logger.error(`Database insertion failed for archive ${fileId}. Cleaning up uploaded storage file...`);
      // Cleanup orphaned file from Supabase Storage
      await this.supabaseStorage.deleteFile(uploadResult.storagePath).catch((delErr) => {
        this.logger.error(`Failed to cleanup orphaned storage file ${uploadResult.storagePath}: ${delErr}`);
      });

      throw new InternalServerErrorException('Failed to persist PDF archive record in database');
    }
  }

  /**
   * Lists archived PDF files for a tenant with search, date range, pagination, and sorting.
   */
  async findAll(
    tenantId: string,
    query: QueryCardPdfArchiveDto,
  ): Promise<PaginatedArchivesResponse> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.CardPdfArchiveWhereInput = {
      tenantId,
    };

    if (query.search && query.search.trim().length > 0) {
      const searchTerm = query.search.trim();
      where.OR = [
        { fileName: { contains: searchTerm, mode: 'insensitive' } },
        { networkName: { contains: searchTerm, mode: 'insensitive' } },
        { profileName: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    if (query.startDate) {
      const start = new Date(query.startDate);
      if (!isNaN(start.getTime())) {
        where.createdAt = {
          ...(where.createdAt as any),
          gte: start,
        };
      }
    }

    if (query.endDate) {
      const end = new Date(query.endDate);
      if (!isNaN(end.getTime())) {
        where.createdAt = {
          ...(where.createdAt as any),
          lte: end,
        };
      }
    }

    const sortOrder: Prisma.SortOrder = query.sort === 'asc' ? 'asc' : 'desc';

    const [total, archives] = await Promise.all([
      this.prisma.cardPdfArchive.count({ where }),
      this.prisma.cardPdfArchive.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: sortOrder,
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: archives,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Retrieves single archive by ID with tenant security check and creates a short-lived signed URL.
   */
  async findById(tenantId: string, id: string): Promise<CardPdfArchiveResponse> {
    const archive = await this.prisma.cardPdfArchive.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!archive) {
      throw new NotFoundException('PDF archive not found or access denied');
    }

    const signedUrl = await this.supabaseStorage.createSignedUrl(archive.storagePath);

    return {
      ...archive,
      signedUrl,
    };
  }

  /**
   * Downloads raw PDF buffer for direct streaming or offline sharing.
   */
  async download(
    tenantId: string,
    id: string,
  ): Promise<{ buffer: Buffer; fileName: string; fileSize: number }> {
    const archive = await this.prisma.cardPdfArchive.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!archive) {
      throw new NotFoundException('PDF archive not found or access denied');
    }

    const buffer = await this.supabaseStorage.downloadPdf(archive.storagePath);
    return {
      buffer,
      fileName: archive.fileName,
      fileSize: archive.fileSize,
    };
  }

  /**
   * Deletes an archive from Supabase Storage and database.
   */
  async delete(tenantId: string, id: string): Promise<{ success: boolean; message: string }> {
    const archive = await this.prisma.cardPdfArchive.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!archive) {
      throw new NotFoundException('PDF archive not found or access denied');
    }

    // 1. Delete from Supabase Storage
    await this.supabaseStorage.deleteFile(archive.storagePath);

    // 2. Delete from database
    await this.prisma.cardPdfArchive.delete({
      where: { id },
    });

    this.logger.log(`Deleted PDF archive ${id} for tenant ${tenantId}`);

    return {
      success: true,
      message: 'PDF archive deleted successfully',
    };
  }
}
