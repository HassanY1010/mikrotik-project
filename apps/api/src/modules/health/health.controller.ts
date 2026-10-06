import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthCheckService, HealthCheck, type HealthCheckResult } from '@nestjs/terminus';
import { Public } from '../../core/decorators/public.decorator';
import { PrismaService } from '../../core/database/prisma.service';

@ApiTags('health')
@Controller({ path: 'health', version: ['1', VERSION_NEUTRAL] })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Overall system health check' })
  @ApiResponse({ status: 200, description: 'System is healthy' })
  @ApiResponse({ status: 503, description: 'System is degraded or unhealthy' })
  async check(): Promise<HealthCheckResult> {
    return this.health.check([
      async () => ({
        system: {
          status: 'up',
          uptime: Math.round(process.uptime()),
          timestamp: new Date().toISOString(),
          version: process.env.npm_package_version ?? '0.1.0',
        },
      }),
      async () => {
        try {
          await this.prisma.$queryRawUnsafe('SELECT 1');
          return {
            database: {
              status: 'up',
              type: 'PostgreSQL',
            },
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            database: {
              status: 'down',
              error: message,
            },
          };
        }
      },
    ]);
  }

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Kubernetes/Docker liveness probe' })
  @ApiResponse({ status: 200, description: 'Process is alive' })
  getLiveness(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Kubernetes/Docker readiness probe' })
  @ApiResponse({ status: 200, description: 'Service is ready to accept traffic' })
  async getReadiness(): Promise<{
    status: string;
    timestamp: string;
    services: Record<string, string>;
  }> {
    let dbStatus = 'ready';
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
    } catch {
      dbStatus = 'unreachable';
    }

    return {
      status: dbStatus === 'ready' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        api: 'ready',
        database: dbStatus,
      },
    };
  }
}
