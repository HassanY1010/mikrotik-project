import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { HashingService } from '../../core/security/hashing.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashingService: HashingService,
  ) {}

  async findAll(tenantId: string): Promise<Record<string, unknown>[]> {
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users;
  }

  async findById(tenantId: string, id: string): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async create(tenantId: string, dto: CreateUserDto): Promise<Record<string, unknown>> {
    const email = dto.email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    // Role cannot be SUPER_ADMIN
    if (dto.roleName.toUpperCase() === 'SUPER_ADMIN') {
      throw new ForbiddenException('Cannot assign SUPER_ADMIN role');
    }

    // Find role in system or tenant
    const role = await this.prisma.role.findFirst({
      where: {
        name: dto.roleName.toUpperCase(),
        OR: [{ tenantId }, { isSystem: true, tenantId: null }],
      },
    });

    if (!role) {
      throw new NotFoundException(`Role '${dto.roleName}' not found`);
    }

    const passwordHash = await this.hashingService.hashPassword(dto.password);

    const newUser = await this.prisma.user.create({
      data: {
        tenantId,
        email,
        fullName: dto.fullName.trim(),
        passwordHash,
        phone: dto.phone,
        roleId: role.id,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        createdAt: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return newUser;
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    let roleId = user.roleId;

    if (dto.roleName) {
      if (dto.roleName.toUpperCase() === 'SUPER_ADMIN') {
        throw new ForbiddenException('Cannot assign SUPER_ADMIN role');
      }

      const role = await this.prisma.role.findFirst({
        where: {
          name: dto.roleName.toUpperCase(),
          OR: [{ tenantId }, { isSystem: true, tenantId: null }],
        },
      });

      if (!role) {
        throw new NotFoundException(`Role '${dto.roleName}' not found`);
      }
      roleId = role.id;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName?.trim(),
        phone: dto.phone,
        roleId,
        status: dto.status,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        updatedAt: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return updated;
  }

  async delete(tenantId: string, id: string): Promise<{ success: boolean }> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Soft delete
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // Revoke all active sessions
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }
}
