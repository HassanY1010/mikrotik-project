import { Test, TestingModule } from '@nestjs/testing';
import { MikrotikOperationExecutorService } from './mikrotik-operation-executor.service';
import { MikrotikClientFactory, DeviceConnectionConfig } from '../mikrotik-client.factory';
import { IMikrotikClient } from '../interfaces/mikrotik-client.interface';
import {
  OperationExecutionStatus,
  OperationFailurePhase,
} from '../interfaces/mikrotik-operation.interface';
import { RouterOsVersion } from '@prisma/client';

describe('MikrotikOperationExecutorService', () => {
  let service: MikrotikOperationExecutorService;
  let clientFactory: jest.Mocked<MikrotikClientFactory>;
  let mockClient: jest.Mocked<IMikrotikClient>;

  const sampleDeviceConfig: DeviceConnectionConfig = {
    id: 'dev-1',
    name: 'Main MikroTik',
    host: '192.168.88.1',
    apiPort: 8728,
    useSsl: false,
    username: 'admin',
    passwordEncrypted: 'enc-pass',
    iv: 'iv',
    authTag: 'tag',
    rosVersion: RouterOsVersion.V7,
  };

  beforeEach(async () => {
    mockClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      isConnected: jest.fn().mockReturnValue(true),
      getIdentity: jest.fn().mockResolvedValue('MikroTik-Test'),
      listHotspotProfiles: jest.fn().mockResolvedValue([]),
      createHotspotProfile: jest.fn().mockResolvedValue(undefined),
      updateHotspotProfile: jest.fn().mockResolvedValue(undefined),
      deleteHotspotProfile: jest.fn().mockResolvedValue(undefined),
      getHotspotUser: jest.fn().mockResolvedValue(null),
      createHotspotUser: jest.fn().mockResolvedValue(undefined),
      updateHotspotUser: jest.fn().mockResolvedValue(undefined),
      deleteHotspotUser: jest.fn().mockResolvedValue(undefined),
      listActiveSessions: jest.fn().mockResolvedValue([]),
      removeActiveSession: jest.fn().mockResolvedValue(undefined),
      listPppProfiles: jest.fn().mockResolvedValue([]),
      createPppProfile: jest.fn().mockResolvedValue(undefined),
      updatePppProfile: jest.fn().mockResolvedValue(undefined),
      deletePppProfile: jest.fn().mockResolvedValue(undefined),
      listPppSecrets: jest.fn().mockResolvedValue([]),
      createPppSecret: jest.fn().mockResolvedValue(undefined),
      updatePppSecret: jest.fn().mockResolvedValue(undefined),
      deletePppSecret: jest.fn().mockResolvedValue(undefined),
      enablePppSecret: jest.fn().mockResolvedValue(undefined),
      disablePppSecret: jest.fn().mockResolvedValue(undefined),
      listPppActiveSessions: jest.fn().mockResolvedValue([]),
      removePppActiveSession: jest.fn().mockResolvedValue(undefined),
      uploadFile: jest.fn().mockResolvedValue(undefined),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IMikrotikClient>;

    const mockFactory = {
      getClient: jest.fn().mockResolvedValue(mockClient),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MikrotikOperationExecutorService,
        { provide: MikrotikClientFactory, useValue: mockFactory },
      ],
    }).compile();

    service = module.get<MikrotikOperationExecutorService>(MikrotikOperationExecutorService);
    clientFactory = module.get(MikrotikClientFactory);
  });

  describe('Sanitization and Error Translation', () => {
    it('masks passwords in strings and json payloads', () => {
      const sensitive = 'Failed password=secret123 and {"password":"mypassword"}';
      const sanitized = service.sanitize(sensitive);
      expect(sanitized).not.toContain('secret123');
      expect(sanitized).not.toContain('mypassword');
      expect(sanitized).toContain('password=***');
      expect(sanitized).toContain('"password":"***"');
    });

    it('translates network and permission errors to user-friendly Arabic', () => {
      expect(service.translateErrorToArabic('ETIMEDOUT: Connection timed out')).toContain('انتهت مهلة الاتصال');
      expect(service.translateErrorToArabic('not enough permissions')).toContain('الصلاحيات الكافية');
      expect(service.translateErrorToArabic('ECONNREFUSED')).toContain('تم رفض الاتصال');
    });
  });

  describe('Hotspot User Creation with Read-After-Write Verification', () => {
    it('successfully creates, reads back, and verifies a hotspot user', async () => {
      const createdUser = {
        id: '*1',
        name: 'voucher101',
        profile: '1hour',
        disabled: false,
      };

      // 1. Pre-check: user does not exist
      mockClient.getHotspotUser.mockResolvedValueOnce(null);
      // 2. Execute create
      mockClient.createHotspotUser.mockResolvedValueOnce('*1');
      // 3. Post-check: user read back successfully
      mockClient.getHotspotUser.mockResolvedValueOnce(createdUser);

      const persistFn = jest.fn().mockResolvedValue(undefined);

      const result = await service.executeHotspotUserCreate(
        sampleDeviceConfig,
        { name: 'voucher101', profile: '1hour' },
        persistFn,
      );

      expect(result.status).toBe(OperationExecutionStatus.SUCCESS);
      expect(result.phase).toBe('COMPLETED');
      expect(result.data).toEqual(createdUser);
      expect(mockClient.createHotspotUser).toHaveBeenCalledTimes(1);
      expect(mockClient.getHotspotUser).toHaveBeenCalledTimes(2);
      expect(persistFn).toHaveBeenCalledWith(createdUser);
    });

    it('handles idempotency when user already exists with identical profile', async () => {
      const existingUser = {
        id: '*1',
        name: 'voucher101',
        profile: '1hour',
        disabled: false,
      };

      // Pre-check finds identical user
      mockClient.getHotspotUser.mockResolvedValueOnce(existingUser);

      const result = await service.executeHotspotUserCreate(sampleDeviceConfig, {
        name: 'voucher101',
        profile: '1hour',
      });

      expect(result.status).toBe(OperationExecutionStatus.SUCCESS);
      expect(result.phase).toBe('COMPLETED');
      expect(result.data).toEqual(existingUser);
      // create command must NOT be sent to router
      expect(mockClient.createHotspotUser).not.toHaveBeenCalled();
    });

    it('fails pre-check if user already exists with different profile', async () => {
      const existingUser = {
        id: '*1',
        name: 'voucher101',
        profile: '3hours',
        disabled: false,
      };

      mockClient.getHotspotUser.mockResolvedValueOnce(existingUser);

      const result = await service.executeHotspotUserCreate(sampleDeviceConfig, {
        name: 'voucher101',
        profile: '1hour',
      });

      expect(result.status).toBe(OperationExecutionStatus.FAILED);
      expect(result.phase).toBe(OperationFailurePhase.PRE_VERIFICATION);
      expect(result.error).toContain('already exists');
      expect(mockClient.createHotspotUser).not.toHaveBeenCalled();
    });

    it('fails when post-execution verification fails to find user after create', async () => {
      // 1. Pre-check: null
      mockClient.getHotspotUser.mockResolvedValueOnce(null);
      // 2. Execute: returns ok
      mockClient.createHotspotUser.mockResolvedValueOnce('*1');
      // 3. Read back: null! (router didn't save or dropped)
      mockClient.getHotspotUser.mockResolvedValueOnce(null);

      const persistFn = jest.fn();

      const result = await service.executeHotspotUserCreate(
        sampleDeviceConfig,
        { name: 'voucher101', profile: '1hour' },
        persistFn,
      );

      expect(result.status).toBe(OperationExecutionStatus.FAILED);
      expect(result.phase).toBe(OperationFailurePhase.POST_VERIFICATION);
      expect(persistFn).not.toHaveBeenCalled();
    });

    it('returns UNKNOWN when connection drops during post-verification read-back', async () => {
      mockClient.getHotspotUser.mockResolvedValueOnce(null);
      mockClient.createHotspotUser.mockResolvedValueOnce('*1');
      // Network disconnects during verify read-back
      mockClient.getHotspotUser.mockRejectedValueOnce(new Error('ETIMEDOUT'));

      const result = await service.executeHotspotUserCreate(sampleDeviceConfig, {
        name: 'voucher101',
        profile: '1hour',
      });

      expect(result.status).toBe(OperationExecutionStatus.UNKNOWN);
      expect(result.phase).toBe(OperationFailurePhase.POST_VERIFICATION);
    });

    it('rolls back on router if database persistence fails after successful verification', async () => {
      const createdUser = {
        id: '*1',
        name: 'voucher101',
        profile: '1hour',
        disabled: false,
      };

      mockClient.getHotspotUser.mockResolvedValueOnce(null);
      mockClient.createHotspotUser.mockResolvedValueOnce('*1');
      mockClient.getHotspotUser.mockResolvedValueOnce(createdUser);

      const persistFn = jest.fn().mockRejectedValue(new Error('DB Unique constraint violation'));

      const result = await service.executeHotspotUserCreate(
        sampleDeviceConfig,
        { name: 'voucher101', profile: '1hour' },
        persistFn,
      );

      expect(result.status).toBe(OperationExecutionStatus.FAILED);
      expect(result.phase).toBe(OperationFailurePhase.PERSISTENCE);
      // Rollback delete must be called
      expect(mockClient.deleteHotspotUser).toHaveBeenCalledWith('voucher101');
    });
  });

  describe('Hotspot User Deletion with Read-After-Write Verification', () => {
    it('successfully deletes and verifies deletion of hotspot user', async () => {
      const existingUser = { id: '*1', name: 'voucher101', profile: '1hour' };

      // Pre-check finds user
      mockClient.getHotspotUser.mockResolvedValueOnce(existingUser);
      // Execute delete
      mockClient.deleteHotspotUser.mockResolvedValueOnce(undefined);
      // Post-check confirms user is gone (returns null)
      mockClient.getHotspotUser.mockResolvedValueOnce(null);

      const persistFn = jest.fn().mockResolvedValue(undefined);

      const result = await service.executeHotspotUserDelete(
        sampleDeviceConfig,
        'voucher101',
        persistFn,
      );

      expect(result.status).toBe(OperationExecutionStatus.SUCCESS);
      expect(result.phase).toBe('COMPLETED');
      expect(mockClient.deleteHotspotUser).toHaveBeenCalledWith('voucher101');
      expect(persistFn).toHaveBeenCalledTimes(1);
    });

    it('handles idempotent deletion when user is already absent', async () => {
      // Pre-check finds user is already null
      mockClient.getHotspotUser.mockResolvedValueOnce(null);

      const persistFn = jest.fn().mockResolvedValue(undefined);

      const result = await service.executeHotspotUserDelete(
        sampleDeviceConfig,
        'voucher101',
        persistFn,
      );

      expect(result.status).toBe(OperationExecutionStatus.SUCCESS);
      expect(mockClient.deleteHotspotUser).not.toHaveBeenCalled();
      expect(persistFn).toHaveBeenCalledTimes(1);
    });

    it('fails if user is still present after delete command', async () => {
      const existingUser = { id: '*1', name: 'voucher101', profile: '1hour' };

      mockClient.getHotspotUser.mockResolvedValueOnce(existingUser);
      mockClient.deleteHotspotUser.mockResolvedValueOnce(undefined);
      // Still exists!
      mockClient.getHotspotUser.mockResolvedValueOnce(existingUser);

      const persistFn = jest.fn();

      const result = await service.executeHotspotUserDelete(
        sampleDeviceConfig,
        'voucher101',
        persistFn,
      );

      expect(result.status).toBe(OperationExecutionStatus.FAILED);
      expect(result.phase).toBe(OperationFailurePhase.POST_VERIFICATION);
      expect(persistFn).not.toHaveBeenCalled();
    });
  });

  describe('Active Session Termination with Verification', () => {
    it('successfully terminates session and verifies it is absent', async () => {
      const activeSession = {
        id: '*10',
        user: 'card-user-1',
        address: '192.168.88.10',
        macAddress: '00:11:22:33:44:55',
        uptime: '10m',
        bytesIn: 100,
        bytesOut: 200,
      };

      // Pre-check
      mockClient.listActiveSessions.mockResolvedValueOnce([activeSession]);
      // Remove
      mockClient.removeActiveSession.mockResolvedValueOnce(undefined);
      // Post-check: session list is now empty
      mockClient.listActiveSessions.mockResolvedValueOnce([]);

      const result = await service.executeActiveSessionRemove(sampleDeviceConfig, { id: '*10', user: 'card-user-1' });

      expect(result.status).toBe(OperationExecutionStatus.SUCCESS);
      expect(mockClient.removeActiveSession).toHaveBeenCalledWith('card-user-1');
    });

    it('is idempotent if session is already gone', async () => {
      mockClient.listActiveSessions.mockResolvedValueOnce([]);

      const result = await service.executeActiveSessionRemove(sampleDeviceConfig, { id: '*10', user: 'card-user-1' });

      expect(result.status).toBe(OperationExecutionStatus.SUCCESS);
      expect(mockClient.removeActiveSession).not.toHaveBeenCalled();
    });
  });

  describe('Connection Failure Isolation', () => {
    it('categorizes connection failure to CONNECTION phase without touching router', async () => {
      clientFactory.getClient.mockRejectedValueOnce(new Error('ECONNREFUSED 192.168.88.1:8728'));

      const result = await service.executeHotspotUserCreate(sampleDeviceConfig, {
        name: 'card-1',
        profile: 'default',
      });

      expect(result.status).toBe(OperationExecutionStatus.FAILED);
      expect(result.phase).toBe(OperationFailurePhase.CONNECTION);
      expect(result.errorArabic).toContain('تم رفض الاتصال');
    });
  });
});
