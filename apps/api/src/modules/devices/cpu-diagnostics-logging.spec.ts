import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import { DeviceStatus, RouterOsVersion } from '@prisma/client';
import { RoleName } from '@mikrotik-saas/shared-types';
import { DevicesService } from './devices.service';
import { PrismaService } from '../../core/database/prisma.service';
import { EncryptionService } from '../../core/security/encryption.service';
import { MikrotikClientFactory } from '../../core/mikrotik/mikrotik-client.factory';
import { ReportLocalTelemetryDto } from './dto/report-local-telemetry.dto';

describe('CPU Telemetry Diagnostics Logging (Render Logs via /local-telemetry)', () => {
  let devicesService: DevicesService;
  let prisma: any;

  const tenantId = 'tenant-1';
  const deviceId = 'dev-cpu-1';

  const makeDeviceRecord = (overrides: Record<string, any> = {}) => ({
    id: deviceId,
    tenantId,
    name: 'RB750Gr3',
    host: '192.168.88.1',
    apiPort: 8728,
    restPort: 80,
    useSsl: false,
    username: 'admin',
    passwordEncrypted: 'enc',
    iv: 'iv',
    authTag: 'tag',
    rosVersion: RouterOsVersion.V7,
    isOnline: true,
    status: DeviceStatus.ONLINE,
    cpuLoad: 3,
    memoryFree: null,
    memoryTotal: null,
    diskFree: null,
    diskTotal: null,
    uptime: '1h',
    modelName: 'RB750Gr3',
    isLocked: false,
    antiTetheringEnabled: false,
    lastSyncAt: new Date('2026-11-27T05:00:00.000Z'),
    lastError: null,
    deletedAt: null,
    createdAt: new Date('2026-11-27T04:00:00.000Z'),
    updatedAt: new Date('2026-11-27T05:00:00.000Z'),
    ...overrides,
  });

  beforeEach(async () => {
    DevicesService.clearChannelState(deviceId);

    prisma = {
      subscription: { findFirst: jest.fn() },
      mikroTikDevice: {
        count: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
      userDeviceAccess: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      hotspotActiveSession: {
        count: jest.fn().mockResolvedValue(0),
      },
      tenant: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((cb) => (typeof cb === 'function' ? cb(prisma) : Promise.all(cb))),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevicesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: EncryptionService,
          useValue: {
            encrypt: jest.fn(),
            decrypt: jest.fn(),
            tryDecrypt: jest.fn(),
            deriveDeterministicSecret: jest.fn(),
          },
        },
        {
          provide: MikrotikClientFactory,
          useValue: {
            getClient: jest.fn(),
            invalidateClient: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    devicesService = module.get<DevicesService>(DevicesService);
  });

  it('logs cpuDiagnostics entries via NestJS Logger without persisting them to DB', async () => {
    const device = makeDeviceRecord();
    prisma.mikroTikDevice.findFirst.mockResolvedValue(device);
    prisma.mikroTikDevice.update.mockResolvedValue({ ...device, cpuLoad: 14 });

    const loggerSpy = jest.spyOn((devicesService as any).logger, 'log');

    const dto: ReportLocalTelemetryDto = {
      isOnline: true,
      status: 'ONLINE',
      reportedHost: '192.168.88.1',
      cpuLoad: 14,
      verifiedAt: new Date().toISOString(),
      cpuDiagnostics: [
        {
          seq: 1,
          timestamp: '2026-11-27T05:20:00.100Z',
          status: 'OK',
          cpuLoad: 13,
          rttMs: 28,
          ok: 1,
          fail: 0,
          timeout: 0,
          skippedOverlaps: 0,
        },
        {
          seq: 2,
          timestamp: '2026-11-27T05:20:01.600Z',
          status: 'OK',
          cpuLoad: 14,
          rttMs: 31,
          deltaMs: 1500,
          ok: 2,
          fail: 0,
          timeout: 0,
          skippedOverlaps: 1,
        },
      ],
    };

    await devicesService.reportLocalTelemetry(tenantId, deviceId, dto, {
      id: 'user-1',
      role: RoleName.OWNER,
      tenantId,
    } as any);

    const diagLogs = loggerSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((msg) => msg.includes('[CpuTelemetryDiag]'));

    expect(diagLogs).toHaveLength(2);
    expect(diagLogs[0]).toContain('device=dev-cpu-1');
    expect(diagLogs[0]).toContain('tenant=tenant-1');
    expect(diagLogs[0]).toContain('seq=1');
    expect(diagLogs[0]).toContain('rttMs=28');
    expect(diagLogs[0]).toContain('deltaMs=first');
    expect(diagLogs[1]).toContain('seq=2');
    expect(diagLogs[1]).toContain('deltaMs=1500');
    expect(diagLogs[1]).toContain('skippedOverlaps=1');

    // Verify cpuDiagnostics is NEVER persisted in Prisma update
    const updateArg = prisma.mikroTikDevice.update.mock.calls[0][0];
    expect(updateArg.data).not.toHaveProperty('cpuDiagnostics');
  });

  it('isolates devices across tenants and rejects unauthorized users without logging', async () => {
    // Device belongs to tenant-1, caller is from tenant-2 -> findFirst returns null
    prisma.mikroTikDevice.findFirst.mockResolvedValue(null);
    const loggerSpy = jest.spyOn((devicesService as any).logger, 'log');

    await expect(
      devicesService.reportLocalTelemetry(
        'tenant-2',
        deviceId,
        {
          isOnline: true,
          cpuDiagnostics: [
            {
              seq: 1,
              timestamp: '2026-11-27T05:20:00.100Z',
              status: 'OK',
              cpuLoad: 10,
              rttMs: 20,
              ok: 1,
              fail: 0,
              timeout: 0,
              skippedOverlaps: 0,
            },
          ],
        },
        { id: 'user-other', role: RoleName.OWNER, tenantId: 'tenant-2' } as any,
      ),
    ).rejects.toThrow();

    // Unprivileged cashier without UserDeviceAccess assignment on same tenant
    prisma.mikroTikDevice.findFirst.mockResolvedValue(makeDeviceRecord());
    prisma.userDeviceAccess.findUnique.mockResolvedValue(null);

    await expect(
      devicesService.reportLocalTelemetry(
        tenantId,
        deviceId,
        {
          isOnline: true,
          cpuDiagnostics: [
            {
              seq: 1,
              timestamp: '2026-11-27T05:20:00.100Z',
              status: 'OK',
              cpuLoad: 10,
              rttMs: 20,
              ok: 1,
              fail: 0,
              timeout: 0,
              skippedOverlaps: 0,
            },
          ],
        },
        { id: 'cashier-1', role: RoleName.CASHIER, tenantId } as any,
      ),
    ).rejects.toThrow(ForbiddenException);

    const diagLogs = loggerSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((msg) => msg.includes('[CpuTelemetryDiag]'));
    expect(diagLogs).toHaveLength(0);
  });

  it('enforces ValidationPipe batch size limit (max 20 entries)', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    });

    const oversized = Array.from({ length: 21 }, (_, i) => ({
      seq: i + 1,
      timestamp: '2026-11-27T05:20:00.100Z',
      status: 'OK',
      cpuLoad: 5,
      rttMs: 15,
      ok: i + 1,
      fail: 0,
      timeout: 0,
      skippedOverlaps: 0,
    }));

    await expect(
      pipe.transform(
        { isOnline: true, cpuDiagnostics: oversized },
        { type: 'body', metatype: ReportLocalTelemetryDto },
      ),
    ).rejects.toThrow();
  });
});
