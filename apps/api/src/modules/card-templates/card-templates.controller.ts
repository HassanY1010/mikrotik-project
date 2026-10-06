import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { CardTemplatesService, PrintRenderPayload } from './card-templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../core/multi-tenancy/tenant.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { TenantId } from '../../core/decorators/tenant-id.decorator';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { RoleName } from '@mikrotik-saas/shared-types';
import { CardTemplate } from '@prisma/client';

@ApiTags('card-templates')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('card-templates')
export class CardTemplatesController {
  constructor(private readonly cardTemplatesService: CardTemplatesService) {}

  @Get()
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({ summary: 'List all card print templates for tenant' })
  @ApiResponse({ status: 200, description: 'List of templates' })
  async findAll(@TenantId() tenantId: string): Promise<CardTemplate[]> {
    return this.cardTemplatesService.findAll(tenantId);
  }

  @Get(':id')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({ summary: 'Get a specific card print template' })
  @ApiResponse({ status: 200, description: 'Template details' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async findById(@TenantId() tenantId: string, @Param('id') id: string): Promise<CardTemplate> {
    return this.cardTemplatesService.findById(tenantId, id);
  }

  @Post()
  @Roles(RoleName.TENANT_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new card print template (thermal 58/80mm or A4 sheet)' })
  @ApiResponse({ status: 201, description: 'Template created' })
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateTemplateDto,
  ): Promise<CardTemplate> {
    return this.cardTemplatesService.create(tenantId, dto);
  }

  @Patch(':id')
  @Roles(RoleName.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update an existing card print template' })
  @ApiResponse({ status: 200, description: 'Template updated' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ): Promise<CardTemplate> {
    return this.cardTemplatesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(RoleName.TENANT_ADMIN)
  @ApiOperation({ summary: 'Delete a card print template' })
  @ApiResponse({ status: 200, description: 'Template deleted' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async remove(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.cardTemplatesService.remove(tenantId, id);
  }

  @Post('batches/:batchId/print')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({
    summary:
      'Render cards in batch with QR codes and prepare print payload for thermal or A4 printer',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { templateId: { type: 'string', format: 'uuid' } },
      required: ['templateId'],
    },
  })
  @ApiResponse({ status: 200, description: 'Rendered print payload with QR data URLs' })
  async renderBatchForPrint(
    @TenantId() tenantId: string,
    @Param('batchId') batchId: string,
    @Body('templateId') templateId: string,
    @CurrentUser('id') userId: string,
  ): Promise<PrintRenderPayload> {
    return this.cardTemplatesService.renderBatchForPrint(tenantId, batchId, templateId, userId);
  }
}
