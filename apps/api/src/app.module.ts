import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { HealthModule } from './modules/health/health.module';
import { DatabaseModule } from './core/database/database.module';
import { SecurityModule } from './core/security/security.module';
import { MultiTenancyModule } from './core/multi-tenancy/multi-tenancy.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { MikrotikModule } from './core/mikrotik/mikrotik.module';
import { DevicesModule } from './modules/devices/devices.module';
import { HotspotModule } from './modules/hotspot/hotspot.module';
import { CardsModule } from './modules/cards/cards.module';
import { CardTemplatesModule } from './modules/card-templates/card-templates.module';
import { SalesModule } from './modules/sales/sales.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SyncModule } from './modules/sync/sync.module';
import { JwtAuthGuard } from './core/guards/jwt-auth.guard';
import { HttpExceptionFilter } from './core/filters/http-exception.filter';
import { AllExceptionsFilter } from './core/filters/all-exceptions.filter';
import { TransformInterceptor } from './core/interceptors/transform.interceptor';
import { RequestIdInterceptor } from './core/interceptors/request-id.interceptor';
import { LoggingInterceptor } from './core/interceptors/logging.interceptor';
import { validateConfig } from './config/env.validation';
import { AppController } from './app.controller';

@Module({
  imports: [
    // ---- Configuration ----
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateConfig,
      cache: true,
      expandVariables: true,
    }),

    // ---- Structured Logging (Pino) ----
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const nodeEnv = config.get<string>('NODE_ENV', 'development');
        const logLevel = config.get<string>('LOG_LEVEL', 'info');
        const logFormat = config.get<string>('LOG_FORMAT', 'pretty');

        return {
          pinoHttp: {
            level: logLevel,
            transport:
              nodeEnv !== 'production' || logFormat === 'pretty'
                ? { target: 'pino-pretty', options: { colorize: true, singleLine: false } }
                : undefined,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.password',
                'req.body.currentPassword',
                'req.body.newPassword',
                'req.body.refreshToken',
              ],
              censor: '[REDACTED]',
            },
            serializers: {
              req: (req: { method: string; url: string; id: string }) => ({
                method: req.method,
                url: req.url,
                id: req.id,
              }),
              res: (res: { statusCode: number }) => ({
                statusCode: res.statusCode,
              }),
            },
          },
        };
      },
    }),

    // ---- Rate Limiting ----
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'global',
            ttl: config.get<number>('RATE_LIMIT_GLOBAL_WINDOW_MS', 60000),
            limit: config.get<number>('RATE_LIMIT_GLOBAL_MAX', 300),
          },
        ],
      }),
    }),

    // ---- Feature & Core Modules ----
    DatabaseModule,
    SecurityModule,
    MultiTenancyModule,
    HealthModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    MikrotikModule,
    DevicesModule,
    HotspotModule,
    CardsModule,
    CardTemplatesModule,
    SalesModule,
    AuditLogsModule,
    AnalyticsModule,
    ReportsModule,
    SyncModule,
  ],
  controllers: [AppController],
  providers: [
    // ---- Global Guards ----
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },

    // ---- Global Filters (order matters: AllExceptions catches what Http misses) ----
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },

    // ---- Global Interceptors ----
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestIdInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
