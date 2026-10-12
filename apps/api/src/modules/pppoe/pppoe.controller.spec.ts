import { Test, TestingModule } from '@nestjs/testing';
import { PppoeController } from './pppoe.controller';
import { PppoeService } from './pppoe.service';
import { AgentService } from '../agent/agent.service';
import { PrismaService } from '../../core/database/prisma.service';
import { TenantContextService } from '../../core/multi-tenancy/tenant-context.service';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../core/multi-tenancy/tenant.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { PppoeAccountStatus } from '@prisma/client';

describe('PppoeController', () => {
  let controller: PppoeController;
  let pppoeService: any;
  let agentService: any;

  const mockTenantId = 'tenant-1';
  const mockDeviceId = 'device-1';
  const mockUserId = 'user-1';

  beforeEach(async () => {
    pppoeService = {
      listProfiles: jest.fn().mockResolvedValue([]),
      createProfile: jest.fn().mockResolvedValue({ id: 'p1', name: 'Profile 1' }),
      getProfile: jest.fn().mockResolvedValue({ id: 'p1', name: 'Profile 1' }),
      updateProfile: jest.fn().mockResolvedValue({ id: 'p1', name: 'Profile 1' }),
      deleteProfile: jest.fn().mockResolvedValue({ success: true, message: 'Profile deleted' }),
      syncProfileToRouter: jest.fn().mockResolvedValue({ success: true, queuedCommandId: 'cmd-1' }),

      listAccounts: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
      createAccount: jest.fn().mockResolvedValue({ id: 'a1', username: 'user1' }),
      getAccount: jest.fn().mockResolvedValue({ id: 'a1', username: 'user1' }),
      updateAccount: jest.fn().mockResolvedValue({ id: 'a1', username: 'user1' }),
      disableAccount: jest.fn().mockResolvedValue({ id: 'a1', status: PppoeAccountStatus.DISABLED }),
      enableAccount: jest.fn().mockResolvedValue({ id: 'a1', status: PppoeAccountStatus.ACTIVE }),
      deleteAccount: jest.fn().mockResolvedValue({ success: true, message: 'Account deleted' }),

      listActiveSessions: jest.fn().mockResolvedValue({ sessions: [], queuedCommandId: null }),
      disconnectActiveSession: jest.fn().mockResolvedValue({ success: true, queuedCommandId: 'cmd-disc' }),
      assertDeviceOwnership: jest.fn().mockResolvedValue({ id: mockDeviceId, tenantId: mockTenantId }),
    };

    agentService = {
      getCommandStatus: jest.fn().mockResolvedValue({
        id: 'cmd-1',
        status: 'COMPLETED',
        operationId: 'op-1',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PppoeController],
      providers: [
        { provide: PppoeService, useValue: pppoeService },
        { provide: AgentService, useValue: agentService },
        { provide: PrismaService, useValue: {} },
        { provide: TenantContextService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PppoeController>(PppoeController);
  });

  describe('Profiles Endpoints', () => {
    it('should delegate listProfiles to service', async () => {
      await controller.listProfiles(mockTenantId, mockDeviceId);
      expect(pppoeService.listProfiles).toHaveBeenCalledWith(mockTenantId, mockDeviceId);
    });

    it('should delegate createProfile to service with tenant and user ID', async () => {
      const dto = { name: 'Plan-10M', rateLimit: '10M/10M' };
      await controller.createProfile(mockTenantId, mockDeviceId, dto, mockUserId);
      expect(pppoeService.createProfile).toHaveBeenCalledWith(mockTenantId, mockDeviceId, dto, mockUserId);
    });

    it('should delegate updateProfile to service', async () => {
      const dto = { rateLimit: '15M/15M' };
      await controller.updateProfile(mockTenantId, mockDeviceId, 'p1', dto, mockUserId);
      expect(pppoeService.updateProfile).toHaveBeenCalledWith(mockTenantId, mockDeviceId, 'p1', dto, mockUserId);
    });

    it('should delegate deleteProfile to service', async () => {
      await controller.deleteProfile(mockTenantId, mockDeviceId, 'p1', mockUserId);
      expect(pppoeService.deleteProfile).toHaveBeenCalledWith(mockTenantId, mockDeviceId, 'p1', mockUserId);
    });

    it('should delegate syncProfile to service', async () => {
      await controller.syncProfile(mockTenantId, mockDeviceId, 'p1', mockUserId);
      expect(pppoeService.syncProfileToRouter).toHaveBeenCalledWith(mockTenantId, mockDeviceId, 'p1', mockUserId);
    });
  });

  describe('Accounts Endpoints', () => {
    it('should delegate listAccounts with query parameters', async () => {
      const query = { page: 1, limit: 10, search: 'user' };
      await controller.listAccounts(mockTenantId, mockDeviceId, query);
      expect(pppoeService.listAccounts).toHaveBeenCalledWith(mockTenantId, mockDeviceId, query);
    });

    it('should delegate createAccount to service', async () => {
      const dto = {
        profileId: 'p1',
        username: 'sub1',
        password: 'securePassword1',
        customerName: 'Customer 1',
      };
      await controller.createAccount(mockTenantId, mockDeviceId, dto, mockUserId);
      expect(pppoeService.createAccount).toHaveBeenCalledWith(mockTenantId, mockDeviceId, dto, mockUserId);
    });

    it('should delegate disableAccount and enableAccount to service', async () => {
      await controller.disableAccount(mockTenantId, mockDeviceId, 'a1', mockUserId);
      expect(pppoeService.disableAccount).toHaveBeenCalledWith(mockTenantId, mockDeviceId, 'a1', mockUserId);

      await controller.enableAccount(mockTenantId, mockDeviceId, 'a1', mockUserId);
      expect(pppoeService.enableAccount).toHaveBeenCalledWith(mockTenantId, mockDeviceId, 'a1', mockUserId);
    });

    it('should delegate deleteAccount to service', async () => {
      await controller.deleteAccount(mockTenantId, mockDeviceId, 'a1', mockUserId);
      expect(pppoeService.deleteAccount).toHaveBeenCalledWith(mockTenantId, mockDeviceId, 'a1', mockUserId);
    });
  });

  describe('Sessions & Command Status Endpoints', () => {
    it('should delegate listSessions with sync parameter', async () => {
      await controller.listSessions(mockTenantId, mockDeviceId, 'true', mockUserId);
      expect(pppoeService.listActiveSessions).toHaveBeenCalledWith(mockTenantId, mockDeviceId, true, mockUserId);
    });

    it('should delegate disconnectSession to service', async () => {
      const dto = { username: 'sub1' };
      await controller.disconnectSession(mockTenantId, mockDeviceId, dto, mockUserId);
      expect(pppoeService.disconnectActiveSession).toHaveBeenCalledWith(mockTenantId, mockDeviceId, dto, mockUserId);
    });

    it('should assert ownership and get command status', async () => {
      const res = await controller.getCommandStatus(mockTenantId, mockDeviceId, 'cmd-1');
      expect(pppoeService.assertDeviceOwnership).toHaveBeenCalledWith(mockTenantId, mockDeviceId);
      expect(agentService.getCommandStatus).toHaveBeenCalledWith(mockTenantId, mockDeviceId, 'cmd-1');
      expect(res.status).toBe('COMPLETED');
    });
  });
});
