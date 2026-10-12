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
  Header,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PortalService } from './portal.service';
import {
  CreatePortalTemplateDto,
  UpdatePortalTemplateDto,
  PublishPortalDto,
} from './dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../core/multi-tenancy/tenant.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { TenantId } from '../../core/decorators/tenant-id.decorator';
import { RoleName } from '@mikrotik-saas/shared-types';

@ApiTags('portal')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('portal')
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Get('presets')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all pre-built HotSpot portal design presets' })
  @ApiResponse({ status: 200, description: 'Presets map' })
  getPresets() {
    return this.portalService.getPresetConfigs();
  }

  @Get('templates')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all custom HotSpot portal templates for the tenant' })
  @ApiResponse({ status: 200, description: 'List of templates' })
  async listTemplates(@TenantId() tenantId: string) {
    return this.portalService.listTemplates(tenantId);
  }

  @Get('templates/:id')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get a specific portal template by ID' })
  @ApiResponse({ status: 200, description: 'Template details' })
  async getTemplate(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.portalService.getTemplate(tenantId, id);
  }

  @Post('templates')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new HotSpot portal template' })
  @ApiResponse({ status: 201, description: 'Template created successfully' })
  async createTemplate(
    @TenantId() tenantId: string,
    @Body() dto: CreatePortalTemplateDto,
  ) {
    return this.portalService.createTemplate(tenantId, dto);
  }

  @Patch('templates/:id')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update an existing HotSpot portal template' })
  @ApiResponse({ status: 200, description: 'Template updated successfully' })
  async updateTemplate(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePortalTemplateDto,
  ) {
    return this.portalService.updateTemplate(tenantId, id, dto);
  }

  @Delete('templates/:id')
  @Roles(RoleName.TENANT_ADMIN, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a portal template' })
  @ApiResponse({ status: 200, description: 'Template deleted' })
  async deleteTemplate(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.portalService.deleteTemplate(tenantId, id);
  }

  @Get('templates/:id/preview')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER, RoleName.SUPER_ADMIN)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Render live HTML preview for a saved template' })
  @ApiResponse({ status: 200, description: 'Rendered HTML string' })
  async renderPreview(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.portalService.renderPreview(tenantId, id);
  }

  @Post('preview-draft')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER, RoleName.SUPER_ADMIN)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Render live HTML preview directly from draft parameters' })
  @ApiResponse({ status: 200, description: 'Rendered HTML string' })
  renderDraftPreview(@Body() dto: CreatePortalTemplateDto) {
    return this.portalService.renderDraftPreview(dto);
  }

  @Post('devices/:deviceId/publish')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Compile and publish portal design to MikroTik router via Windows Agent' })
  @ApiResponse({ status: 200, description: 'Portal publish command queued' })
  async publishToRouter(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Body() dto: PublishPortalDto,
  ) {
    return this.portalService.publishToRouter(tenantId, deviceId, dto);
  }
}
