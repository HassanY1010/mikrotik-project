import { Test, TestingModule } from '@nestjs/testing';
import { AgentService } from './agent.service';
import { PrismaService } from '../../core/database/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import { AgentStatus, TenantStatus, AgentCommandStatus } from '@prisma/client';
import { AgentCommandType } from './dto/command.dto';
import * as crypto from 'crypto';

describe('AgentService', () => {
  let service: AgentService;
  let prisma: any;
  let configService: any;

  const mockTenantId = 'tenant-uuid-1';
  const mockOtherTenantId = 'tenant-uuid-other';
  const mockDeviceId = 'device-uuid-1';
  const mockUserId = 'user-uuid-1';
  const testSecret = 'test_agent_pairing_secret_key_minimum_32_characters_12345';

  beforeEach(async () => {
    configService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'AGENT_PAIRING_SECRET') {
          return testSecret;
        }
        if (key === 'NODE_ENV') {
          return 'test';
        }
        return defaultValue ?? null;
      }),
    };

    prisma = {
      mikroTikDevice: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      agentPairingCode: {
        updateMany: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
      deviceAgent: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      agentPairingAttempt: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ attempts: 1 }),
        deleteMany: jest.fn(),
      },
      agentCommand: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((cb: (tx: any) => Promise<any>) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<AgentService>(AgentService);
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.clearAllMocks();
  });


  // Helper to compute expected HMAC using server secret
  const computeTestCodeHash = (code: string, salt: string) => {
    const derivedKey = crypto
      .createHash('sha256')
      .update(`sudafi:agent:pairing:v1:${testSecret}`)
      .digest('hex');
    return crypto.createHmac('sha256', derivedKey).update(`${code}:${salt}`).digest('hex');
  };

  describe('Configuration & Fail-Safe Initialization', () => {
    it('should throw Error if AGENT_PAIRING_SECRET is missing or shorter than 32 characters', () => {
      const badConfig = {
        get: jest.fn((key: string) => (key === 'AGENT_PAIRING_SECRET' ? 'short-key' : null)),
      };

      expect(() => new AgentService(prisma, badConfig as any)).toThrow(
        /AGENT_PAIRING_SECRET environment variable is missing or shorter than 32 characters/,
      );
    });

    it('should throw Error if development secret placeholder is used in production environment', () => {
      const prodBadConfig = {
        get: jest.fn((key: string) => {
          if (key === 'AGENT_PAIRING_SECRET') return 'development_placeholder_key_32_chars_long';
          if (key === 'NODE_ENV') return 'production';
          return null;
        }),
      };

      expect(() => new AgentService(prisma, prodBadConfig as any)).toThrow(
        /Insecure development placeholder detected for AGENT_PAIRING_SECRET in production mode/,
      );
    });
  });

  describe('generatePairingCode', () => {
    it('should generate a 6-digit code with salted HMAC using private server secret', async () => {
      prisma.mikroTikDevice.findUnique.mockResolvedValue({
        id: mockDeviceId,
        tenantId: mockTenantId,
        name: 'Main Router',
        deletedAt: null,
      });

      prisma.agentPairingCode.updateMany.mockResolvedValue({ count: 1 });
      prisma.agentPairingCode.create.mockResolvedValue({ id: 'code-1' });

      const result = await service.generatePairingCode(mockTenantId, mockDeviceId, mockUserId);

      expect(result.code).toMatch(/^\d{6}$/);
      expect(result.expiresInSeconds).toBe(300);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now() + 290 * 1000);

      // Verify HMAC hash was generated and stored with salt
      expect(prisma.agentPairingCode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: mockTenantId,
            deviceId: mockDeviceId,
            maxAttempts: 3,
            attempts: 0,
            isConsumed: false,
            codeHash: expect.any(String),
            salt: expect.any(String),
          }),
        }),
      );

      // Verify audit log NEVER contains the raw 6-digit code
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'AGENT_PAIRING_CODE_GENERATED',
            entityId: mockDeviceId,
            newValues: expect.not.objectContaining({ code: expect.anything() }),
          }),
        }),
      );
    });

    it('should reject non-existent router device with NotFoundException', async () => {
      prisma.mikroTikDevice.findUnique.mockResolvedValue(null);

      await expect(
        service.generatePairingCode(mockTenantId, 'non-existent', mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should enforce tenant isolation: reject device belonging to another tenant', async () => {
      prisma.mikroTikDevice.findUnique.mockResolvedValue({
        id: mockDeviceId,
        tenantId: mockOtherTenantId,
        name: 'Other Router',
        deletedAt: null,
      });

      await expect(
        service.generatePairingCode(mockTenantId, mockDeviceId, mockUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow Super Admin (tenantId: undefined) to generate code for any valid device', async () => {
      prisma.mikroTikDevice.findUnique.mockResolvedValue({
        id: mockDeviceId,
        tenantId: mockOtherTenantId,
        name: 'Other Router',
        deletedAt: null,
      });

      prisma.agentPairingCode.updateMany.mockResolvedValue({ count: 0 });
      prisma.agentPairingCode.create.mockResolvedValue({ id: 'code-1' });

      const result = await service.generatePairingCode(undefined, mockDeviceId, mockUserId);
      expect(result.code).toMatch(/^\d{6}$/);
    });
  });

  describe('pairAgent (Atomicity, Security & Concurrency)', () => {
    const rawCode = '482910';
    const salt = 'aabbcc1122334455';
    let codeHash: string;

    beforeEach(() => {
      codeHash = computeTestCodeHash(rawCode, salt);
    });

    it('should atomically consume code, lock device row, invalidate old agent, and create new agent in single transaction', async () => {
      const mockCandidate = {
        id: 'code-entry-1',
        tenantId: mockTenantId,
        deviceId: mockDeviceId,
        codeHash,
        salt,
        attempts: 0,
        maxAttempts: 3,
        isConsumed: false,
        expiresAt: new Date(Date.now() + 200 * 1000),
      };

      prisma.agentPairingCode.findMany.mockResolvedValue([mockCandidate]);
      prisma.agentPairingCode.updateMany.mockResolvedValue({ count: 1 });
      prisma.deviceAgent.updateMany.mockResolvedValue({ count: 1 }); // old agent revoked
      prisma.deviceAgent.create.mockResolvedValue({
        id: 'agent-uuid-1',
        tenantId: mockTenantId,
        deviceId: mockDeviceId,
        name: 'POS-PC',
        status: AgentStatus.OFFLINE,
        version: '1.0.0',
      });

      const result = await service.pairAgent(
        { pairingCode: rawCode, name: 'POS-PC', version: '1.0.0' },
        '192.168.1.50',
        'fingerprint-1',
      );

      expect(result.success).toBe(true);
      expect(result.agentId).toBe('agent-uuid-1');
      expect(result.agentToken).toHaveLength(64);
      expect(result.deviceId).toBe(mockDeviceId);
      expect(result.tenantId).toBe(mockTenantId);

      // Verify transaction was used
      expect(prisma.$transaction).toHaveBeenCalled();

      // Verify router row lock acquired
      expect(prisma.mikroTikDevice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockDeviceId },
        }),
      );

      // Verify atomic consumption
      expect(prisma.agentPairingCode.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'code-entry-1', isConsumed: false }),
          data: expect.objectContaining({ isConsumed: true }),
        }),
      );

      // Verify old active agent on router was marked REVOKED
      expect(prisma.deviceAgent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deviceId: mockDeviceId,
            status: { not: AgentStatus.REVOKED },
          }),
          data: expect.objectContaining({
            status: AgentStatus.REVOKED,
          }),
        }),
      );

      // Verify new agent record created
      expect(prisma.deviceAgent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deviceId: mockDeviceId,
            tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            status: AgentStatus.OFFLINE,
          }),
        }),
      );

      // Verify persistent rate limiter was reset on success
      expect(prisma.agentPairingAttempt.deleteMany).toHaveBeenCalled();
    });

    it('should roll back and reject concurrent requests with ConflictException if code consumed by another worker', async () => {
      const mockCandidate = {
        id: 'code-entry-1',
        tenantId: mockTenantId,
        deviceId: mockDeviceId,
        codeHash,
        salt,
        attempts: 0,
        maxAttempts: 3,
        isConsumed: false,
        expiresAt: new Date(Date.now() + 200 * 1000),
      };

      prisma.agentPairingCode.findMany.mockResolvedValue([mockCandidate]);
      // Atomic conditional update returns 0 affected rows (already consumed!)
      prisma.agentPairingCode.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.pairAgent(
          { pairingCode: rawCode, name: 'POS-PC' },
          '192.168.1.52',
          'fingerprint-3',
        ),
      ).rejects.toThrow(ConflictException);

      // Agent creation must NOT be called if code consumption failed
      expect(prisma.deviceAgent.create).not.toHaveBeenCalled();
    });

    it('should roll back code consumption if agent creation fails mid-transaction (Partial Failure Protection)', async () => {
      const mockCandidate = {
        id: 'code-entry-1',
        tenantId: mockTenantId,
        deviceId: mockDeviceId,
        codeHash,
        salt,
        attempts: 0,
        maxAttempts: 3,
        isConsumed: false,
        expiresAt: new Date(Date.now() + 200 * 1000),
      };

      prisma.agentPairingCode.findMany.mockResolvedValue([mockCandidate]);
      prisma.agentPairingCode.updateMany.mockResolvedValue({ count: 1 });
      prisma.deviceAgent.updateMany.mockResolvedValue({ count: 0 });

      // Simulate unexpected database crash during agent insert
      prisma.deviceAgent.create.mockRejectedValue(new Error('DB_DISK_FULL'));

      await expect(
        service.pairAgent(
          { pairingCode: rawCode, name: 'POS-PC' },
          '192.168.1.50',
          'fingerprint-fail',
        ),
      ).rejects.toThrow('DB_DISK_FULL');
    });

    it('should enforce persistent lockout (HTTP 429) across restarts via database attempt store', async () => {
      // Simulate persistent lockout record stored in DB from prior run
      prisma.agentPairingAttempt.findUnique.mockResolvedValue({
        clientKey: 'some-client-key',
        attempts: 5,
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000), // locked for 10 more minutes
      });

      await expect(
        service.pairAgent(
          { pairingCode: '111111', name: 'Blocked-Agent' },
          '10.20.30.40',
          'attacker-fingerprint',
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.TOO_MANY_REQUESTS,
        }),
      );

      // Verify no candidate codes queried if client is locked out
      expect(prisma.agentPairingCode.findMany).not.toHaveBeenCalled();
    });

    it('should record atomic upsert attempt in DB on invalid code and enforce code threshold', async () => {
      prisma.agentPairingAttempt.findUnique.mockResolvedValue(null);
      prisma.agentPairingCode.findMany.mockResolvedValue([]);

      await expect(
        service.pairAgent(
          { pairingCode: '999999', name: 'Wrong-Code' },
          '192.168.1.99',
          'client-id',
        ),
      ).rejects.toThrow(UnauthorizedException);

      // Verify atomic upsert was called
      expect(prisma.agentPairingAttempt.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ attempts: 1 }),
          update: expect.objectContaining({ attempts: { increment: 1 } }),
        }),
      );
    });
  });

  describe('Re-pairing after Revocation (Historical Preservation)', () => {
    const rawCode = '777888';
    const salt = '1122334455667788';

    it('should support re-pairing a new agent on same router while preserving revoked record', async () => {
      const codeHash = computeTestCodeHash(rawCode, salt);
      const mockCandidate = {
        id: 'code-entry-re-pair',
        tenantId: mockTenantId,
        deviceId: mockDeviceId,
        codeHash,
        salt,
        attempts: 0,
        maxAttempts: 3,
        isConsumed: false,
        expiresAt: new Date(Date.now() + 200 * 1000),
      };

      prisma.agentPairingCode.findMany.mockResolvedValue([mockCandidate]);
      prisma.agentPairingCode.updateMany.mockResolvedValue({ count: 1 });

      // First agent revoked previously
      prisma.deviceAgent.updateMany.mockResolvedValue({ count: 1 });
      prisma.deviceAgent.create.mockResolvedValue({
        id: 'new-agent-uuid-2',
        tenantId: mockTenantId,
        deviceId: mockDeviceId,
        name: 'New-Replacement-PC',
        status: AgentStatus.OFFLINE,
      });

      const result = await service.pairAgent(
        { pairingCode: rawCode, name: 'New-Replacement-PC' },
        '192.168.1.60',
      );

      expect(result.success).toBe(true);
      expect(result.agentId).toBe('new-agent-uuid-2');

      // Check that existing agents were updated to REVOKED rather than deleted/overwritten
      expect(prisma.deviceAgent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deviceId: mockDeviceId,
            status: { not: AgentStatus.REVOKED },
          },
          data: expect.objectContaining({
            status: AgentStatus.REVOKED,
          }),
        }),
      );
    });
  });

  describe('revokeAgent', () => {
    it('should revoke active agent, scramble token hash, and record timestamp', async () => {
      prisma.mikroTikDevice.findUnique.mockResolvedValue({
        id: mockDeviceId,
        tenantId: mockTenantId,
        deletedAt: null,
      });

      prisma.deviceAgent.findFirst.mockResolvedValue({
        id: 'agent-uuid-1',
        deviceId: mockDeviceId,
        tenantId: mockTenantId,
        status: AgentStatus.ONLINE,
      });

      prisma.deviceAgent.update.mockResolvedValue({});

      const result = await service.revokeAgent(mockTenantId, mockDeviceId, mockUserId);

      expect(result.success).toBe(true);
      expect(prisma.deviceAgent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'agent-uuid-1' },
          data: expect.objectContaining({
            status: AgentStatus.REVOKED,
            tokenHash: expect.any(String),
            revokedAt: expect.any(Date),
          }),
        }),
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'AGENT_REVOKED',
            entityId: 'agent-uuid-1',
          }),
        }),
      );
    });

    it('should enforce tenant boundary and prevent Tenant A from revoking Tenant B device agent', async () => {
      prisma.mikroTikDevice.findUnique.mockResolvedValue({
        id: mockDeviceId,
        tenantId: mockOtherTenantId,
        deletedAt: null,
      });

      await expect(
        service.revokeAgent(mockTenantId, mockDeviceId, mockUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if no active agent is registered for the device', async () => {
      prisma.mikroTikDevice.findUnique.mockResolvedValue({
        id: mockDeviceId,
        tenantId: mockTenantId,
        deletedAt: null,
      });

      prisma.deviceAgent.findFirst.mockResolvedValue(null);

      await expect(
        service.revokeAgent(mockTenantId, mockDeviceId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('validateAgentToken', () => {
    const rawToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    it('should return valid agent metadata for active agent', async () => {
      prisma.deviceAgent.findUnique.mockResolvedValue({
        id: 'agent-uuid-1',
        tenantId: mockTenantId,
        deviceId: mockDeviceId,
        name: 'POS-PC',
        status: AgentStatus.OFFLINE,
        tenant: { id: mockTenantId, status: TenantStatus.ACTIVE, deletedAt: null },
        device: { id: mockDeviceId, tenantId: mockTenantId, deletedAt: null },
      });

      const result = await service.validateAgentToken(rawToken);

      expect(result.valid).toBe(true);
      expect(result.agent.id).toBe('agent-uuid-1');
      expect(result.agent.status).toBe(AgentStatus.OFFLINE);
      expect(prisma.deviceAgent.findUnique).toHaveBeenCalledWith({
        where: { tokenHash },
        include: expect.any(Object),
      });
    });

    it('should reject revoked agent with UnauthorizedException (Revocation Enforcement)', async () => {
      prisma.deviceAgent.findUnique.mockResolvedValue({
        id: 'agent-uuid-1',
        tenantId: mockTenantId,
        deviceId: mockDeviceId,
        name: 'POS-PC',
        status: AgentStatus.REVOKED,
        tenant: { id: mockTenantId, status: TenantStatus.ACTIVE, deletedAt: null },
        device: { id: mockDeviceId, tenantId: mockTenantId, deletedAt: null },
      });

      await expect(service.validateAgentToken(rawToken)).rejects.toThrow(
        new UnauthorizedException('Agent access has been revoked'),
      );
    });

    it('should reject invalid or scrambled token with UnauthorizedException', async () => {
      prisma.deviceAgent.findUnique.mockResolvedValue(null);

      await expect(service.validateAgentToken('scrambled-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject agent if associated tenant is suspended', async () => {
      prisma.deviceAgent.findUnique.mockResolvedValue({
        id: 'agent-uuid-1',
        tenantId: mockTenantId,
        deviceId: mockDeviceId,
        status: AgentStatus.OFFLINE,
        tenant: { id: mockTenantId, status: TenantStatus.SUSPENDED, deletedAt: null },
        device: { id: mockDeviceId, tenantId: mockTenantId, deletedAt: null },
      });

      await expect(service.validateAgentToken(rawToken)).rejects.toThrow(
        new ForbiddenException('Associated tenant has been suspended'),
      );
    });

    it('should reject agent if associated router device has been deleted', async () => {
      prisma.deviceAgent.findUnique.mockResolvedValue({
        id: 'agent-uuid-1',
        tenantId: mockTenantId,
        deviceId: mockDeviceId,
        status: AgentStatus.OFFLINE,
        tenant: { id: mockTenantId, status: TenantStatus.ACTIVE, deletedAt: null },
        device: null,
      });

      await expect(service.validateAgentToken(rawToken)).rejects.toThrow(
        new NotFoundException('Associated router device no longer exists'),
      );
    });
  });

  describe('Heartbeat & Presence Protocol (Step 2)', () => {
    const rawToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const clientIp = '197.25.10.5';

    beforeEach(() => {
      prisma.deviceAgent.findUnique.mockResolvedValue({
        id: 'agent-uuid-1',
        tenantId: mockTenantId,
        deviceId: mockDeviceId,
        status: AgentStatus.OFFLINE,
        version: '1.0.0',
        name: 'Main-Cashier',
        tenant: { id: mockTenantId, status: TenantStatus.ACTIVE, deletedAt: null },
        device: { id: mockDeviceId, tenantId: mockTenantId, deletedAt: null },
      });
      prisma.deviceAgent.update.mockResolvedValue({});
    });

    it('should authenticate agent, update status to ONLINE, and record IP & ping timestamp', async () => {
      const response = await service.processHeartbeat(rawToken, clientIp, {
        version: '1.0.1',
        metrics: { uptimeSeconds: 3600, cpuUsagePercent: 15, freeMemoryBytes: 1048576, routerPingMs: 2.1 },
      });

      expect(response.status).toBe('ACK');
      expect(response.serverTime).toBeInstanceOf(Date);
      expect(response.heartbeatIntervalMs).toBe(25000);
      expect(response.offlineThresholdMs).toBe(60000);
      expect(response.pendingCommands).toEqual([]);

      expect(prisma.deviceAgent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'agent-uuid-1' },
          data: expect.objectContaining({
            status: AgentStatus.ONLINE,
            ipAddress: clientIp,
            version: '1.0.1',
          }),
        }),
      );
    });

    it('should dispatch pending commands to the agent during heartbeat', async () => {
      const mockCmd = {
        id: 'cmd-uuid-1',
        agentId: 'agent-uuid-1',
        operationId: 'c6d23156-f084-482a-a92c-15a0c8413b52',
        type: AgentCommandType.ROUTER_HEALTH,
        payload: { timeoutMs: 2000 },
        status: AgentCommandStatus.PENDING,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 600000),
      };

      prisma.agentCommand.findMany.mockResolvedValue([mockCmd]);
      prisma.agentCommand.updateMany.mockResolvedValue({ count: 1 });

      const response = await service.processHeartbeat(rawToken, clientIp);

      expect(response.pendingCommands).toHaveLength(1);
      expect(response.pendingCommands[0].id).toBe('cmd-uuid-1');
      expect(response.pendingCommands[0].type).toBe(AgentCommandType.ROUTER_HEALTH);

      // Verify commands were marked as DISPATCHED
      expect(prisma.agentCommand.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['cmd-uuid-1'] } },
          data: expect.objectContaining({
            status: AgentCommandStatus.DISPATCHED,
            attempts: { increment: 1 },
          }),
        }),
      );
    });

    it('should reject heartbeat with invalid or missing token', async () => {
      prisma.deviceAgent.findUnique.mockResolvedValue(null);

      await expect(service.processHeartbeat('invalid-token', clientIp)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject heartbeat from revoked agent', async () => {
      prisma.deviceAgent.findUnique.mockResolvedValue({
        id: 'agent-uuid-1',
        tenantId: mockTenantId,
        deviceId: mockDeviceId,
        status: AgentStatus.REVOKED,
        tenant: { id: mockTenantId, status: TenantStatus.ACTIVE, deletedAt: null },
        device: { id: mockDeviceId, tenantId: mockTenantId, deletedAt: null },
      });

      await expect(service.processHeartbeat(rawToken, clientIp)).rejects.toThrow(
        new UnauthorizedException('Agent access has been revoked'),
      );
    });
  });

  describe('Stale Detection, Disconnection & Reconnection (Step 2)', () => {
    it('should mark stale agents as OFFLINE when heartbeat timeout has elapsed', async () => {
      prisma.deviceAgent.updateMany.mockResolvedValue({ count: 3 });

      const transitionedCount = await service.markStaleAgentsOffline();

      expect(transitionedCount).toBe(3);
      expect(prisma.deviceAgent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: AgentStatus.ONLINE,
          }),
          data: { status: AgentStatus.OFFLINE },
        }),
      );
    });

    it('should lazily detect stale status during getAgentStatus and update to OFFLINE', async () => {
      const staleDate = new Date(Date.now() - 75000); // 75s ago (> 60s timeout)
      prisma.mikroTikDevice.findUnique.mockResolvedValue({
        id: mockDeviceId,
        tenantId: mockTenantId,
        deletedAt: null,
      });

      prisma.deviceAgent.findFirst.mockResolvedValue({
        id: 'agent-uuid-1',
        tenantId: mockTenantId,
        deviceId: mockDeviceId,
        name: 'POS-Agent',
        status: AgentStatus.ONLINE,
        lastPingAt: staleDate,
        pairedAt: new Date(),
        revokedAt: null,
      });

      prisma.deviceAgent.update.mockResolvedValue({
        id: 'agent-uuid-1',
        tenantId: mockTenantId,
        deviceId: mockDeviceId,
        name: 'POS-Agent',
        status: AgentStatus.OFFLINE,
        lastPingAt: staleDate,
        pairedAt: new Date(),
        revokedAt: null,
      });

      const result = await service.getAgentStatus(mockTenantId, mockDeviceId);

      expect(prisma.deviceAgent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'agent-uuid-1' },
          data: { status: AgentStatus.OFFLINE },
        }),
      );
      expect(result?.status).toBe(AgentStatus.OFFLINE);
    });

    it('should seamlessly recover to ONLINE upon reconnection after API restart', async () => {
      const rawToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      // Simulate agent was previously marked OFFLINE in database before restart
      prisma.deviceAgent.findUnique.mockResolvedValue({
        id: 'agent-uuid-1',
        tenantId: mockTenantId,
        deviceId: mockDeviceId,
        status: AgentStatus.OFFLINE,
        tenant: { id: mockTenantId, status: TenantStatus.ACTIVE, deletedAt: null },
        device: { id: mockDeviceId, tenantId: mockTenantId, deletedAt: null },
      });

      prisma.deviceAgent.update.mockResolvedValue({});
      prisma.agentCommand.findMany.mockResolvedValue([]);

      const response = await service.processHeartbeat(rawToken, '197.25.10.5');

      expect(response.status).toBe('ACK');
      expect(prisma.deviceAgent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'agent-uuid-1' },
          data: expect.objectContaining({ status: AgentStatus.ONLINE }),
        }),
      );
    });
  });

  describe('Typed RPC Command Queueing & Whitelist Enforcement (Step 2)', () => {
    beforeEach(() => {
      prisma.mikroTikDevice.findUnique.mockResolvedValue({
        id: mockDeviceId,
        tenantId: mockTenantId,
        deletedAt: null,
      });

      prisma.deviceAgent.findFirst.mockResolvedValue({
        id: 'agent-uuid-1',
        deviceId: mockDeviceId,
        status: AgentStatus.ONLINE,
      });
    });

    it('should queue a whitelisted router health check command', async () => {
      const opId = 'c6d23156-f084-482a-a92c-15a0c8413b52';
      prisma.agentCommand.findUnique.mockResolvedValue(null);
      prisma.agentCommand.create.mockResolvedValue({
        id: 'cmd-uuid-1',
        tenantId: mockTenantId,
        deviceId: mockDeviceId,
        agentId: 'agent-uuid-1',
        operationId: opId,
        type: AgentCommandType.ROUTER_HEALTH,
        payload: { timeoutMs: 3000 },
        status: AgentCommandStatus.PENDING,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 600000),
      });

      const result = await service.queueCommand(mockTenantId, mockDeviceId, {
        operationId: opId,
        type: AgentCommandType.ROUTER_HEALTH,
        payload: { timeoutMs: 3000 },
      });

      expect(result.id).toBe('cmd-uuid-1');
      expect(result.type).toBe(AgentCommandType.ROUTER_HEALTH);
      expect(result.status).toBe(AgentCommandStatus.PENDING);
    });

    it('should reject arbitrary or non-whitelisted commands with BadRequestException', async () => {
      await expect(
        service.queueCommand(mockTenantId, mockDeviceId, {
          operationId: 'c6d23156-f084-482a-a92c-15a0c8413b52',
          type: 'system.terminal.exec' as any,
          payload: { command: '/system reboot' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject command queueing if router has no active agent', async () => {
      prisma.deviceAgent.findFirst.mockResolvedValue(null);

      await expect(
        service.queueCommand(mockTenantId, mockDeviceId, {
          operationId: 'c6d23156-f084-482a-a92c-15a0c8413b52',
          type: AgentCommandType.ROUTER_HEALTH,
          payload: {},
        }),
      ).rejects.toThrow(new BadRequestException(`Cannot queue command: No active agent is paired with router [${mockDeviceId}]`));
    });

    it('should enforce idempotency and return existing command if operationId was already queued for the same device', async () => {
      const opId = 'c6d23156-f084-482a-a92c-15a0c8413b52';
      const existingCmd = {
        id: 'cmd-uuid-existing',
        deviceId: mockDeviceId,
        agentId: 'agent-uuid-1',
        operationId: opId,
        type: AgentCommandType.ROUTER_HEALTH,
        payload: {},
        status: AgentCommandStatus.PENDING,
        createdAt: new Date(),
        expiresAt: new Date(),
      };

      prisma.agentCommand.findUnique.mockResolvedValue(existingCmd);

      const result = await service.queueCommand(mockTenantId, mockDeviceId, {
        operationId: opId,
        type: AgentCommandType.ROUTER_HEALTH,
        payload: {},
      });

      expect(result.id).toBe('cmd-uuid-existing');
      expect(prisma.agentCommand.create).not.toHaveBeenCalled();
    });

    it('should reject duplicate operationId used for a different router device with ConflictException', async () => {
      const opId = 'c6d23156-f084-482a-a92c-15a0c8413b52';
      prisma.agentCommand.findUnique.mockResolvedValue({
        id: 'cmd-uuid-other',
        deviceId: 'other-device-id',
        operationId: opId,
      });

      await expect(
        service.queueCommand(mockTenantId, mockDeviceId, {
          operationId: opId,
          type: AgentCommandType.ROUTER_HEALTH,
          payload: {},
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should prevent cross-tenant command dispatch with ForbiddenException', async () => {
      await expect(
        service.queueCommand(mockOtherTenantId, mockDeviceId, {
          operationId: 'c6d23156-f084-482a-a92c-15a0c8413b52',
          type: AgentCommandType.ROUTER_HEALTH,
          payload: {},
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Command Execution Result Submission & Idempotency (Step 2)', () => {
    const rawToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const opId = 'c6d23156-f084-482a-a92c-15a0c8413b52';

    beforeEach(() => {
      prisma.deviceAgent.findUnique.mockResolvedValue({
        id: 'agent-uuid-1',
        tenantId: mockTenantId,
        deviceId: mockDeviceId,
        status: AgentStatus.ONLINE,
        tenant: { id: mockTenantId, status: TenantStatus.ACTIVE, deletedAt: null },
        device: { id: mockDeviceId, tenantId: mockTenantId, deletedAt: null },
      });
    });

    it('should record successfully completed command result', async () => {
      prisma.agentCommand.findUnique.mockResolvedValue({
        id: 'cmd-uuid-1',
        agentId: 'agent-uuid-1',
        operationId: opId,
        status: AgentCommandStatus.DISPATCHED,
      });
      prisma.agentCommand.updateMany.mockResolvedValue({ count: 1 });

      const response = await service.submitCommandResult(rawToken, 'cmd-uuid-1', {
        operationId: opId,
        status: 'COMPLETED',
        result: { pingMs: 1.2, cpuLoad: 8, memoryFree: 1200000 },
      });

      expect(response.success).toBe(true);
      expect(prisma.agentCommand.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'cmd-uuid-1' }),
          data: expect.objectContaining({
            status: AgentCommandStatus.COMPLETED,
            result: { pingMs: 1.2, cpuLoad: 8, memoryFree: 1200000 },
          }),
        }),
      );
    });

    it('should be idempotent and accept repeated completion result without re-updating', async () => {
      prisma.agentCommand.findUnique.mockResolvedValue({
        id: 'cmd-uuid-1',
        agentId: 'agent-uuid-1',
        operationId: opId,
        status: AgentCommandStatus.COMPLETED, // already completed!
      });

      const response = await service.submitCommandResult(rawToken, 'cmd-uuid-1', {
        operationId: opId,
        status: 'COMPLETED',
        result: { pingMs: 1.2 },
      });

      expect(response.success).toBe(true);
      expect(response.message).toContain('idempotent');
      expect(prisma.agentCommand.updateMany).not.toHaveBeenCalled();
    });

    it('should reject result submission if command was dispatched to a different agent', async () => {
      prisma.agentCommand.findUnique.mockResolvedValue({
        id: 'cmd-uuid-1',
        agentId: 'other-agent-id',
        operationId: opId,
        status: AgentCommandStatus.DISPATCHED,
      });

      await expect(
        service.submitCommandResult(rawToken, 'cmd-uuid-1', {
          operationId: opId,
          status: 'COMPLETED',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject result submission with operationId mismatch', async () => {
      prisma.agentCommand.findUnique.mockResolvedValue({
        id: 'cmd-uuid-1',
        agentId: 'agent-uuid-1',
        operationId: opId,
        status: AgentCommandStatus.DISPATCHED,
      });

      await expect(
        service.submitCommandResult(rawToken, 'cmd-uuid-1', {
          operationId: 'different-op-id',
          status: 'COMPLETED',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle concurrent race condition when two result submissions occur simultaneously', async () => {
      prisma.agentCommand.findUnique.mockResolvedValue({
        id: 'cmd-uuid-1',
        agentId: 'agent-uuid-1',
        operationId: opId,
        status: AgentCommandStatus.DISPATCHED,
      });
      // Simulate another concurrent query already finalized the row, so updateMany affects 0 rows
      prisma.agentCommand.updateMany.mockResolvedValue({ count: 0 });

      const response = await service.submitCommandResult(rawToken, 'cmd-uuid-1', {
        operationId: opId,
        status: 'COMPLETED',
      });

      expect(response.success).toBe(true);
      expect(response.message).toContain('idempotent');
    });
  });

  describe('Lost Ack, Retries & Command Expiration (Step 2 Hardening)', () => {
    const rawToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const clientIp = '197.25.10.5';

    beforeEach(() => {
      prisma.deviceAgent.findUnique.mockResolvedValue({
        id: 'agent-uuid-1',
        tenantId: mockTenantId,
        deviceId: mockDeviceId,
        status: AgentStatus.ONLINE,
        tenant: { id: mockTenantId, status: TenantStatus.ACTIVE, deletedAt: null },
        device: { id: mockDeviceId, tenantId: mockTenantId, deletedAt: null },
      });
      prisma.deviceAgent.update.mockResolvedValue({});
    });

    it('should re-dispatch unacknowledged DISPATCHED commands after timeout has elapsed', async () => {
      const timedOutDispatchedCmd = {
        id: 'cmd-uuid-timeout',
        agentId: 'agent-uuid-1',
        operationId: 'c6d23156-f084-482a-a92c-15a0c8413b52',
        type: AgentCommandType.ROUTER_HEALTH,
        payload: {},
        status: AgentCommandStatus.DISPATCHED,
        dispatchedAt: new Date(Date.now() - 150000), // 2.5 min ago (> 2 min timeout)
        attempts: 1,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 600000),
      };

      prisma.agentCommand.findMany.mockResolvedValue([timedOutDispatchedCmd]);
      prisma.agentCommand.updateMany.mockResolvedValue({ count: 1 });

      const response = await service.processHeartbeat(rawToken, clientIp);

      expect(response.pendingCommands).toHaveLength(1);
      expect(response.pendingCommands[0].id).toBe('cmd-uuid-timeout');
      expect(prisma.agentCommand.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['cmd-uuid-timeout'] } },
          data: expect.objectContaining({
            status: AgentCommandStatus.DISPATCHED,
            attempts: { increment: 1 },
          }),
        }),
      );
    });

    it('should expire stale commands that exceeded their TTL or attempts', async () => {
      prisma.agentCommand.updateMany.mockResolvedValue({ count: 2 });

      const count = await service.expireStaleCommands();

      expect(count).toBe(2);
      expect(prisma.agentCommand.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: [AgentCommandStatus.PENDING, AgentCommandStatus.DISPATCHED] },
          }),
          data: expect.objectContaining({
            status: AgentCommandStatus.EXPIRED,
          }),
        }),
      );
    });

    it('should gracefully handle P2002 race condition on concurrent command queueing with same operationId', async () => {
      prisma.mikroTikDevice.findUnique.mockResolvedValue({
        id: mockDeviceId,
        tenantId: mockTenantId,
        deletedAt: null,
      });

      prisma.deviceAgent.findFirst.mockResolvedValue({
        id: 'agent-uuid-1',
        deviceId: mockDeviceId,
        status: AgentStatus.ONLINE,
      });

      const opId = 'c6d23156-f084-482a-a92c-15a0c8413b52';
      // First check returns null (both requests think it does not exist)
      prisma.agentCommand.findUnique
        .mockResolvedValueOnce(null)
        // Second check after P2002 collision returns the command created by concurrent thread
        .mockResolvedValueOnce({
          id: 'cmd-uuid-concurrent',
          deviceId: mockDeviceId,
          agentId: 'agent-uuid-1',
          operationId: opId,
          type: AgentCommandType.ROUTER_HEALTH,
          payload: {},
          status: AgentCommandStatus.PENDING,
          createdAt: new Date(),
          expiresAt: new Date(),
        });

      // Simulate Prisma Unique Constraint Violation
      const p2002Error: any = new Error('Unique constraint failed on the fields: (`operationId`)');
      p2002Error.code = 'P2002';
      prisma.agentCommand.create.mockRejectedValue(p2002Error);

      const result = await service.queueCommand(mockTenantId, mockDeviceId, {
        operationId: opId,
        type: AgentCommandType.ROUTER_HEALTH,
        payload: {},
      });

      expect(result.id).toBe('cmd-uuid-concurrent');
    });

    it('should transition OFFLINE agent to ONLINE upon reconnecting heartbeat after cold start or sleep', async () => {
      // Simulate agent was OFFLINE during server spindown/restart
      prisma.deviceAgent.findUnique.mockResolvedValue({
        id: 'agent-uuid-1',
        tenantId: mockTenantId,
        deviceId: mockDeviceId,
        status: AgentStatus.OFFLINE,
        tenant: { id: mockTenantId, status: TenantStatus.ACTIVE, deletedAt: null },
        device: { id: mockDeviceId, tenantId: mockTenantId, deletedAt: null },
      });
      prisma.deviceAgent.update.mockResolvedValue({});
      prisma.agentCommand.findMany.mockResolvedValue([]);

      const response = await service.processHeartbeat(rawToken, '102.120.45.2', { version: '1.2.0' });

      expect(response.status).toBe('ACK');
      expect(prisma.deviceAgent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'agent-uuid-1' },
          data: expect.objectContaining({
            status: AgentStatus.ONLINE,
            ipAddress: '102.120.45.2',
            version: '1.2.0',
          }),
        }),
      );
    });
  });

  describe('Command Status Queries & Tenant Isolation (Step 2)', () => {
    it('should successfully retrieve status of an existing command for authorized tenant', async () => {
      prisma.mikroTikDevice.findUnique.mockResolvedValue({
        id: mockDeviceId,
        tenantId: mockTenantId,
        deletedAt: null,
      });

      prisma.agentCommand.findUnique.mockResolvedValue({
        id: 'cmd-uuid-1',
        tenantId: mockTenantId,
        deviceId: mockDeviceId,
        agentId: 'agent-uuid-1',
        operationId: 'c6d23156-f084-482a-a92c-15a0c8413b52',
        type: AgentCommandType.ROUTER_HEALTH,
        payload: {},
        status: AgentCommandStatus.COMPLETED,
        result: { cpuLoad: 5 },
        errorMessage: null,
        attempts: 1,
        createdAt: new Date(),
        completedAt: new Date(),
        expiresAt: new Date(),
      });

      const result = await service.getCommandStatus(mockTenantId, mockDeviceId, 'cmd-uuid-1');

      expect(result.id).toBe('cmd-uuid-1');
      expect(result.status).toBe(AgentCommandStatus.COMPLETED);
      expect(result.result).toEqual({ cpuLoad: 5 });
    });

    it('should reject status query with NotFoundException if device does not exist', async () => {
      prisma.mikroTikDevice.findUnique.mockResolvedValue(null);

      await expect(
        service.getCommandStatus(mockTenantId, 'non-existent-device', 'cmd-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject status query with ForbiddenException if device belongs to another tenant', async () => {
      prisma.mikroTikDevice.findUnique.mockResolvedValue({
        id: mockDeviceId,
        tenantId: 'other-tenant-uuid',
        deletedAt: null,
      });

      await expect(
        service.getCommandStatus(mockTenantId, mockDeviceId, 'cmd-uuid-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject status query with NotFoundException if command belongs to a different device', async () => {
      prisma.mikroTikDevice.findUnique.mockResolvedValue({
        id: mockDeviceId,
        tenantId: mockTenantId,
        deletedAt: null,
      });

      prisma.agentCommand.findUnique.mockResolvedValue({
        id: 'cmd-uuid-1',
        deviceId: 'different-device-uuid',
      });

      await expect(
        service.getCommandStatus(mockTenantId, mockDeviceId, 'cmd-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});


