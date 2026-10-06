import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import type { RequestUser } from '../../core/decorators/current-user.decorator';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string | null;
  role: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: Request) => {
          return request?.cookies?.['access_token'] ?? null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!user || user.deletedAt !== null) {
      throw new UnauthorizedException('User account no longer exists');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User account is suspended or inactive');
    }

    const permissions = user.role.rolePermissions.map((rp) => rp.permission.code);

    return {
      id: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role.name,
      permissions,
    };
  }
}
