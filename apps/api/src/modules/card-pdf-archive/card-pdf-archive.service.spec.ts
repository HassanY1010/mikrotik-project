import { Test, TestingModule } from '@nestjs/testing';
import { CardPdfArchiveService } from './card-pdf-archive.service';
import { SupabaseStorageService } from './supabase-storage.service';
import { PrismaService } from '../../core/database/prisma.service';
import { NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';

describe('CardPdfArchiveService', () => {
  let service: CardPdfArchiveService;
  let prisma: any;
  let supabaseStorage: any;

  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-456';
  const mockArchiveId = 'archive-789';

  beforeEach(async () => {
    prisma = {
      cardPdfArchive: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        delete: jest.fn(),
      },
    };

    supabaseStorage = {
      uploadPdf: jest.fn(),
      createSignedUrl: jest.fn(),
      downloadPdf: jest.fn(),
      deleteFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardPdfArchiveService,
        { provide: PrismaService, useValue: prisma },
        { provide: SupabaseStorageService, useValue: supabaseStorage },
      ],
    }).compile();

    service = module.get<CardPdfArchiveService>(CardPdfArchiveService);
  });

  describe('archivePdf', () => {
    it('should successfully upload to storage and persist to database', async () => {
      const buffer = Buffer.from('%PDF-1.4 test content');
      const dto = {
        fileName: 'Batch_100_Cards.pdf',
        cardCount: 100,
        templateType: 'FOOTBALL',
        networkName: 'SudaFi Net',
        profileName: '1 Day',
        batchId: 'batch-abc',
      };

      supabaseStorage.uploadPdf.mockResolvedValue({
        storagePath: `${mockTenantId}/mock-file.pdf`,
        fileSize: buffer.length,
      });

      const mockDbRecord = {
        id: 'mock-file-id',
        tenantId: mockTenantId,
        fileName: dto.fileName,
        storagePath: `${mockTenantId}/mock-file.pdf`,
        fileSize: buffer.length,
        cardCount: 100,
        templateType: 'FOOTBALL',
        networkName: 'SudaFi Net',
        profileName: '1 Day',
        batchId: 'batch-abc',
        metadata: null,
        createdById: mockUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.cardPdfArchive.create.mockResolvedValue(mockDbRecord);
      supabaseStorage.createSignedUrl.mockResolvedValue('https://supabase.co/signed-url');

      const result = await service.archivePdf(mockTenantId, mockUserId, buffer, dto);

      expect(supabaseStorage.uploadPdf).toHaveBeenCalledWith(
        mockTenantId,
        expect.any(String),
        buffer,
        dto.fileName,
      );
      expect(prisma.cardPdfArchive.create).toHaveBeenCalled();
      expect(result.fileName).toEqual(dto.fileName);
      expect(result.signedUrl).toEqual('https://supabase.co/signed-url');
    });

    it('should throw BadRequestException if buffer is empty', async () => {
      await expect(
        service.archivePdf(mockTenantId, mockUserId, Buffer.alloc(0), {
          fileName: 'empty.pdf',
          cardCount: 10,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should rollback and delete uploaded file from storage if database creation fails', async () => {
      const buffer = Buffer.from('%PDF-1.4 test content');
      supabaseStorage.uploadPdf.mockResolvedValue({
        storagePath: `${mockTenantId}/orphan.pdf`,
        fileSize: buffer.length,
      });

      prisma.cardPdfArchive.create.mockRejectedValue(new Error('DB Constraint Violation'));
      supabaseStorage.deleteFile.mockResolvedValue(true);

      await expect(
        service.archivePdf(mockTenantId, mockUserId, buffer, {
          fileName: 'fail.pdf',
          cardCount: 10,
        }),
      ).rejects.toThrow(InternalServerErrorException);

      expect(supabaseStorage.deleteFile).toHaveBeenCalledWith(`${mockTenantId}/orphan.pdf`);
    });
  });

  describe('findAll', () => {
    it('should return paginated archives with tenant isolation', async () => {
      const mockArchives = [
        {
          id: 'arch-1',
          tenantId: mockTenantId,
          fileName: 'File1.pdf',
          fileSize: 1024,
          cardCount: 50,
          createdAt: new Date(),
        },
      ];

      prisma.cardPdfArchive.count.mockResolvedValue(1);
      prisma.cardPdfArchive.findMany.mockResolvedValue(mockArchives);

      const result = await service.findAll(mockTenantId, { page: 1, limit: 10, sort: 'desc' });

      expect(prisma.cardPdfArchive.findMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
      expect(result.total).toEqual(1);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('should return archive details with signed URL when tenant matches', async () => {
      const mockArchive = {
        id: mockArchiveId,
        tenantId: mockTenantId,
        storagePath: `${mockTenantId}/${mockArchiveId}.pdf`,
        fileName: 'Test.pdf',
      };

      prisma.cardPdfArchive.findFirst.mockResolvedValue(mockArchive);
      supabaseStorage.createSignedUrl.mockResolvedValue('https://supabase.co/fresh-signed-url');

      const result = await service.findById(mockTenantId, mockArchiveId);

      expect(result.signedUrl).toEqual('https://supabase.co/fresh-signed-url');
    });

    it('should throw NotFoundException if archive does not belong to tenant', async () => {
      prisma.cardPdfArchive.findFirst.mockResolvedValue(null);

      await expect(service.findById(mockTenantId, 'foreign-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete from Supabase storage and database when tenant matches', async () => {
      const mockArchive = {
        id: mockArchiveId,
        tenantId: mockTenantId,
        storagePath: `${mockTenantId}/${mockArchiveId}.pdf`,
      };

      prisma.cardPdfArchive.findFirst.mockResolvedValue(mockArchive);
      supabaseStorage.deleteFile.mockResolvedValue(true);
      prisma.cardPdfArchive.delete.mockResolvedValue(mockArchive);

      const result = await service.delete(mockTenantId, mockArchiveId);

      expect(supabaseStorage.deleteFile).toHaveBeenCalledWith(mockArchive.storagePath);
      expect(prisma.cardPdfArchive.delete).toHaveBeenCalledWith({ where: { id: mockArchiveId } });
      expect(result.success).toBe(true);
    });

    it('should preserve database record and throw if storage delete fails', async () => {
      const mockArchive = {
        id: mockArchiveId,
        tenantId: mockTenantId,
        storagePath: `${mockTenantId}/${mockArchiveId}.pdf`,
      };
      prisma.cardPdfArchive.findFirst.mockResolvedValue(mockArchive as any);
      supabaseStorage.deleteFile.mockResolvedValue(false);

      await expect(service.delete(mockTenantId, mockArchiveId)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(prisma.cardPdfArchive.delete).not.toHaveBeenCalled();
    });

    it('should prevent deleting files belonging to another tenant', async () => {
      prisma.cardPdfArchive.findFirst.mockResolvedValue(null);

      await expect(service.delete('attacker-tenant', mockArchiveId)).rejects.toThrow(
        NotFoundException,
      );
      expect(supabaseStorage.deleteFile).not.toHaveBeenCalled();
      expect(prisma.cardPdfArchive.delete).not.toHaveBeenCalled();
    });
  });
});
