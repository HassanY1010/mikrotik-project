import { ValidationPipe, ArgumentMetadata } from '@nestjs/common';
import { CreateBatchDto } from '../dto/create-batch.dto';
import { CreateTemplateDto } from '../../card-templates/dto/create-template.dto';

describe('Batch and Template DTO Validation', () => {
  let targetPipe: ValidationPipe;

  beforeEach(() => {
    targetPipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    });
  });

  describe('CreateBatchDto Validation', () => {
    const validBatchPayload = {
      profileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      quantity: 100,
      themePreset: 'FOOTBALL',
      singleCredential: true,
      singleUserPin: true,
    };

    it('should pass validation when templateId is provided (as sent by mobile app)', async () => {
      const payload = {
        ...validBatchPayload,
        templateId: 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      };

      const metadata: ArgumentMetadata = {
        type: 'body',
        metatype: CreateBatchDto,
      };

      const result = await targetPipe.transform(payload, metadata);
      expect(result).toBeDefined();
      expect(result.templateId).toBe('c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22');
      expect(result.quantity).toBe(100);
    });

    it('should pass validation when cardTemplateId alias is provided', async () => {
      const payload = {
        ...validBatchPayload,
        cardTemplateId: 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      };

      const metadata: ArgumentMetadata = {
        type: 'body',
        metatype: CreateBatchDto,
      };

      const result = await targetPipe.transform(payload, metadata);
      expect(result).toBeDefined();
      expect(result.cardTemplateId).toBe('c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22');
    });

    it('should pass validation when notes is provided', async () => {
      const payload = {
        ...validBatchPayload,
        notes: 'Monthly batch generation for cafe zone',
      };

      const metadata: ArgumentMetadata = {
        type: 'body',
        metatype: CreateBatchDto,
      };

      const result = await targetPipe.transform(payload, metadata);
      expect(result).toBeDefined();
      expect(result.notes).toBe('Monthly batch generation for cafe zone');
    });

    it('should pass validation without templateId', async () => {
      const metadata: ArgumentMetadata = {
        type: 'body',
        metatype: CreateBatchDto,
      };

      const result = await targetPipe.transform(validBatchPayload, metadata);
      expect(result).toBeDefined();
      expect(result.templateId).toBeUndefined();
    });
  });

  describe('CreateTemplateDto Validation with Custom Dimensions', () => {
    it('should accept custom dimensions and string/number transformations', async () => {
      const payload = {
        name: 'قالب بطاقة مخصص 100x40',
        widthMm: 100,
        heightMm: 40,
        orientation: 'landscape',
        themePreset: 'TICKET',
        primaryColor: '#1E3A8A',
        accentColor: '#10B981',
        layoutConfig: {
          showQr: true,
          networkName: 'سودافاي',
        },
      };

      const metadata: ArgumentMetadata = {
        type: 'body',
        metatype: CreateTemplateDto,
      };

      const result = await targetPipe.transform(payload, metadata);
      expect(result).toBeDefined();
      expect(result.name).toBe('قالب بطاقة مخصص 100x40');
      expect(result.widthMm).toBe(100);
      expect(result.heightMm).toBe(40);
      expect(result.orientation).toBe('landscape');
    });

    it('should transform uppercase orientation and string dimensions', async () => {
      const payload = {
        name: 'قالب حراري 80 مم',
        widthMm: '80',
        heightMm: '50',
        orientation: 'PORTRAIT',
        layoutConfig: JSON.stringify({ showQr: true }),
      };

      const metadata: ArgumentMetadata = {
        type: 'body',
        metatype: CreateTemplateDto,
      };

      const result = await targetPipe.transform(payload, metadata);
      expect(result).toBeDefined();
      expect(result.widthMm).toBe(80);
      expect(result.heightMm).toBe(50);
      expect(result.orientation).toBe('portrait');
      expect(result.layoutConfig).toEqual({ showQr: true });
    });
  });
});
