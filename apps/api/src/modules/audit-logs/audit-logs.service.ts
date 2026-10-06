import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { Prisma } from '@prisma/client';

export interface CreateAuditLogParams {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValues?: Prisma.InputJsonValue;
  newValues?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditLogItemResponse {
  id: string;
  tenantId: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  oldValues: Prisma.JsonValue;
  newValues: Prisma.JsonValue;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persists an audit log entry safely.
   */
  async log(params: CreateAuditLogParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: params.tenantId ?? null,
          userId: params.userId ?? null,
          action: params.action,
          entity: params.entity,
          entityId: params.entityId ?? null,
          oldValues: params.oldValues ?? undefined,
          newValues: params.newValues ?? undefined,
          ipAddress: params.ipAddress ?? null,
          userAgent: params.userAgent ?? null,
        },
      });
    } catch (err) {
      // Never allow an audit logging failure to interrupt a user request
      this.logger.error(`Failed to record audit log: ${err}`);
    }
  }

  async findAll(
    tenantId: string,
    query: AuditLogQueryDto,
  ): Promise<{ data: AuditLogItemResponse[]; total: number; page: number; limit: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = { tenantId };

    if (query.action) where.action = { contains: query.action, mode: 'insensitive' };
    if (query.entity) where.entity = { contains: query.entity, mode: 'insensitive' };
    if (query.userId) where.userId = query.userId;

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { fullName: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const data: AuditLogItemResponse[] = logs.map((l) => ({
      id: l.id,
      tenantId: l.tenantId,
      userId: l.userId,
      userName: l.user ? l.user.fullName : null,
      userEmail: l.user ? l.user.email : null,
      action: l.action,
      entity: l.entity,
      entityId: l.entityId,
      oldValues: l.oldValues,
      newValues: l.newValues,
      ipAddress: l.ipAddress,
      userAgent: l.userAgent,
      createdAt: l.createdAt,
    }));

    return { data, total, page, limit };
  }

  async exportCsv(tenantId: string, query: AuditLogQueryDto): Promise<string> {
    const { data } = await this.findAll(tenantId, { ...query, limit: 1000 });

    const headers = [
      'التاريخ والوقت',
      'الإجراء',
      'الكيان',
      'معرف الكيان',
      'المستخدم',
      'البريد الإلكتروني',
      'عنوان IP',
    ];

    const rows = data.map((d) => [
      `"${d.createdAt.toISOString()}"`,
      `"${d.action}"`,
      `"${d.entity}"`,
      `"${d.entityId ?? ''}"`,
      `"${d.userName ?? 'System'}"`,
      `"${d.userEmail ?? ''}"`,
      `"${d.ipAddress ?? ''}"`,
    ]);

    // Prepend UTF-8 BOM (\uFEFF) so Excel opens Arabic correctly
    return '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}
