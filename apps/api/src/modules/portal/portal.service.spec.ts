import { Test, TestingModule } from '@nestjs/testing';
import { PortalService } from './portal.service';
import { PortalCompilerService } from './portal-compiler.service';
import { DevicesService } from '../devices/devices.service';
import { AgentService } from '../agent/agent.service';
import { NotFoundException } from '@nestjs/common';
import {
  HotspotPortalThemePreset,
  HotspotPortalLoginMethod,
  AgentCommandType,
} from '@mikrotik-saas/shared-types';

describe('PortalService & PortalCompilerService (Task 5.1)', () => {
  let portalService: PortalService;
  let compilerService: PortalCompilerService;
  let devicesService: any;
  let agentService: any;

  const mockTenantId = 'tenant-uuid-1';
  const mockDeviceId = 'device-uuid-1';

  beforeEach(async () => {
    devicesService = {
      findById: jest.fn().mockResolvedValue({
        id: mockDeviceId,
        tenantId: mockTenantId,
        name: 'Main Router',
      }),
    };

    agentService = {
      queueCommand: jest.fn().mockResolvedValue({
        id: 'cmd-queued-uuid-1',
        status: 'PENDING',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortalService,
        PortalCompilerService,
        { provide: DevicesService, useValue: devicesService },
        { provide: AgentService, useValue: agentService },
      ],
    }).compile();

    portalService = module.get<PortalService>(PortalService);
    compilerService = module.get<PortalCompilerService>(PortalCompilerService);
  });

  describe('PortalCompilerService', () => {
    it('should sanitize HTML inputs to prevent XSS attacks', () => {
      const malicious = '<script>alert("XSS")</script>&"\'';
      const clean = compilerService.sanitizeText(malicious);
      expect(clean).not.toContain('<script>');
      expect(clean).toContain('&lt;script&gt;');
      expect(clean).toContain('&amp;');
      expect(clean).toContain('&quot;');
    });

    it('should sanitize CSS input against expression and javascript injection', () => {
      const badCss = 'body { color: red; background: expression(alert(1)); behavior: url(x); }';
      const clean = compilerService.sanitizeCss(badCss);
      expect(clean).not.toContain('expression');
      expect(clean).not.toContain('behavior');
      expect(clean).toContain('color: red;');
    });

    it('should compile login.html with RouterOS variables in router mode', () => {
      const config = {
        id: 'tpl-1',
        tenantId: mockTenantId,
        name: 'Test Dark',
        themePreset: HotspotPortalThemePreset.MODERN_DARK,
        networkName: 'Starlink Test',
        title: 'مرحباً',
        subtitle: 'أدخل الكرت',
        logoUrl: null,
        primaryColor: '#0EA5E9',
        accentColor: '#10B981',
        backgroundColor: '#0F172A',
        cardColor: '#1E293B',
        textColor: '#F8FAFC',
        loginMethod: HotspotPortalLoginMethod.VOUCHER,
        showRemainingTime: true,
        footerText: 'SudaFi Cloud',
        isDefault: true,
        syncStatus: 'DRAFT',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const html = compilerService.compileLoginHtml(config as any, 'router');
      expect(html).toContain('$(link-login-only)');
      expect(html).toContain('$(link-orig)');
      expect(html).toContain('$(error)');
      expect(html).toContain('Starlink Test');
    });

    it('should compile safe preview mode with # action and no unparsed syntax errors', () => {
      const config = {
        id: 'tpl-1',
        tenantId: mockTenantId,
        name: 'Test Dark',
        themePreset: HotspotPortalThemePreset.MODERN_DARK,
        networkName: 'Starlink Test',
        title: 'مرحباً',
        subtitle: 'أدخل الكرت',
        loginMethod: HotspotPortalLoginMethod.VOUCHER,
        showRemainingTime: true,
        isDefault: true,
      };

      const html = compilerService.compileLoginHtml(config as any, 'preview');
      expect(html).toContain('action="#"');
      expect(html).not.toContain('$(link-login-only)');
    });
  });

  describe('PortalService', () => {
    it('should list templates and provide default preset initially', async () => {
      const templates = await portalService.listTemplates(mockTenantId);
      expect(templates.length).toBeGreaterThan(0);
      expect(templates[0].tenantId).toBe(mockTenantId);
      expect(templates[0].isDefault).toBe(true);
    });

    it('should create and update a custom portal template', async () => {
      const created = await portalService.createTemplate(mockTenantId, {
        name: 'تصميم العيد',
        networkName: 'شبكة الواحة',
        primaryColor: '#F59E0B',
        accentColor: '#EF4444',
      });

      expect(created.name).toBe('تصميم العيد');
      expect(created.primaryColor).toBe('#F59E0B');

      const updated = await portalService.updateTemplate(mockTenantId, created.id, {
        networkName: 'شبكة الواحة الجديدة',
      });

      expect(updated.networkName).toBe('شبكة الواحة الجديدة');
    });

    it('should successfully publish portal to router via Agent command', async () => {
      const templates = await portalService.listTemplates(mockTenantId);
      const targetTpl = templates[0];

      const res = await portalService.publishToRouter(mockTenantId, mockDeviceId, {
        templateId: targetTpl.id,
        directoryName: 'hotspot',
      });

      expect(res.status).toBe('PENDING');
      expect(res.directoryName).toBe('hotspot');
      expect(res.filesCount).toBe(2); // login.html, status.html

      // Check agentService.queueCommand was called
      expect(agentService.queueCommand).toHaveBeenCalledWith(
        mockTenantId,
        mockDeviceId,
        expect.objectContaining({
          type: AgentCommandType.HOTSPOT_PORTAL_PUBLISH,
          payload: expect.objectContaining({
            directoryName: 'hotspot',
            files: expect.arrayContaining([
              expect.objectContaining({ name: 'login.html' }),
              expect.objectContaining({ name: 'status.html' }),
            ]),
          }),
        }),
      );
    });

    it('should fail publishing if device does not belong to tenant', async () => {
      devicesService.findById.mockResolvedValueOnce(null);

      await expect(
        portalService.publishToRouter(mockTenantId, 'unknown-device', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
