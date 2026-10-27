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
import { MikrotikClientFactory } from '../../core/mikrotik/mikrotik-client.factory';

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

    it('should inspect hotspot directory and detect profiles and existing files', async () => {
      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        executeCommand: jest.fn(async (cmd: string[]) => {
          if (cmd[0] === '/ip/hotspot/profile/print') {
            return [
              { type: '!re', attributes: { name: 'hsprof1', 'html-directory': 'hotspot' } },
            ];
          }
          if (cmd[0] === '/file/print') {
            return [
              { type: '!re', attributes: { name: 'hotspot/login.html' } },
              { type: '!re', attributes: { name: 'hotspot/alogin.html' } },
            ];
          }
          return [];
        }),
      };

      const mockFactory: any = {
        getClient: jest.fn().mockResolvedValue(mockClient),
      };

      devicesService.findById.mockResolvedValueOnce({
        id: mockDeviceId,
        name: 'CCR Router',
        passwordEncrypted: 'enc-pass',
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PortalService,
          PortalCompilerService,
          { provide: DevicesService, useValue: devicesService },
          { provide: AgentService, useValue: agentService },
          { provide: MikrotikClientFactory, useValue: mockFactory },
        ],
      }).compile();

      const service = module.get<PortalService>(PortalService);
      const info = await service.inspectHotspot(mockTenantId, mockDeviceId);

      expect(info.activeDirectory).toBe('hotspot');
      expect(info.existingFilesCount).toBe(2);
      expect(info.profiles[0].name).toBe('hsprof1');
    });

    it('should reject imported files bundle if missing HTML file', async () => {
      await expect(
        portalService.publishToRouter(mockTenantId, mockDeviceId, {
          files: [
            { name: 'style.css', content: 'body { color: red; }' },
            { name: 'logo.png', content: 'base64...' },
          ],
        }),
      ).rejects.toThrow('يجب أن يحتوي مجلد الصفحة المستوردة على ملف HTML رئيسي');
    });

    it('should reject dangerous executable file extensions in imported files', async () => {
      await expect(
        portalService.publishToRouter(mockTenantId, mockDeviceId, {
          files: [
            { name: 'login.html', content: '<html><body>test</body></html>' },
            { name: 'trojan.exe', content: 'malicious' },
          ],
        }),
      ).rejects.toThrow('امتداد الملف (.exe) محظور لأسباب أمنية');
    });

    it('should throw ConflictException if target directory has existing files and overwrite is not confirmed', async () => {
      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        executeCommand: jest.fn(async (cmd: string[]) => {
          if (cmd[0] === '/file/print') {
            return [
              { type: '!re', attributes: { name: 'hotspot-staging/login.html' } },
              { type: '!re', attributes: { name: 'hotspot-staging/style.css' } },
            ];
          }
          return [];
        }),
      };

      const mockFactory: any = {
        getClient: jest.fn().mockResolvedValue(mockClient),
      };

      devicesService.findById.mockResolvedValue({
        id: mockDeviceId,
        name: 'CCR Router',
        passwordEncrypted: 'enc-pass',
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PortalService,
          PortalCompilerService,
          { provide: DevicesService, useValue: devicesService },
          { provide: AgentService, useValue: agentService },
          { provide: MikrotikClientFactory, useValue: mockFactory },
        ],
      }).compile();

      const service = module.get<PortalService>(PortalService);

      await expect(
        service.publishToRouter(mockTenantId, mockDeviceId, {
          directoryName: 'hotspot',
          files: [
            { name: 'login.html', content: '<h1>New Portal</h1>' },
          ],
          overwriteConfirmed: false,
        }),
      ).rejects.toThrow('المجلد المرحلي (hotspot-staging) يحتوي بالفعل على 2 ملفات سابقة');
    });

    it('should publish and verify files in staging directory and preserve original profile settings', async () => {
      const executedCommands: (string | Buffer)[][] = [];
      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        executeCommand: jest.fn(async (cmd: (string | Buffer)[]) => {
          executedCommands.push(cmd);
          if (cmd[0] === '/ip/hotspot/profile/print') {
            return [
              { type: '!re', attributes: { '.id': '*1', name: 'hsprof1', 'html-directory': 'original-hotspot' } },
            ];
          }
          if (cmd[0] === '/file/print' && typeof cmd[1] === 'string' && cmd[1]?.startsWith('?name=')) {
            return []; // file doesn't exist yet
          }
          if (cmd[0] === '/file/print') {
            return [
              { type: '!re', attributes: { name: 'hotspot-staging/login.html', size: '512' } },
              { type: '!re', attributes: { name: 'hotspot-staging/css/style.css', size: '256' } },
            ];
          }
          return [{ type: '!done' }];
        }),
      };

      const mockFactory: any = {
        getClient: jest.fn().mockResolvedValue(mockClient),
      };

      devicesService.findById.mockResolvedValue({
        id: mockDeviceId,
        name: 'CCR Router',
        passwordEncrypted: 'enc-pass',
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PortalService,
          PortalCompilerService,
          { provide: DevicesService, useValue: devicesService },
          { provide: AgentService, useValue: agentService },
          { provide: MikrotikClientFactory, useValue: mockFactory },
        ],
      }).compile();

      const service = module.get<PortalService>(PortalService);

      const res = await service.publishToRouter(mockTenantId, mockDeviceId, {
        directoryName: 'hotspot',
        files: [
          { name: 'login.html', content: '<h1>New Portal</h1>' },
          { name: 'css/style.css', content: 'body { margin: 0; }' },
        ],
        overwriteConfirmed: true,
      });

      expect(res.status).toBe('COMPLETED');
      expect(res.stagingDirectory).toBe('hotspot-staging');
      expect(res.originalProfileName).toBe('hsprof1');
      expect(res.originalHtmlDirectory).toBe('original-hotspot');
      expect(res.rollbackSupported).toBe(true);
      expect(res.filesWritten).toEqual(['login.html', 'css/style.css']);
      expect(res.filesVerified).toEqual(['login.html', 'css/style.css']);
    });

    it('should abort immediately and NOT activate profile if file 2 fails to upload', async () => {
      let filesAddedCount = 0;
      const executedCommands: (string | Buffer)[][] = [];

      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        executeCommand: jest.fn(async (cmd: (string | Buffer)[]) => {
          executedCommands.push(cmd);
          if (cmd[0] === '/ip/hotspot/profile/print') {
            return [
              { type: '!re', attributes: { '.id': '*1', name: 'hsprof1', 'html-directory': 'original-active-hotspot' } },
            ];
          }
          if (cmd[0] === '/file/print' && typeof cmd[1] === 'string' && cmd[1]?.startsWith('?name=')) {
            return [];
          }
          if (cmd[0] === '/file/add') {
            filesAddedCount++;
            if (filesAddedCount === 2) {
              // Simulate network failure or router disk error on file 2
              return [{ type: '!trap', attributes: { message: 'Connection reset or write error' } }];
            }
          }
          return [{ type: '!done' }];
        }),
      };

      const mockFactory: any = {
        getClient: jest.fn().mockResolvedValue(mockClient),
      };

      devicesService.findById.mockResolvedValue({
        id: mockDeviceId,
        name: 'CCR Router',
        passwordEncrypted: 'enc-pass',
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PortalService,
          PortalCompilerService,
          { provide: DevicesService, useValue: devicesService },
          { provide: AgentService, useValue: agentService },
          { provide: MikrotikClientFactory, useValue: mockFactory },
        ],
      }).compile();

      const service = module.get<PortalService>(PortalService);

      await expect(
        service.publishToRouter(mockTenantId, mockDeviceId, {
          directoryName: 'hotspot',
          files: [
            { name: 'login.html', content: '<h1>Step 1</h1>' },
            { name: 'broken.css', content: 'body {}' },
          ],
          overwriteConfirmed: true,
        }),
      ).rejects.toThrow('تعذر إنشاء ملف (hotspot-staging/broken.css) على الراوتر');

      // Crucial verification: /ip/hotspot/profile/set was NEVER executed!
      const profileSetExecuted = executedCommands.some((c) => c[0] === '/ip/hotspot/profile/set');
      expect(profileSetExecuted).toBe(false);
    });

    it('should reject corrupted base64 binary content with an informative error', async () => {
      devicesService.findById.mockResolvedValueOnce({
        id: mockDeviceId,
        name: 'CCR Router',
        passwordEncrypted: 'enc-pass',
      });

      await expect(
        portalService.publishToRouter(mockTenantId, mockDeviceId, {
          directoryName: 'hotspot',
          files: [
            { name: 'login.html', content: '<h1>Test</h1>' },
            { name: 'corrupted-image.png', content: '    ', encoding: 'base64' },
          ],
        }),
      ).rejects.toThrow('فارغ أو تالف وغير صالح');
    });

    it('should send binary files as raw Buffer to prevent UTF-8 text corruption', async () => {
      const executedCommands: (string | Buffer)[][] = [];
      const binaryData = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); // PNG header bytes
      const base64Data = binaryData.toString('base64');

      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        executeCommand: jest.fn(async (cmd: (string | Buffer)[]) => {
          executedCommands.push(cmd);
          if (cmd[0] === '/ip/hotspot/profile/print') {
            return [{ type: '!re', attributes: { '.id': '*1', name: 'hsprof1', 'html-directory': 'hotspot' } }];
          }
          if (cmd[0] === '/file/print') {
            return [
              { type: '!re', attributes: { name: 'hotspot-staging/login.html', size: '128' } },
              { type: '!re', attributes: { name: 'hotspot-staging/logo.png', size: '8' } },
            ];
          }
          return [{ type: '!done' }];
        }),
      };

      const mockFactory: any = {
        getClient: jest.fn().mockResolvedValue(mockClient),
      };

      devicesService.findById.mockResolvedValue({
        id: mockDeviceId,
        name: 'CCR Router',
        passwordEncrypted: 'enc-pass',
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PortalService,
          PortalCompilerService,
          { provide: DevicesService, useValue: devicesService },
          { provide: AgentService, useValue: agentService },
          { provide: MikrotikClientFactory, useValue: mockFactory },
        ],
      }).compile();

      const service = module.get<PortalService>(PortalService);

      await service.publishToRouter(mockTenantId, mockDeviceId, {
        directoryName: 'hotspot',
        files: [
          { name: 'login.html', content: '<h1>Test</h1>' },
          { name: 'logo.png', content: base64Data, encoding: 'base64' },
        ],
        overwriteConfirmed: true,
      });

      // Find the /file/add command for logo.png
      const addCmd = executedCommands.find(
        (c) => c[0] === '/file/add' && typeof c[1] === 'string' && c[1].includes('logo.png'),
      );
      expect(addCmd).toBeDefined();

      const contentsWord = addCmd![2];
      expect(Buffer.isBuffer(contentsWord)).toBe(true);
      // Verify raw bytes match original PNG header without UTF-8 expansion
      const expectedBuffer = Buffer.concat([Buffer.from('=contents='), binaryData]);
      expect(contentsWord).toEqual(expectedBuffer);
    });

    it('should successfully rollback profile to previous html-directory', async () => {
      const executedCommands: (string | Buffer)[][] = [];
      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        executeCommand: jest.fn(async (cmd: (string | Buffer)[]) => {
          executedCommands.push(cmd);
          if (cmd[0] === '/ip/hotspot/profile/print') {
            return [{ type: '!re', attributes: { '.id': '*1', name: 'hsprof1', 'html-directory': 'hotspot-staging' } }];
          }
          return [{ type: '!done' }];
        }),
      };

      const mockFactory: any = {
        getClient: jest.fn().mockResolvedValue(mockClient),
      };

      devicesService.findById.mockResolvedValue({
        id: mockDeviceId,
        name: 'CCR Router',
        passwordEncrypted: 'enc-pass',
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PortalService,
          PortalCompilerService,
          { provide: DevicesService, useValue: devicesService },
          { provide: AgentService, useValue: agentService },
          { provide: MikrotikClientFactory, useValue: mockFactory },
        ],
      }).compile();

      const service = module.get<PortalService>(PortalService);

      const rollbackRes = await service.rollbackProfile(mockTenantId, mockDeviceId, {
        profileName: 'hsprof1',
        htmlDirectory: 'hotspot-previous',
      });

      expect(rollbackRes.success).toBe(true);
      expect(rollbackRes.profile).toBe('hsprof1');
      expect(rollbackRes.htmlDirectory).toBe('hotspot-previous');
      expect(executedCommands).toContainEqual([
        '/ip/hotspot/profile/set',
        '=.id=*1',
        '=html-directory=hotspot-previous',
      ]);
    });

    it('should fail publishing if device does not belong to tenant', async () => {
      devicesService.findById.mockResolvedValueOnce(null);

      await expect(
        portalService.publishToRouter(mockTenantId, 'unknown-device', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should compile pre-built template with customized networkName and USER_PASS loginMethod', async () => {
      const res = await portalService.publishToRouter(mockTenantId, mockDeviceId, {
        themePreset: 'MODERN_DARK',
        networkName: 'شبكة النور السريعة',
        loginMethod: 'USER_PASS',
      });

      expect(res.status).toBe('PENDING');
      expect(agentService.queueCommand).toHaveBeenCalledWith(
        mockTenantId,
        mockDeviceId,
        expect.objectContaining({
          type: AgentCommandType.HOTSPOT_PORTAL_PUBLISH,
          payload: expect.objectContaining({
            files: expect.arrayContaining([
              expect.objectContaining({
                name: 'login.html',
                content: expect.stringContaining('شبكة النور السريعة'),
              }),
            ]),
          }),
        }),
      );

      const lastCall = agentService.queueCommand.mock.calls[agentService.queueCommand.mock.calls.length - 1];
      const loginHtmlFile = lastCall[2].payload.files.find((f: any) => f.name === 'login.html');
      expect(loginHtmlFile.content).toContain('type="password"');
      expect(loginHtmlFile.content).toContain('شبكة النور السريعة');
    });

    it('should compile pre-built template with customized networkName and VOUCHER loginMethod', async () => {
      const res = await portalService.publishToRouter(mockTenantId, mockDeviceId, {
        themePreset: 'STARLINK_CYAN',
        networkName: 'Starlink Custom WiFi',
        loginMethod: 'VOUCHER',
      });

      expect(res.status).toBe('PENDING');
      const lastCall = agentService.queueCommand.mock.calls[agentService.queueCommand.mock.calls.length - 1];
      const loginHtmlFile = lastCall[2].payload.files.find((f: any) => f.name === 'login.html');
      expect(loginHtmlFile.content).toContain('Starlink Custom WiFi');
      expect(loginHtmlFile.content).toContain('كود كرت الإنترنت');
      expect(loginHtmlFile.content).toContain('type="hidden" id="password"');
    });
  });
});

