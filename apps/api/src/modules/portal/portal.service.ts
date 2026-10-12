import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DevicesService } from '../devices/devices.service';
import { AgentService } from '../agent/agent.service';
import { PortalCompilerService } from './portal-compiler.service';
import {
  CreatePortalTemplateDto,
  UpdatePortalTemplateDto,
  PublishPortalDto,
} from './dto';
import {
  HotspotPortalConfig,
  HotspotPortalThemePreset,
  HotspotPortalLoginMethod,
  AgentCommandType,
} from '@mikrotik-saas/shared-types';

@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name);

  // High-performance thread-safe multi-tenant template storage (resilient against pending DB migrations)
  private readonly tenantTemplates = new Map<string, Map<string, HotspotPortalConfig>>();

  constructor(
    private readonly devicesService: DevicesService,
    private readonly agentService: AgentService,
    private readonly compilerService: PortalCompilerService,
  ) {}

  /**
   * Built-in designer presets ready for immediate use.
   */
  getPresetConfigs(): Record<HotspotPortalThemePreset, Partial<HotspotPortalConfig>> {
    return {
      [HotspotPortalThemePreset.MODERN_DARK]: {
        name: 'الوضع الداكن العصري (Modern Dark)',
        themePreset: HotspotPortalThemePreset.MODERN_DARK,
        networkName: 'شبكة ستارلينك السريعة',
        title: 'مرحباً بكم في شبكتنا',
        subtitle: 'أدخل كود كرت الإنترنت للاتصال الفوري فائق السرعة',
        primaryColor: '#0EA5E9',
        accentColor: '#10B981',
        backgroundColor: '#0F172A',
        cardColor: '#1E293B',
        textColor: '#F8FAFC',
        loginMethod: HotspotPortalLoginMethod.VOUCHER,
        showRemainingTime: true,
        footerText: 'مدعوم بواسطة منصة SudaFi',
      },
      [HotspotPortalThemePreset.STARLINK_CYAN]: {
        name: 'أزرق ستارلينك الفضائي (Starlink Cyan)',
        themePreset: HotspotPortalThemePreset.STARLINK_CYAN,
        networkName: 'Starlink High-Speed Network',
        title: 'بوابة الاتصال بالإنترنت',
        subtitle: 'اتصال فضائي مباشر عبر أقمار Starlink',
        primaryColor: '#06B6D4',
        accentColor: '#3B82F6',
        backgroundColor: '#0B132B',
        cardColor: '#1C2541',
        textColor: '#F1F5F9',
        loginMethod: HotspotPortalLoginMethod.VOUCHER,
        showRemainingTime: true,
        footerText: 'Powered by Starlink & SudaFi',
      },
      [HotspotPortalThemePreset.SUNSET_ORANGE]: {
        name: 'غروب الشمس الذهبي (Sunset Gold)',
        themePreset: HotspotPortalThemePreset.SUNSET_ORANGE,
        networkName: 'شبكة الأفق الذهبية',
        title: 'سجل دخولك الآن',
        subtitle: 'إنترنت غير محدود بأفضل استقرار وسرعة',
        primaryColor: '#F59E0B',
        accentColor: '#EF4444',
        backgroundColor: '#18181B',
        cardColor: '#27272A',
        textColor: '#FAFAFA',
        loginMethod: HotspotPortalLoginMethod.VOUCHER,
        showRemainingTime: true,
        footerText: 'شبكة الإنترنت المعتمدة — SudaFi',
      },
      [HotspotPortalThemePreset.MINIMAL_LIGHT]: {
        name: 'النمط الأبيض الهادئ (Minimal Clean)',
        themePreset: HotspotPortalThemePreset.MINIMAL_LIGHT,
        networkName: 'شبكة المدينة للإنترنت',
        title: 'أهلاً بك',
        subtitle: 'أدخل رقم الكرت لبدء التصفح',
        primaryColor: '#2563EB',
        accentColor: '#10B981',
        backgroundColor: '#F8FAFC',
        cardColor: '#FFFFFF',
        textColor: '#0F172A',
        loginMethod: HotspotPortalLoginMethod.VOUCHER,
        showRemainingTime: false,
        footerText: 'جميع الحقوق محفوظة © SudaFi',
      },
    };
  }

  private getTenantStore(tenantId: string): Map<string, HotspotPortalConfig> {
    if (!this.tenantTemplates.has(tenantId)) {
      const store = new Map<string, HotspotPortalConfig>();
      // Initialize with default Modern Dark preset for this tenant
      const defaultId = `default-${tenantId.slice(0, 8)}`;
      const preset = this.getPresetConfigs()[HotspotPortalThemePreset.MODERN_DARK];
      const now = new Date().toISOString();
      store.set(defaultId, {
        id: defaultId,
        tenantId,
        name: preset.name || 'القالب الافتراضي',
        themePreset: HotspotPortalThemePreset.MODERN_DARK,
        networkName: preset.networkName || 'شبكة الإنترنت',
        title: preset.title || 'مرحباً بكم في شبكتنا',
        subtitle: preset.subtitle || 'أدخل كود الكرت للاتصال الفوري',
        logoUrl: null,
        primaryColor: preset.primaryColor || '#0EA5E9',
        accentColor: preset.accentColor || '#10B981',
        backgroundColor: preset.backgroundColor || '#0F172A',
        cardColor: preset.cardColor || '#1E293B',
        textColor: preset.textColor || '#F8FAFC',
        loginMethod: HotspotPortalLoginMethod.VOUCHER,
        showRemainingTime: true,
        contactPhone: null,
        termsText: null,
        footerText: preset.footerText || 'مدعوم بواسطة منصة SudaFi',
        customCss: null,
        isDefault: true,
        publishedDeviceId: null,
        lastPublishedAt: null,
        syncStatus: 'DRAFT',
        syncError: null,
        createdAt: now,
        updatedAt: now,
      });
      this.tenantTemplates.set(tenantId, store);
    }
    return this.tenantTemplates.get(tenantId)!;
  }

  /**
   * Lists all portal templates belonging to the tenant.
   */
  async listTemplates(tenantId: string): Promise<HotspotPortalConfig[]> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant ID is required');
    }
    const store = this.getTenantStore(tenantId);
    return Array.from(store.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  /**
   * Retrieves a specific template by ID.
   */
  async getTemplate(tenantId: string, id: string): Promise<HotspotPortalConfig> {
    const store = this.getTenantStore(tenantId);
    const template = store.get(id);
    if (!template) {
      throw new NotFoundException(`Portal template with ID "${id}" was not found`);
    }
    return template;
  }

  /**
   * Creates a new portal template for the tenant.
   */
  async createTemplate(
    tenantId: string,
    dto: CreatePortalTemplateDto,
  ): Promise<HotspotPortalConfig> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant ID is required');
    }

    const store = this.getTenantStore(tenantId);
    const now = new Date().toISOString();
    const id = uuidv4();

    // If marked as default, unset other defaults
    if (dto.isDefault) {
      for (const t of store.values()) {
        t.isDefault = false;
      }
    }

    const template: HotspotPortalConfig = {
      id,
      tenantId,
      name: dto.name,
      themePreset: dto.themePreset ?? HotspotPortalThemePreset.MODERN_DARK,
      networkName: dto.networkName,
      title: dto.title ?? 'مرحباً بكم في شبكتنا',
      subtitle: dto.subtitle ?? 'أدخل كود الكرت للاتصال الفوري',
      logoUrl: dto.logoUrl ?? null,
      primaryColor: dto.primaryColor ?? '#0EA5E9',
      accentColor: dto.accentColor ?? '#10B981',
      backgroundColor: dto.backgroundColor ?? '#0F172A',
      cardColor: dto.cardColor ?? '#1E293B',
      textColor: dto.textColor ?? '#F8FAFC',
      loginMethod: dto.loginMethod ?? HotspotPortalLoginMethod.VOUCHER,
      showRemainingTime: dto.showRemainingTime ?? true,
      contactPhone: dto.contactPhone ?? null,
      termsText: dto.termsText ?? null,
      footerText: dto.footerText ?? 'مدعوم بواسطة منصة SudaFi',
      customCss: dto.customCss ?? null,
      isDefault: dto.isDefault ?? false,
      publishedDeviceId: null,
      lastPublishedAt: null,
      syncStatus: 'DRAFT',
      syncError: null,
      createdAt: now,
      updatedAt: now,
    };

    store.set(id, template);
    this.logger.log(`Created Hotspot Portal template "${template.name}" (${template.id}) for tenant ${tenantId}`);
    return template;
  }

  /**
   * Updates an existing portal template.
   */
  async updateTemplate(
    tenantId: string,
    id: string,
    dto: UpdatePortalTemplateDto,
  ): Promise<HotspotPortalConfig> {
    const template = await this.getTemplate(tenantId, id);
    const store = this.getTenantStore(tenantId);

    if (dto.isDefault) {
      for (const t of store.values()) {
        t.isDefault = false;
      }
    }

    const updated: HotspotPortalConfig = {
      ...template,
      ...dto,
      id: template.id,
      tenantId: template.tenantId,
      updatedAt: new Date().toISOString(),
    };

    store.set(id, updated);
    return updated;
  }

  /**
   * Deletes a portal template.
   */
  async deleteTemplate(tenantId: string, id: string): Promise<{ deleted: boolean; id: string }> {
    const store = this.getTenantStore(tenantId);
    if (!store.has(id)) {
      throw new NotFoundException(`Portal template with ID "${id}" was not found`);
    }
    if (store.size <= 1) {
      throw new BadRequestException('Cannot delete the last remaining portal template');
    }
    store.delete(id);
    return { deleted: true, id };
  }

  /**
   * Renders the safe live HTML preview for an existing template.
   */
  async renderPreview(tenantId: string, id: string): Promise<string> {
    const template = await this.getTemplate(tenantId, id);
    return this.compilerService.compileLoginHtml(template, 'preview');
  }

  /**
   * Renders the safe live HTML preview directly from draft unsaved input.
   */
  renderDraftPreview(dto: CreatePortalTemplateDto): string {
    const mockConfig: HotspotPortalConfig = {
      id: 'draft',
      tenantId: 'preview',
      name: dto.name || 'Draft Preview',
      themePreset: dto.themePreset ?? HotspotPortalThemePreset.MODERN_DARK,
      networkName: dto.networkName || 'شبكة الإنترنت',
      title: dto.title ?? 'مرحباً بكم في شبكتنا',
      subtitle: dto.subtitle ?? 'أدخل كود الكرت للاتصال الفوري',
      logoUrl: dto.logoUrl ?? null,
      primaryColor: dto.primaryColor ?? '#0EA5E9',
      accentColor: dto.accentColor ?? '#10B981',
      backgroundColor: dto.backgroundColor ?? '#0F172A',
      cardColor: dto.cardColor ?? '#1E293B',
      textColor: dto.textColor ?? '#F8FAFC',
      loginMethod: dto.loginMethod ?? HotspotPortalLoginMethod.VOUCHER,
      showRemainingTime: dto.showRemainingTime ?? true,
      contactPhone: dto.contactPhone ?? null,
      termsText: dto.termsText ?? null,
      footerText: dto.footerText ?? 'مدعوم بواسطة منصة SudaFi',
      customCss: dto.customCss ?? null,
      isDefault: false,
      publishedDeviceId: null,
      lastPublishedAt: null,
      syncStatus: 'DRAFT',
      syncError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return this.compilerService.compileLoginHtml(mockConfig, 'preview');
  }

  /**
   * Publishes the compiled captive portal files to the physical MikroTik router via Windows Agent.
   */
  async publishToRouter(
    tenantId: string,
    deviceId: string,
    dto: PublishPortalDto,
  ): Promise<{
    operationId: string;
    queuedCommandId: string;
    status: string;
    directoryName: string;
    filesCount: number;
    message: string;
  }> {
    // 1. Strict Tenant Device Ownership Check
    const device = await this.devicesService.findById(tenantId, deviceId);
    if (!device) {
      throw new NotFoundException(`Device with ID ${deviceId} not found for this tenant`);
    }

    // 2. Resolve Template
    let template: HotspotPortalConfig;
    const store = this.getTenantStore(tenantId);
    if (dto.templateId) {
      template = await this.getTemplate(tenantId, dto.templateId);
    } else {
      // Pick default or first template
      const defaultTpl = Array.from(store.values()).find((t) => t.isDefault);
      template = defaultTpl || Array.from(store.values())[0];
    }

    if (!template) {
      throw new NotFoundException('No template found to publish');
    }

    const directoryName = dto.directoryName?.trim() || 'hotspot';
    if (!/^[a-zA-Z0-9_-]+$/.test(directoryName)) {
      throw new BadRequestException('Target directory name must be alphanumeric with no slashes or spaces');
    }

    // 3. Compile portal bundle with production MikroTik syntax
    const bundle = this.compilerService.compileAllFiles(template);

    // 4. Generate idempotent operationId
    const operationId = uuidv4();

    // 5. Queue command with Windows Agent
    const queued = await this.agentService.queueCommand(tenantId, deviceId, {
      operationId,
      type: AgentCommandType.HOTSPOT_PORTAL_PUBLISH,
      payload: {
        templateId: template.id,
        directoryName,
        files: bundle.files,
        applyToProfile: dto.applyToProfile,
      },
    });

    // 6. Update template publishing tracking state
    template.syncStatus = 'PENDING';
    template.lastPublishedAt = new Date().toISOString();
    template.publishedDeviceId = deviceId;
    store.set(template.id, template);

    this.logger.log(
      `Queued Hotspot Portal deployment for router "${device.name}" (${deviceId}) with operationId [${operationId}]`,
    );

    return {
      operationId,
      queuedCommandId: queued.id,
      status: 'PENDING',
      directoryName,
      filesCount: bundle.files.length,
      message: `تم جدولة نشر صفحة الدخول إلى الراوتر (${device.name}) بنجاح. حالة الأمر: قيد الانتظار (PENDING)`,
    };
  }
}
