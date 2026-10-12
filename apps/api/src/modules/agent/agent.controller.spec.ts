import { Test, TestingModule } from '@nestjs/testing';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { TenantContextService } from '../../core/multi-tenancy/tenant-context.service';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../core/multi-tenancy/tenant.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import type { Request } from 'express';

describe('AgentController', () => {
  let controller: AgentController;
  let service: any;

  const mockDeviceId = 'device-uuid-1';
  const mockTenantId = 'tenant-uuid-1';
  const mockUserId = 'user-uuid-1';

  beforeEach(async () => {
    service = {
      generatePairingCode: jest.fn(),
      getAgentStatus: jest.fn(),
      revokeAgent: jest.fn(),
      pairAgent: jest.fn(),
      validateAgentToken: jest.fn(),
      processHeartbeat: jest.fn(),
      submitCommandResult: jest.fn(),
      queueCommand: jest.fn(),
      getCommandStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [
        { provide: AgentService, useValue: service },
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

    controller = module.get<AgentController>(AgentController);
  });

  describe('generatePairingCode', () => {
    it('should delegate code generation to service', async () => {
      const mockResult = {
        code: '123456',
        expiresAt: new Date(),
        expiresInSeconds: 300,
      };
      service.generatePairingCode.mockResolvedValue(mockResult);

      const result = await controller.generatePairingCode(mockDeviceId, mockTenantId, mockUserId);
      expect(result).toEqual(mockResult);
      expect(service.generatePairingCode).toHaveBeenCalledWith(mockTenantId, mockDeviceId, mockUserId);
    });
  });

  describe('getAgentStatus', () => {
    it('should return agent status from service', async () => {
      const mockStatus = {
        id: 'agent-1',
        tenantId: mockTenantId,
        deviceId: mockDeviceId,
        name: 'POS',
        status: AgentStatus.OFFLINE,
        pairedAt: new Date(),
      };
      service.getAgentStatus.mockResolvedValue(mockStatus);

      const result = await controller.getAgentStatus(mockDeviceId, mockTenantId);
      expect(result).toEqual(mockStatus);
      expect(service.getAgentStatus).toHaveBeenCalledWith(mockTenantId, mockDeviceId);
    });
  });

  describe('revokeAgent', () => {
    it('should delegate revocation to service', async () => {
      service.revokeAgent.mockResolvedValue({ success: true, message: 'Revoked' });

      const result = await controller.revokeAgent(mockDeviceId, mockTenantId, mockUserId);
      expect(result.success).toBe(true);
      expect(service.revokeAgent).toHaveBeenCalledWith(mockTenantId, mockDeviceId, mockUserId);
    });

    it('should support alternative POST revoke endpoint', async () => {
      service.revokeAgent.mockResolvedValue({ success: true, message: 'Revoked' });

      const result = await controller.revokeAgentPost(mockDeviceId, mockTenantId, mockUserId);
      expect(result.success).toBe(true);
      expect(service.revokeAgent).toHaveBeenCalledWith(mockTenantId, mockDeviceId, mockUserId);
    });
  });

  describe('queueCommand & getCommandStatus', () => {
    it('should queue a typed command via service', async () => {
      const mockCommandResponse = {
        id: 'cmd-1',
        operationId: 'op-1',
        type: 'system.router.health',
        status: 'PENDING',
      };
      service.queueCommand.mockResolvedValue(mockCommandResponse);

      const dto = {
        operationId: 'c6d23156-f084-482a-a92c-15a0c8413b52',
        type: 'system.router.health' as any,
        payload: {},
      };

      const result = await controller.queueCommand(mockDeviceId, dto, mockTenantId, mockUserId);
      expect(result).toEqual(mockCommandResponse);
      expect(service.queueCommand).toHaveBeenCalledWith(mockTenantId, mockDeviceId, dto, mockUserId);
    });

    it('should fetch command status via service', async () => {
      const mockCommandResponse = { id: 'cmd-1', status: 'COMPLETED' };
      service.getCommandStatus.mockResolvedValue(mockCommandResponse);

      const result = await controller.getCommandStatus(mockDeviceId, 'cmd-1', mockTenantId);
      expect(result).toEqual(mockCommandResponse);
      expect(service.getCommandStatus).toHaveBeenCalledWith(mockTenantId, mockDeviceId, 'cmd-1');
    });
  });

  describe('pairAgent', () => {
    it('should extract client IP and user agent and call service', async () => {
      const mockPairSuccess = {
        success: true,
        agentId: 'agent-1',
        agentToken: 'token-64',
        deviceId: mockDeviceId,
        tenantId: mockTenantId,
      };
      service.pairAgent.mockResolvedValue(mockPairSuccess);

      const mockReq = {
        ip: '192.168.1.100',
        headers: {
          'user-agent': 'sudafi-agent/1.0.0',
        },
      } as unknown as Request;

      const dto = { pairingCode: '123456', name: 'POS-PC', version: '1.0.0' };
      const result = await controller.pairAgent(dto, mockReq);

      expect(result).toEqual(mockPairSuccess);
      expect(service.pairAgent).toHaveBeenCalledWith(dto, '192.168.1.100', 'sudafi-agent/1.0.0');
    });

    it('should rely strictly on Express-vetted req.ip rather than unvetted headers', async () => {
      service.pairAgent.mockResolvedValue({ success: true });

      const mockReq = {
        ip: '198.51.100.42',
        headers: {
          'x-forwarded-for': 'spoofed.ip.attacker.net',
          'user-agent': 'sudafi-agent/1.0.0',
        },
      } as unknown as Request;

      const dto = { pairingCode: '123456', name: 'POS-PC' };
      await controller.pairAgent(dto, mockReq);

      expect(service.pairAgent).toHaveBeenCalledWith(dto, '198.51.100.42', 'sudafi-agent/1.0.0');
    });
  });

  describe('heartbeat', () => {
    it('should extract Bearer token and process heartbeat with vetted IP', async () => {
      const mockHeartbeatResp = {
        status: 'ACK',
        serverTime: new Date(),
        heartbeatIntervalMs: 25000,
        offlineThresholdMs: 60000,
        pendingCommands: [],
      };
      service.processHeartbeat.mockResolvedValue(mockHeartbeatResp);

      const mockReq = {
        ip: '197.25.10.5',
        headers: {
          authorization: 'Bearer raw-agent-token-12345',
        },
      } as unknown as Request;

      const dto = { version: '1.0.0' };
      const result = await controller.heartbeat(dto, mockReq);

      expect(result).toEqual(mockHeartbeatResp);
      expect(service.processHeartbeat).toHaveBeenCalledWith('raw-agent-token-12345', '197.25.10.5', dto);
    });

    it('should accept token from x-agent-token header', async () => {
      service.processHeartbeat.mockResolvedValue({ status: 'ACK' });

      const mockReq = {
        ip: '197.25.10.5',
        headers: {
          'x-agent-token': 'header-agent-token',
        },
      } as unknown as Request;

      await controller.heartbeat({}, mockReq);
      expect(service.processHeartbeat).toHaveBeenCalledWith('header-agent-token', '197.25.10.5', {});
    });

    it('should reject heartbeat if token is missing', async () => {
      const mockReq = {
        ip: '197.25.10.5',
        headers: {},
        body: {},
      } as unknown as Request;

      await expect(controller.heartbeat({}, mockReq)).rejects.toThrow();
    });
  });

  describe('submitCommandResult', () => {
    it('should extract token and delegate command result to service', async () => {
      service.submitCommandResult.mockResolvedValue({ success: true, message: 'Recorded' });

      const mockReq = {
        headers: {
          authorization: 'Bearer raw-agent-token-12345',
        },
      } as unknown as Request;

      const dto = {
        operationId: 'c6d23156-f084-482a-a92c-15a0c8413b52',
        status: 'COMPLETED' as const,
        result: { status: 'OK' },
      };

      const result = await controller.submitCommandResult('cmd-uuid-1', dto, mockReq);
      expect(result.success).toBe(true);
      expect(service.submitCommandResult).toHaveBeenCalledWith('raw-agent-token-12345', 'cmd-uuid-1', dto);
    });
  });

  describe('validateToken', () => {
    it('should delegate token validation to service', async () => {
      service.validateAgentToken.mockResolvedValue({ valid: true, agent: { id: 'agent-1' } });

      const result = await controller.validateToken('raw-token');
      expect(result.valid).toBe(true);
      expect(service.validateAgentToken).toHaveBeenCalledWith('raw-token');
    });
  });
});

