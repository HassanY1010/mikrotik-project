import { Test, TestingModule } from '@nestjs/testing';
import { CardTemplatesService } from './card-templates.service';
import { PrismaService } from '../../core/database/prisma.service';
import { EncryptionService } from '../../core/security/encryption.service';
import { NotFoundException } from '@nestjs/common';
import { PrintJobStatus } from '@prisma/client';

describe('CardTemplatesService', () => {
  let service: CardTemplatesService;
  let prisma: any;
  let encryptionService: any;

  const mockTenantId = 'tenant-uuid-1';
  const mockTemplateId = 'template-uuid-1';
  const mockBatchId = 'batch-uuid-1';
  const mockUserId = 'user-uuid-1';

  beforeEach(async () => {
    prisma = {
      cardTemplate: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      cardBatch: {
        findFirst: jest.fn(),
      },
      printJob: {
        create: jest.fn(),
      },
    };

    encryptionService = {
      encrypt: jest.fn(),
      decrypt: jest.fn().mockReturnValue('plain_password_123'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardTemplatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EncryptionService, useValue: encryptionService },
      ],
    }).compile();

    service = module.get<CardTemplatesService>(CardTemplatesService);
  });

  describe('create', () => {
    it('should reset other default templates if isDefault is true', async () => {
      prisma.cardTemplate.create.mockResolvedValue({
        id: mockTemplateId,
        name: 'New Default',
        isDefault: true,
      });

      await service.create(mockTenantId, {
        name: 'New Default',
        isDefault: true,
        layoutConfig: {},
      });

      expect(prisma.cardTemplate.updateMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId, isDefault: true },
        data: { isDefault: false },
      });
      expect(prisma.cardTemplate.create).toHaveBeenCalled();
    });
  });

  describe('renderBatchForPrint', () => {
    it('should throw NotFoundException if template not found', async () => {
      prisma.cardTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.renderBatchForPrint(mockTenantId, mockBatchId, 'unknown', mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should render cards, generate QR codes, and create PrintJob record', async () => {
      prisma.cardTemplate.findFirst.mockResolvedValue({
        id: mockTemplateId,
        name: 'Thermal 80mm',
        widthMm: 80,
        heightMm: 50,
        orientation: 'portrait',
        backgroundDesign: null,
        layoutConfig: { showQr: true },
      });

      prisma.cardBatch.findFirst.mockResolvedValue({
        id: mockBatchId,
        batchNumber: 'B-261003-8888',
        device: { name: 'Main Router' },
        profile: { name: '1hour-fast' },
        cards: [
          {
            id: 'card-1',
            serialNumber: 'B-261003-8888-0001',
            username: 'user1',
            passwordEncrypted: 'enc1',
            iv: 'iv1',
            authTag: 'tag1',
            pinCode: 'user1',
            price: '500',
            timeLimit: '1h',
            dataLimitBytes: null,
          },
        ],
      });

      prisma.printJob.create.mockResolvedValue({
        id: 'job-1',
        status: PrintJobStatus.COMPLETED,
      });

      const payload = await service.renderBatchForPrint(
        mockTenantId,
        mockBatchId,
        mockTemplateId,
        mockUserId,
      );

      expect(encryptionService.decrypt).toHaveBeenCalledWith('enc1', 'iv1', 'tag1');
      expect(payload.cards).toHaveLength(1);
      expect(payload.cards[0].username).toBe('user1');
      expect(payload.cards[0].password).toBe('plain_password_123');
      expect(payload.cards[0].qrDataUrl).toMatch(/^data:image\/png;base64,/);

      expect(prisma.printJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: mockTenantId,
          templateId: mockTemplateId,
          cardBatchId: mockBatchId,
          totalCards: 1,
          printerType: 'THERMAL',
          status: PrintJobStatus.COMPLETED,
        }),
      });
    });
  });
});
