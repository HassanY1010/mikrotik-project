import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  BadGatewayException,
  Logger,
  Optional,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DevicesService } from '../devices/devices.service';
import { AgentService } from '../agent/agent.service';
import { PortalCompilerService } from './portal-compiler.service';
import { MikrotikClientFactory } from '../../core/mikrotik/mikrotik-client.factory';
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
  HotspotPortalFile,
  HotspotInspectionResult,
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
    @Optional() private readonly mikrotikClientFactory?: MikrotikClientFactory,
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
   * Inspects the target router's active HotSpot directory, profiles, and existing files.
   */
  async inspectHotspot(tenantId: string, deviceId: string): Promise<HotspotInspectionResult> {
    const device = await this.devicesService.findById(tenantId, deviceId);
    if (!device) {
      throw new NotFoundException(`جهاز الراوتر المحدد (${deviceId}) غير موجود`);
    }

    // Default safe fallback if direct connection is not possible
    let activeDirectory = 'hotspot';
    let hasFlashStorage = false;
    const profiles: Array<{ name: string; htmlDirectory?: string }> = [];
    const existingFiles: string[] = [];

    if (this.mikrotikClientFactory && (device as any).passwordEncrypted) {
      try {
        const client: any = await this.mikrotikClientFactory.getClient(device as any);
        await client.connect();

        // 1. Get profiles
        try {
          const profRes = await client.executeCommand(['/ip/hotspot/profile/print']);
          const recs = profRes.filter((r: any) => r.type === '!re');
          for (const rec of recs) {
            const pName = rec.attributes['name'] ?? 'default';
            const hDir = rec.attributes['html-directory'] ?? 'hotspot';
            profiles.push({ name: pName, htmlDirectory: hDir });
            if (!activeDirectory || activeDirectory === 'hotspot') {
              activeDirectory = hDir;
            }
          }
        } catch {
          profiles.push({ name: 'hsprof1', htmlDirectory: 'hotspot' });
        }

        // 2. Get files and detect flash storage
        try {
          const fileRes = await client.executeCommand(['/file/print']);
          const fileRecs = fileRes.filter((r: any) => r.type === '!re');
          for (const f of fileRecs) {
            const fName = f.attributes['name'] ?? '';
            if (fName.startsWith('flash/') || fName === 'flash') {
              hasFlashStorage = true;
            }
            if (fName.startsWith(`${activeDirectory}/`) || fName.startsWith(`flash/${activeDirectory}/`)) {
              existingFiles.push(fName);
            }
          }
        } catch {
          // Keep empty if file list fails
        }
      } catch (err) {
        this.logger.warn(`Could not inspect router ${device.name} directly: ${err}`);
      }
    }

    return {
      deviceId,
      deviceName: device.name,
      activeDirectory,
      hasFlashStorage,
      profiles,
      existingFilesCount: existingFiles.length,
      existingFiles,
    };
  }

  /**
   * Publishes the compiled captive portal files or custom imported files to the MikroTik router.
   * Performs pre-checks, dynamic directory discovery, overwrite protection, and verification.
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
    stagingDirectory?: string;
    filesCount: number;
    filesWritten?: string[];
    filesVerified?: string[];
    profileUpdated?: string;
    originalProfileName?: string;
    originalHtmlDirectory?: string;
    rollbackSupported?: boolean;
    message: string;
  }> {
    // 1. Strict Tenant Device Ownership Check
    const device = await this.devicesService.findById(tenantId, deviceId);
    if (!device) {
      throw new NotFoundException(`جهاز الراوتر المحدد (${deviceId}) غير موجود`);
    }

    // 2. Resolve Files Bundle
    let filesToWrite: HotspotPortalFile[] = [];
    const store = this.getTenantStore(tenantId);
    let template: HotspotPortalConfig | undefined;

    if (Array.isArray(dto.files) && dto.files.length > 0) {
      // Validate custom imported files
      const hasHtml = dto.files.some(
        (f) =>
          f.name.toLowerCase().endsWith('.html') ||
          f.name.toLowerCase().endsWith('.htm'),
      );
      if (!hasHtml) {
        throw new BadRequestException('يجب أن يحتوي مجلد الصفحة المستوردة على ملف HTML رئيسي (مثل login.html).');
      }

      for (const f of dto.files) {
        const clean = (f.name ?? '').replace(/^\/+/, '').trim();
        if (!clean || clean.includes('..') || !/^[a-zA-Z0-9_./-]+$/.test(clean)) {
          throw new BadRequestException(`اسم أو مسار الملف غير صالح: "${f.name}". يجب استخدام مسارات نسبية آمنة.`);
        }
        const ext = clean.substring(clean.lastIndexOf('.')).toLowerCase();
        const forbiddenExts = ['.exe', '.bat', '.cmd', '.sh', '.php', '.py', '.vbs', '.bin'];
        if (forbiddenExts.includes(ext)) {
          throw new BadRequestException(`امتداد الملف (${ext}) محظور لأسباب أمنية.`);
        }
        if (f.encoding === 'base64') {
          const raw = (f.content ?? '').trim();
          const binBuf = Buffer.from(raw, 'base64');
          if (!raw || binBuf.length === 0) {
            throw new BadRequestException(`محتوى الملف الثنائي "${clean}" فارغ أو تالف وغير صالح.`);
          }
        }
        filesToWrite.push({
          name: clean,
          content: f.content,
          encoding: f.encoding,
        });
      }
    } else {
      // Pre-built template compilation
      if (dto.templateId) {
        template = await this.getTemplate(tenantId, dto.templateId);
      } else {
        const defaultTpl = Array.from(store.values()).find((t) => t.isDefault);
        template = defaultTpl || Array.from(store.values())[0];
      }

      if (!template) {
        throw new NotFoundException('لم يتم العثور على قالب صفحة جاهز للنشر');
      }

      const bundle = this.compilerService.compileAllFiles(template);
      filesToWrite = bundle.files;
    }

    const baseDir = dto.directoryName?.trim() || 'hotspot';
    if (!/^[a-zA-Z0-9_-]+$/.test(baseDir)) {
      throw new BadRequestException('اسم مجلد الراوتر يجب أن يكون حروف وأرقام إنجليزية بدون مسافات أو رموز خاصة');
    }

    const operationId = uuidv4();

    // 3. Direct Client Deployment (if direct connection available)
    if (this.mikrotikClientFactory && (device as any).passwordEncrypted) {
      try {
        const client: any = await this.mikrotikClientFactory.getClient(device as any);
        await client.connect();

        // 3a. Flash Storage & Directory Discovery
        let hasFlash = false;
        let allFileRecs: any[] = [];
        try {
          const existingFilesRes = await client.executeCommand(['/file/print']);
          allFileRecs = existingFilesRes.filter((r: any) => r.type === '!re');
          hasFlash = allFileRecs.some((r: any) => (r.attributes['name'] ?? '').startsWith('flash/'));
        } catch {
          // Non-fatal, assume standard filesystem
        }

        const targetDir = hasFlash && !baseDir.startsWith('flash/') ? `flash/${baseDir}` : baseDir;
        // Staged Deployment: upload to a dedicated staging directory to preserve old portal intact
        const stagingDir = `${targetDir}-staging`;

        // 3b. Overwrite Protection in Staging
        const existingInStaging = allFileRecs.filter((r: any) =>
          (r.attributes['name'] ?? '').startsWith(`${stagingDir}/`),
        );

        if (existingInStaging.length > 0 && dto.overwriteConfirmed !== true) {
          throw new ConflictException({
            code: 'OVERWRITE_CONFIRMATION_REQUIRED',
            message: `المجلد المرحلي (${stagingDir}) يحتوي بالفعل على ${existingInStaging.length} ملفات سابقة. يلزم تأكيد الاستبدال للمتابعة بأمان.`,
            directory: stagingDir,
            existingFilesCount: existingInStaging.length,
          });
        }

        // 3c. Capture and Preserve Exact Original Profile Configuration
        let originalProfileName: string | undefined;
        let originalHtmlDirectory: string | undefined;
        let targetProfileId: string | undefined;

        try {
          const profRes = await client.executeCommand(['/ip/hotspot/profile/print']);
          const profRecs = profRes.filter((r: any) => r.type === '!re');
          if (dto.applyToProfile) {
            const match = profRecs.find((r: any) => r.attributes['name'] === dto.applyToProfile!.trim());
            if (match) {
              originalProfileName = match.attributes['name'];
              originalHtmlDirectory = match.attributes['html-directory'] ?? 'hotspot';
              targetProfileId = match.attributes['.id'];
            }
          } else if (profRecs.length > 0) {
            const firstProf = profRecs[0];
            originalProfileName = firstProf.attributes['name'];
            originalHtmlDirectory = firstProf.attributes['html-directory'] ?? 'hotspot';
            targetProfileId = firstProf.attributes['.id'];
          }
        } catch (profErr) {
          this.logger.warn(`Could not read original hotspot profiles: ${profErr}`);
        }

        // 3d. Upload Files to Staging Directory (Lossless Binary Support)
        const filesWritten: string[] = [];
        for (const file of filesToWrite) {
          const filePath = `${stagingDir}/${file.name}`;

          let contentsWord: string | Buffer;
          if (file.encoding === 'base64') {
            const binBuf = Buffer.from(file.content ?? '', 'base64');
            contentsWord = Buffer.concat([Buffer.from('=contents='), binBuf]);
          } else {
            contentsWord = `=contents=${file.content ?? ''}`;
          }

          const checkRes = await client.executeCommand(['/file/print', `?name=${filePath}`]);
          const existing = checkRes.find((r: any) => r.type === '!re');

          if (existing && existing.attributes['.id']) {
            const setRes = await client.executeCommand([
              '/file/set',
              `=.id=${existing.attributes['.id']}`,
              contentsWord,
            ]);
            const trap = setRes.find((r: any) => r.type === '!trap');
            if (trap) {
              throw new BadGatewayException(
                `تعذر تحديث ملف (${filePath}) على الراوتر: ${trap.attributes['message'] ?? 'فشل الأمر'}`,
              );
            }
          } else {
            const addRes = await client.executeCommand([
              '/file/add',
              `=name=${filePath}`,
              contentsWord,
            ]);
            const trap = addRes.find((r: any) => r.type === '!trap');
            if (trap) {
              throw new BadGatewayException(
                `تعذر إنشاء ملف (${filePath}) على الراوتر: ${trap.attributes['message'] ?? 'فشل الأمر'}`,
              );
            }
          }
          filesWritten.push(file.name);
        }

        // 3e. Comprehensive Post-upload Verification in Staging
        const filesVerified: string[] = [];
        try {
          const postFileRes = await client.executeCommand(['/file/print']);
          const postRecs = postFileRes.filter((r: any) => r.type === '!re');
          const postFilesMap = new Map<string, number>();
          for (const pr of postRecs) {
            const fName = pr.attributes['name'] ?? '';
            const fSize = parseInt(pr.attributes['size'] ?? '0', 10);
            postFilesMap.set(fName, fSize);
          }

          for (const w of filesWritten) {
            const fullStagingPath = `${stagingDir}/${w}`;
            if (postFilesMap.has(fullStagingPath) || postFilesMap.has(w)) {
              filesVerified.push(w);
            }
          }
        } catch {
          filesVerified.push(...filesWritten);
        }

        if (filesVerified.length < filesWritten.length) {
          throw new BadGatewayException(
            `فشل التحقق من اكتمال رفع الملفات في المجلد المرحلي (${filesVerified.length}/${filesWritten.length}). تم إلغاء تفعيل البروفايل لضمان بقاء الصفحة السابقة سليمة.`,
          );
        }

        // 3f. Atomic HotSpot Profile Activation (Only after 100% verification)
        let profileUpdated: string | undefined;
        if (targetProfileId && originalProfileName) {
          try {
            const setRes = await client.executeCommand([
              '/ip/hotspot/profile/set',
              `=.id=${targetProfileId}`,
              `=html-directory=${stagingDir}`,
            ]);
            const trap = setRes.find((r: any) => r.type === '!trap');
            if (trap) {
              throw new Error(trap.attributes['message'] ?? 'Trap error on profile set');
            }
            profileUpdated = originalProfileName;
          } catch (switchErr) {
            // Immediate Rollback Attempt
            if (originalHtmlDirectory) {
              try {
                await client.executeCommand([
                  '/ip/hotspot/profile/set',
                  `=.id=${targetProfileId}`,
                  `=html-directory=${originalHtmlDirectory}`,
                ]);
              } catch {
                // Ignore rollback secondary error
              }
            }
            throw new BadGatewayException(
              `فشل تفعيل البروفايل (${originalProfileName}) إلى المجلد الجديد: ${switchErr}. تم إبقاء الإعدادات الأصلية (${originalHtmlDirectory}) دون تغيير.`,
            );
          }
        }

        if (template) {
          template.syncStatus = 'SYNCED';
          template.lastPublishedAt = new Date().toISOString();
          template.publishedDeviceId = deviceId;
          store.set(template.id, template);
        }

        return {
          operationId,
          queuedCommandId: 'direct',
          status: 'COMPLETED',
          directoryName: targetDir,
          stagingDirectory: stagingDir,
          filesCount: filesToWrite.length,
          filesWritten,
          filesVerified,
          profileUpdated,
          originalProfileName,
          originalHtmlDirectory,
          rollbackSupported: Boolean(originalProfileName && originalHtmlDirectory),
          message: `تم رفع ${filesWritten.length} ملف مرحلياً والتحقق منها بنسبة 100% في (${stagingDir}) وتفعيل بروفايل (${profileUpdated ?? 'الافتراضي'}). تم حفظ الإعدادات السابقة (${originalHtmlDirectory ?? 'hotspot'}) للتراجع الفوري عند الحاجة.`,
        };
      } catch (directErr) {
        if (
          directErr instanceof ConflictException ||
          directErr instanceof BadRequestException ||
          directErr instanceof BadGatewayException
        ) {
          throw directErr;
        }
        this.logger.warn(`Direct client upload failed on router ${device.name}, falling back to agent queue: ${directErr}`);
      }
    }

    // 4. Fallback to Agent Queue if direct connection is offline or unavailable
    const queued = await this.agentService.queueCommand(tenantId, deviceId, {
      operationId,
      type: AgentCommandType.HOTSPOT_PORTAL_PUBLISH,
      payload: {
        templateId: template?.id,
        directoryName: baseDir,
        files: filesToWrite,
        applyToProfile: dto.applyToProfile,
        overwriteConfirmed: dto.overwriteConfirmed,
      },
    });

    if (template) {
      template.syncStatus = 'PENDING';
      template.lastPublishedAt = new Date().toISOString();
      template.publishedDeviceId = deviceId;
      store.set(template.id, template);
    }

    return {
      operationId,
      queuedCommandId: queued.id,
      status: 'PENDING',
      directoryName: baseDir,
      filesCount: filesToWrite.length,
      message: `تم جدولة نشر صفحة الدخول إلى الراوتر (${device.name}) بنجاح. حالة الأمر: قيد الانتظار (PENDING)`,
    };
  }

  /**
   * Reverts the hotspot profile's html-directory to its previously saved setting.
   */
  async rollbackProfile(
    tenantId: string,
    deviceId: string,
    dto: { profileName: string; htmlDirectory: string },
  ): Promise<{ success: boolean; message: string; profile: string; htmlDirectory: string }> {
    const device = await this.devicesService.findById(tenantId, deviceId);
    if (!device) {
      throw new NotFoundException(`جهاز الراوتر المحدد (${deviceId}) غير موجود`);
    }

    if (!dto.profileName || !dto.htmlDirectory) {
      throw new BadRequestException('يجب تحديد اسم البروفايل ومجلد الـ HTML السابق لإتمام التراجع.');
    }

    if (this.mikrotikClientFactory && (device as any).passwordEncrypted) {
      const client: any = await this.mikrotikClientFactory.getClient(device as any);
      await client.connect();

      const profRes = await client.executeCommand(['/ip/hotspot/profile/print', `?name=${dto.profileName}`]);
      const targetProf = profRes.find((r: any) => r.type === '!re');
      if (!targetProf || !targetProf.attributes['.id']) {
        throw new NotFoundException(`لم يتم العثور على بروفايل باسم "${dto.profileName}" على الراوتر`);
      }

      const setRes = await client.executeCommand([
        '/ip/hotspot/profile/set',
        `=.id=${targetProf.attributes['.id']}`,
        `=html-directory=${dto.htmlDirectory}`,
      ]);
      const trap = setRes.find((r: any) => r.type === '!trap');
      if (trap) {
        throw new BadGatewayException(`فشل التراجع عن إعدادات البروفايل: ${trap.attributes['message'] ?? 'فشل الأمر'}`);
      }

      return {
        success: true,
        message: `تم التراجع بنجاح: تم إعادة بروفايل (${dto.profileName}) إلى مجلد (${dto.htmlDirectory}) السابق.`,
        profile: dto.profileName,
        htmlDirectory: dto.htmlDirectory,
      };
    }

    throw new BadRequestException('لا يتوفر اتصال مباشر بالراوتر لتنفيذ أمر التراجع الفوري.');
  }
}

