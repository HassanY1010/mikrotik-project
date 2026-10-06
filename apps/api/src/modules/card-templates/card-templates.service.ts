import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { EncryptionService } from '../../core/security/encryption.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { CardTemplate, Prisma, PrintJobStatus } from '@prisma/client';
import * as qrcode from 'qrcode';

export interface RenderedCardItem {
  id: string;
  serialNumber: string;
  username: string;
  password: string;
  pinCode: string;
  price: number;
  profileName: string;
  timeLimit: string | null;
  dataLimitBytes: number | null;
  qrDataUrl: string;
}

export interface PrintRenderPayload {
  printJobId: string;
  template: {
    id: string;
    name: string;
    widthMm: number;
    heightMm: number;
    orientation: string;
    backgroundDesign: string | null;
    layoutConfig: Prisma.JsonValue;
  };
  batch: {
    id: string;
    batchNumber: string;
    deviceName: string;
    profileName: string;
  };
  cards: RenderedCardItem[];
}

@Injectable()
export class CardTemplatesService {
  private readonly logger = new Logger(CardTemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async create(tenantId: string, dto: CreateTemplateDto): Promise<CardTemplate> {
    if (dto.isDefault) {
      await this.prisma.cardTemplate.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.cardTemplate.create({
      data: {
        tenantId,
        name: dto.name,
        widthMm: dto.widthMm ?? 85,
        heightMm: dto.heightMm ?? 54,
        orientation: dto.orientation ?? 'landscape',
        backgroundDesign: dto.backgroundDesign ?? null,
        layoutConfig: dto.layoutConfig as Prisma.InputJsonValue,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  async findAll(tenantId: string): Promise<CardTemplate[]> {
    return this.prisma.cardTemplate.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async findById(tenantId: string, id: string): Promise<CardTemplate> {
    const template = await this.prisma.cardTemplate.findFirst({
      where: { id, tenantId },
    });

    if (!template) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: `Template with ID ${id} was not found`,
      });
    }

    return template;
  }

  async update(tenantId: string, id: string, dto: UpdateTemplateDto): Promise<CardTemplate> {
    await this.findById(tenantId, id);

    if (dto.isDefault) {
      await this.prisma.cardTemplate.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const data: Prisma.CardTemplateUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.widthMm !== undefined) data.widthMm = dto.widthMm;
    if (dto.heightMm !== undefined) data.heightMm = dto.heightMm;
    if (dto.orientation !== undefined) data.orientation = dto.orientation;
    if (dto.backgroundDesign !== undefined) data.backgroundDesign = dto.backgroundDesign;
    if (dto.layoutConfig !== undefined)
      data.layoutConfig = dto.layoutConfig as Prisma.InputJsonValue;
    if (dto.isDefault !== undefined) data.isDefault = dto.isDefault;

    return this.prisma.cardTemplate.update({
      where: { id },
      data,
    });
  }

  async remove(tenantId: string, id: string): Promise<{ success: boolean; message: string }> {
    await this.findById(tenantId, id);

    await this.prisma.cardTemplate.delete({
      where: { id },
    });

    return { success: true, message: 'Card template deleted successfully' };
  }

  async renderBatchForPrint(
    tenantId: string,
    batchId: string,
    templateId: string,
    userId: string,
  ): Promise<PrintRenderPayload> {
    const template = await this.findById(tenantId, templateId);

    const batch = await this.prisma.cardBatch.findFirst({
      where: { id: batchId, tenantId },
      include: {
        device: true,
        profile: true,
        cards: {
          orderBy: { serialNumber: 'asc' },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException({
        code: 'BATCH_NOT_FOUND',
        message: `Batch with ID ${batchId} was not found`,
      });
    }

    // Render cards with decrypted credentials and QR code data URLs
    const renderedCards: RenderedCardItem[] = [];

    for (const card of batch.cards) {
      const password = this.encryptionService.decrypt(
        card.passwordEncrypted,
        card.iv,
        card.authTag,
      );

      // Format Hotspot Quick-Login URL
      const qrPayload = `http://login.hotspot/login?username=${encodeURIComponent(card.username)}&password=${encodeURIComponent(password)}`;
      const qrDataUrl = await qrcode.toDataURL(qrPayload, {
        margin: 1,
        width: 256,
        errorCorrectionLevel: 'M',
      });

      renderedCards.push({
        id: card.id,
        serialNumber: card.serialNumber,
        username: card.username,
        password,
        pinCode: card.pinCode ?? password,
        price: Number(card.price),
        profileName: batch.profile.name,
        timeLimit: card.timeLimit,
        dataLimitBytes: card.dataLimitBytes ? Number(card.dataLimitBytes) : null,
        qrDataUrl,
      });
    }

    // Log the print job audit record
    const printerType = template.widthMm <= 80 ? 'THERMAL' : 'A4_SHEET';
    const printJob = await this.prisma.printJob.create({
      data: {
        tenantId,
        templateId,
        cardBatchId: batch.id,
        printerType,
        status: PrintJobStatus.COMPLETED,
        totalCards: renderedCards.length,
        createdById: userId,
      },
    });

    this.logger.log(
      `Rendered batch ${batch.batchNumber} (${renderedCards.length} cards) for print job ${printJob.id}`,
    );

    return {
      printJobId: printJob.id,
      template: {
        id: template.id,
        name: template.name,
        widthMm: template.widthMm,
        heightMm: template.heightMm,
        orientation: template.orientation,
        backgroundDesign: template.backgroundDesign,
        layoutConfig: template.layoutConfig,
      },
      batch: {
        id: batch.id,
        batchNumber: batch.batchNumber,
        deviceName: batch.device.name,
        profileName: batch.profile.name,
      },
      cards: renderedCards,
    };
  }
}
