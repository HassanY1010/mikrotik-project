import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogsService } from './audit-logs.service';
import { PrismaService } from '../../core/database/prisma.service';

describe('AuditLogsService', () => {
  let service: AuditLogsService;
  let prisma: any;

  const mockTenantId = 'tenant-uuid-1';
  const mockUserId = 'user-uuid-1';

  beforeEach(async () => {
    prisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditLogsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AuditLogsService>(AuditLogsService);
  });

  describe('log', () => {
    it('should create an audit log entry in database safely', async () => {
      await service.log({
        tenantId: mockTenantId,
        userId: mockUserId,
        action: 'DEVICE_ADDED',
        entity: 'MikroTikDevice',
        entityId: 'dev-1',
        newValues: { name: 'Branch Gateway' },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: mockTenantId,
          userId: mockUserId,
          action: 'DEVICE_ADDED',
          entity: 'MikroTikDevice',
          entityId: 'dev-1',
        }),
      });
    });
  });

  describe('findAll', () => {
    it('should return paginated audit logs with user info', async () => {
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          tenantId: mockTenantId,
          userId: mockUserId,
          action: 'LOGIN',
          entity: 'User',
          entityId: mockUserId,
          oldValues: null,
          newValues: null,
          ipAddress: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
          createdAt: new Date(),
          user: { fullName: 'Admin User', email: 'admin@tenant.com' },
        },
      ]);
      prisma.auditLog.count.mockResolvedValue(1);

      const res = await service.findAll(mockTenantId, { page: 1, limit: 10 });
      expect(res.data).toHaveLength(1);
      expect(res.data[0].userName).toBe('Admin User');
      expect(res.total).toBe(1);
    });
  });

  describe('exportCsv', () => {
    it('should return CSV string starting with UTF-8 BOM', async () => {
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          tenantId: mockTenantId,
          userId: mockUserId,
          action: 'LOGIN',
          entity: 'User',
          entityId: mockUserId,
          oldValues: null,
          newValues: null,
          ipAddress: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
          createdAt: new Date(),
          user: { fullName: 'Admin User', email: 'admin@tenant.com' },
        },
      ]);
      prisma.auditLog.count.mockResolvedValue(1);

      const csv = await service.exportCsv(mockTenantId, {});
      expect(csv.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM
      expect(csv).toContain('التاريخ والوقت');
      expect(csv).toContain('LOGIN');
      expect(csv).toContain('Admin User');
    });
  });
});
