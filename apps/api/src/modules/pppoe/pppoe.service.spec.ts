import { Test, TestingModule } from '@nestjs/testing';
import { PppoeService } from './pppoe.service';
import { PrismaService } from '../../core/database/prisma.service';
import { EncryptionService } from '../../core/security/encryption.service';
import { AgentService } from '../agent/agent.service';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  AgentStatus,
  PppoeAccountStatus,
  SyncStatus,
  BillingCycle,
} from '@prisma/client';
import { AgentCommandType } from '../agent/dto/command.dto';

describe('PppoeService (Task 4.3)', () => {
  let service: PppoeService;
  let prisma: any;
  let encryptionService: any;
  let agentService: any;

  const mockTenantId = 'tenant-uuid-1';
  const mockOtherTenantId = 'tenant-uuid-other';
  const mockDeviceId = 'device-uuid-1';
  const mockUserId = 'user-uuid-1';

  const mockDevice = {
    id: mockDeviceId,
    tenantId: mockTenantId,
    name: 'Main MikroTik Router',
    deletedAt: null,
  };

  const mockProfile = {
    id: 'profile-uuid-1',
    tenantId: mockTenantId,
    deviceId: mockDeviceId,
    name: '10Mbps-Home',
    rateLimit: '5M/10M',
    localAddress: '10.100.0.1',
    remoteAddress: 'pppoe-pool',
    dnsServers: '8.8.8.8,1.1.1.1',
    onlyOne: true,
    price: 5000,
    description: 'Residential plan',
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { accounts: 0 },
  };

  const mockAccount = {
    id: 'account-uuid-1',
    tenantId: mockTenantId,
    deviceId: mockDeviceId,
    profileId: 'profile-uuid-1',
    username: 'sub_001_home',
    passwordEncrypted: 'cipher_123',
    iv: 'iv_123',
    authTag: 'tag_123',
    status: PppoeAccountStatus.ACTIVE,
    callerId: '00:1A:2B:3C:4D:5E',
    staticIp: '10.100.1.50',
    customerName: 'Ali Ahmed',
    customerPhone: '+249912345678',
    price: 5000,
    billingCycle: BillingCycle.MONTHLY,
    expiresAt: new Date('2026-11-12'),
    notes: 'Fiber port 2',
    syncStatus: SyncStatus.PENDING,
    syncError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    profile: { name: '10Mbps-Home' },
  };

  beforeEach(async () => {
    prisma = {
      mikroTikDevice: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === mockDeviceId) return Promise.resolve(mockDevice);
          return Promise.resolve(null);
        }),
      },
      pppoeProfile: {
        findMany: jest.fn().mockResolvedValue([mockProfile]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(mockProfile),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'profile-new-id',
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...mockProfile,
            ...data,
            updatedAt: new Date(),
          }),
        ),
        delete: jest.fn().mockResolvedValue(mockProfile),
      },
      pppoeAccount: {
        findMany: jest.fn().mockResolvedValue([mockAccount]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(mockAccount),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'account-new-id',
            ...data,
            profile: { name: '10Mbps-Home' },
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...mockAccount,
            ...data,
            updatedAt: new Date(),
          }),
        ),
        delete: jest.fn().mockResolvedValue(mockAccount),
      },
      pppoeActiveSession: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      deviceAgent: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'agent-1',
          deviceId: mockDeviceId,
          status: AgentStatus.ONLINE,
        }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: mockTenantId, status: 'ACTIVE' }),
      },
      subscription: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'sub-pppoe-1',
          tenantId: mockTenantId,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 86400000 * 30),
        }),
      },
    };

    encryptionService = {
      encrypt: jest.fn().mockReturnValue({
        ciphertext: 'encrypted_secret_payload_hex',
        iv: 'iv_hex_12_bytes',
        authTag: 'auth_tag_hex_16_bytes',
      }),
      decrypt: jest.fn().mockReturnValue('plaintext_password_123'),
      tryDecrypt: jest.fn().mockReturnValue('plaintext_password_123'),
    };

    agentService = {
      queueCommand: jest.fn().mockResolvedValue({
        id: 'cmd-pppoe-test-1',
        operationId: 'op-uuid-1',
        status: 'PENDING',
        type: AgentCommandType.PPPOE_SECRET_ADD,
      }),
      getCommandStatus: jest.fn().mockResolvedValue({
        id: 'cmd-pppoe-test-1',
        operationId: 'op-uuid-1',
        status: 'COMPLETED',
        result: { status: 'CREATED', username: 'sub_001_home' },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PppoeService,
        { provide: PrismaService, useValue: prisma },
        { provide: EncryptionService, useValue: encryptionService },
        { provide: AgentService, useValue: agentService },
      ],
    }).compile();

    service = module.get<PppoeService>(PppoeService);
  });

  // -------------------------------------------------------------------------
  // 1. إنشاء بروفايل وحساب PPPoE
  // -------------------------------------------------------------------------
  describe('1. Profile and Account Creation', () => {
    it('should create a valid PPPoE profile and queue sync command', async () => {
      const res = await service.createProfile(
        mockTenantId,
        mockDeviceId,
        {
          name: '20Mbps-Ultra',
          rateLimit: '20M/20M',
          localAddress: '10.100.0.1',
          remoteAddress: 'pppoe-pool',
          dnsServers: '8.8.8.8',
          onlyOne: true,
          price: 8000,
        },
        mockUserId,
      );

      expect(res.name).toBe('20Mbps-Ultra');
      expect(res.rateLimit).toBe('20M/20M');
      expect(res.price).toBe(8000);
      expect(agentService.queueCommand).toHaveBeenCalledWith(
        mockTenantId,
        mockDeviceId,
        expect.objectContaining({
          type: AgentCommandType.PPPOE_PROFILE_SYNC,
          payload: expect.objectContaining({ name: '20Mbps-Ultra', rateLimit: '20M/20M' }),
        }),
        mockUserId,
      );
    });

    it('should create a valid PPPoE account with AES-256-GCM encryption and queue secret add', async () => {
      const res = await service.createAccount(
        mockTenantId,
        mockDeviceId,
        {
          profileId: mockProfile.id,
          username: 'new_subscriber_01',
          password: 'TopSecretPassword99!',
          customerName: 'Fatima Omer',
          customerPhone: '+249912000000',
        },
        mockUserId,
      );

      expect(res.username).toBe('new_subscriber_01');
      expect(res.status).toBe(PppoeAccountStatus.ACTIVE);
      // Ensure raw password is NOT in response
      expect((res as any).password).toBeUndefined();
      expect((res as any).passwordEncrypted).toBeUndefined();
      expect((res as any).iv).toBeUndefined();
      expect((res as any).authTag).toBeUndefined();

      // Ensure encryptionService was used
      expect(encryptionService.encrypt).toHaveBeenCalledWith('TopSecretPassword99!');

      // Ensure agent command was queued with raw password only in transport payload
      expect(agentService.queueCommand).toHaveBeenCalledWith(
        mockTenantId,
        mockDeviceId,
        expect.objectContaining({
          type: AgentCommandType.PPPOE_SECRET_ADD,
          payload: expect.objectContaining({
            username: 'new_subscriber_01',
            password: 'TopSecretPassword99!',
            profile: mockProfile.name,
          }),
        }),
        mockUserId,
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. التحقق من صحة المدخلات ومنع التكرار (Validation & Duplicate Prevention)
  // -------------------------------------------------------------------------
  describe('2. Duplicate and Input Validation', () => {
    it('should reject creating duplicate profile with same name on same router', async () => {
      prisma.pppoeProfile.findUnique.mockResolvedValueOnce(mockProfile);

      await expect(
        service.createProfile(mockTenantId, mockDeviceId, { name: '10Mbps-Home' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject creating duplicate account with same username on same router', async () => {
      prisma.pppoeAccount.findUnique.mockResolvedValueOnce(mockAccount);

      await expect(
        service.createAccount(mockTenantId, mockDeviceId, {
          profileId: mockProfile.id,
          username: 'sub_001_home',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // -------------------------------------------------------------------------
  // 3. منع حذف بروفايل مرتبط بحسابات (Prevent Delete If Assigned to Accounts)
  // -------------------------------------------------------------------------
  describe('3. Delete Profile Protection', () => {
    it('should strictly block deleting a profile if it has assigned subscriber accounts', async () => {
      prisma.pppoeAccount.count.mockResolvedValueOnce(5); // 5 linked accounts

      await expect(
        service.deleteProfile(mockTenantId, mockDeviceId, mockProfile.id),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.pppoeProfile.delete).not.toHaveBeenCalled();
    });

    it('should allow deleting a profile if it has zero assigned accounts', async () => {
      prisma.pppoeAccount.count.mockResolvedValueOnce(0); // 0 accounts

      const res = await service.deleteProfile(mockTenantId, mockDeviceId, mockProfile.id);
      expect(res.success).toBe(true);
      expect(prisma.pppoeProfile.delete).toHaveBeenCalledWith({ where: { id: mockProfile.id } });
    });
  });

  // -------------------------------------------------------------------------
  // 4. عزل بيانات المستأجرين والراوترات (Multi-tenant & Device Isolation)
  // -------------------------------------------------------------------------
  describe('4. Multi-Tenant and Device Isolation', () => {
    it('should reject access if router device belongs to a different tenant', async () => {
      await expect(
        service.listProfiles(mockOtherTenantId, mockDeviceId),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.listAccounts(mockOtherTenantId, mockDeviceId, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if device does not exist', async () => {
      await expect(
        service.listProfiles(mockTenantId, 'non-existent-device-uuid'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // 5. تعطيل وتفعيل الحساب (Account Status Transitions)
  // -------------------------------------------------------------------------
  describe('5. Account Status Management (Disable & Enable)', () => {
    it('should disable subscriber account and queue PPPOE_SECRET_DISABLE with disconnectActive', async () => {
      const res = await service.disableAccount(mockTenantId, mockDeviceId, mockAccount.id, mockUserId);

      expect(res.status).toBe(PppoeAccountStatus.DISABLED);
      expect(agentService.queueCommand).toHaveBeenCalledWith(
        mockTenantId,
        mockDeviceId,
        expect.objectContaining({
          type: AgentCommandType.PPPOE_SECRET_DISABLE,
          payload: expect.objectContaining({ username: mockAccount.username, disconnectActive: true }),
        }),
        mockUserId,
      );
    });

    it('should enable subscriber account and queue PPPOE_SECRET_ENABLE', async () => {
      const res = await service.enableAccount(mockTenantId, mockDeviceId, mockAccount.id, mockUserId);

      expect(res.status).toBe(PppoeAccountStatus.ACTIVE);
      expect(agentService.queueCommand).toHaveBeenCalledWith(
        mockTenantId,
        mockDeviceId,
        expect.objectContaining({
          type: AgentCommandType.PPPOE_SECRET_ENABLE,
          payload: expect.objectContaining({ username: mockAccount.username }),
        }),
        mockUserId,
      );
    });

    it('should delete subscriber account and queue PPPOE_SECRET_REMOVE', async () => {
      const res = await service.deleteAccount(mockTenantId, mockDeviceId, mockAccount.id, mockUserId);

      expect(res.success).toBe(true);
      expect(agentService.queueCommand).toHaveBeenCalledWith(
        mockTenantId,
        mockDeviceId,
        expect.objectContaining({
          type: AgentCommandType.PPPOE_SECRET_REMOVE,
          payload: expect.objectContaining({ username: mockAccount.username }),
        }),
        mockUserId,
      );
      expect(prisma.pppoeAccount.delete).toHaveBeenCalledWith({ where: { id: mockAccount.id } });
    });
  });

  // -------------------------------------------------------------------------
  // 6. الجلسات النشطة وفصل الجلسة (Active Sessions & Disconnection)
  // -------------------------------------------------------------------------
  describe('6. Active Sessions & Disconnect', () => {
    it('should list sessions and optionally queue PPPOE_SESSION_LIST sync', async () => {
      const res = await service.listActiveSessions(mockTenantId, mockDeviceId, true, mockUserId);
      expect(res.sessions).toBeDefined();
      expect(agentService.queueCommand).toHaveBeenCalledWith(
        mockTenantId,
        mockDeviceId,
        expect.objectContaining({
          type: AgentCommandType.PPPOE_SESSION_LIST,
        }),
        mockUserId,
      );
    });

    it('should disconnect active session for subscriber on authorized device', async () => {
      prisma.pppoeAccount.findUnique.mockResolvedValueOnce(mockAccount);

      const res = await service.disconnectActiveSession(
        mockTenantId,
        mockDeviceId,
        { username: mockAccount.username },
        mockUserId,
      );

      expect(res.success).toBe(true);
      expect(agentService.queueCommand).toHaveBeenCalledWith(
        mockTenantId,
        mockDeviceId,
        expect.objectContaining({
          type: AgentCommandType.PPPOE_SESSION_DISCONNECT,
          payload: expect.objectContaining({ username: mockAccount.username }),
        }),
        mockUserId,
      );
    });

    it('should reject disconnecting username not found on this router', async () => {
      prisma.pppoeAccount.findUnique.mockResolvedValueOnce(null);
      prisma.pppoeActiveSession.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.disconnectActiveSession(
          mockTenantId,
          mockDeviceId,
          { username: 'unauthorized_stranger' },
          mockUserId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // 7. استعلام حالة الأوامر (Agent Command Status)
  // -------------------------------------------------------------------------
  describe('7. Command Status & Safe Handling', () => {
    it('should retrieve command execution outcome via AgentService', async () => {
      const res = await agentService.getCommandStatus(mockTenantId, mockDeviceId, 'cmd-1');
      expect(res.status).toBe('COMPLETED');
      expect(res.result?.username).toBe('sub_001_home');
    });

    it('should safely handle when no agent is paired for the router during creation', async () => {
      prisma.deviceAgent.findFirst.mockResolvedValueOnce(null); // No active agent

      const res = await service.createAccount(
        mockTenantId,
        mockDeviceId,
        {
          profileId: mockProfile.id,
          username: 'no_agent_user',
          password: 'mypassword',
        },
        mockUserId,
      );

      expect(res.username).toBe('no_agent_user');
      expect(res.queuedCommandId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 8. أمان كلمات المرور (Password Security)
  // -------------------------------------------------------------------------
  describe('8. Strict Password Safety', () => {
    it('should never expose plaintext or encrypted password in listAccounts or getAccount responses', async () => {
      const list = await service.listAccounts(mockTenantId, mockDeviceId, {});
      const firstAccount = list.data[0];

      expect((firstAccount as any).password).toBeUndefined();
      expect((firstAccount as any).passwordEncrypted).toBeUndefined();
      expect((firstAccount as any).iv).toBeUndefined();
      expect((firstAccount as any).authTag).toBeUndefined();

      const single = await service.getAccount(mockTenantId, mockDeviceId, mockAccount.id);
      expect((single as any).password).toBeUndefined();
      expect((single as any).passwordEncrypted).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 9. التحقق الصارم من اشتراك PPPoE (Priority P2)
  // -------------------------------------------------------------------------
  describe('9. Strict Subscription Verification (Priority P2)', () => {
    it('should throw ForbiddenException (SUBSCRIPTION_REQUIRED) when tenant has no subscription', async () => {
      prisma.subscription.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.createAccount(
          mockTenantId,
          mockDeviceId,
          {
            username: 'sub_blocked',
            password: 'pass',
            profileId: mockProfile.id,
          },
          mockUserId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException (SUBSCRIPTION_EXPIRED) when subscription has expired', async () => {
      prisma.subscription.findFirst.mockResolvedValueOnce({
        id: 'sub-expired',
        tenantId: mockTenantId,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
      });

      await expect(
        service.createAccount(
          mockTenantId,
          mockDeviceId,
          {
            username: 'sub_expired_block',
            password: 'pass',
            profileId: mockProfile.id,
          },
          mockUserId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException (TENANT_SUSPENDED) when tenant is suspended', async () => {
      prisma.tenant.findUnique.mockResolvedValueOnce({
        id: mockTenantId,
        status: 'SUSPENDED',
      });

      await expect(
        service.createAccount(
          mockTenantId,
          mockDeviceId,
          {
            username: 'sub_suspended_block',
            password: 'pass',
            profileId: mockProfile.id,
          },
          mockUserId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when creating profile with expired subscription', async () => {
      prisma.subscription.findFirst.mockResolvedValueOnce({
        id: 'sub-expired',
        tenantId: mockTenantId,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() - 3600000),
      });

      await expect(
        service.createProfile(
          mockTenantId,
          mockDeviceId,
          {
            name: 'Expired-Profile',
            rateLimit: '2M/2M',
          },
          mockUserId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow Super Admin to bypass subscription check when tenantId is undefined', async () => {
      prisma.subscription.findFirst.mockResolvedValueOnce(null);

      // Super Admin call: tenantId is undefined
      const created = await service.createAccount(
        undefined,
        mockDeviceId,
        {
          username: 'super_admin_account',
          password: 'secret_password',
          profileId: mockProfile.id,
        },
        'super-admin-user-id',
      );

      expect(created.username).toBe('super_admin_account');
    });

    it('should allow read-only operations even if subscription is expired', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-expired',
        tenantId: mockTenantId,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() - 3600000),
      });

      // Reading accounts and profiles should succeed
      const accounts = await service.listAccounts(mockTenantId, mockDeviceId, {});
      expect(accounts.data).toBeDefined();

      const profiles = await service.listProfiles(mockTenantId, mockDeviceId);
      expect(profiles).toBeDefined();
    });
  });
});
