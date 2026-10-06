import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Disable default logger — replaced by Pino
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const port =
    Number(process.env.PORT) ||
    configService.get<number>('PORT') ||
    configService.get<number>('APP_PORT', 3000);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const corsOriginsConfig = configService.get<string>(
    'CORS_ORIGINS',
    'http://localhost:5173,http://localhost:3000',
  );
  const corsOrigins = corsOriginsConfig === '*'
    ? true
    : corsOriginsConfig.split(',').map((o) => o.trim());

  // ---- Logger ----
  app.useLogger(app.get(Logger));

  // ---- Security headers ----
  app.use(
    helmet({
      contentSecurityPolicy: nodeEnv === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // ---- Cookie parser ----
  const cookieSecret = configService.getOrThrow<string>('COOKIE_SECRET');
  app.use(cookieParser(cookieSecret));

  // ---- CORS ----
  app.enableCors({
    origin: corsOrigins,
    credentials: configService.get<boolean>('CORS_CREDENTIALS', true),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Tenant-Id'],
    exposedHeaders: ['X-Request-Id', 'X-Total-Count'],
  });

  // ---- API versioning ----
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'api/v',
  });

  // ---- Global prefix ----
  // Note: versioning uses URI prefix, so no additional global prefix needed
  // Health endpoints are at /health (outside versioning)

  // ---- Global pipes ----
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown properties
      forbidNonWhitelisted: true, // Throw on unknown properties
      transform: true, // Transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: false, // Explicit transforms only
      },
      stopAtFirstError: false, // Collect all errors
    }),
  );

  // Global filters and interceptors are registered via APP_FILTER and APP_INTERCEPTOR
  // tokens in AppModule providers to ensure full dependency injection support.

  // ---- Swagger / OpenAPI ----
  const swaggerEnabled = configService.get<boolean>('SWAGGER_ENABLED', true);
  if (swaggerEnabled || nodeEnv !== 'production') {
    const swaggerPath = configService.get<string>('SWAGGER_PATH', 'docs');
    const swaggerConfig = new DocumentBuilder()
      .setTitle('MikroTik SaaS API')
      .setDescription(
        'Multi-tenant SaaS platform for managing MikroTik HotSpot networks, ' +
          'prepaid cards, sales, printing, and analytics.',
      )
      .setVersion('1.0')
      .setContact('MikroTik SaaS', '', 'support@mikrotik-saas.local')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your access token',
        },
        'access-token',
      )
      .addTag('auth', 'Authentication and session management')
      .addTag('health', 'Health check endpoints')
      .addTag('tenants', 'Tenant management (Super Admin)')
      .addTag('users', 'User management')
      .addTag('subscriptions', 'Subscription and plan management')
      .addTag('devices', 'MikroTik device management')
      .addTag('hotspot', 'HotSpot profiles and users')
      .addTag('cards', 'Card management and lifecycle')
      .addTag('card-generation', 'Bulk card generation jobs')
      .addTag('sales', 'Sales transactions')
      .addTag('printing', 'Print jobs and printer management')
      .addTag('templates', 'Card template management')
      .addTag('reports', 'Reports and analytics')
      .addTag('audit', 'Audit logs')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(swaggerPath, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });
  }

  // ---- Graceful shutdown ----
  app.enableShutdownHooks();

  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`🚀 API is running on: http://localhost:${port}`);
  logger.log(`📄 Swagger docs: http://localhost:${port}/docs`);
  logger.log(`🏥 Health check: http://localhost:${port}/health`);
  logger.log(`🌍 Environment: ${nodeEnv}`);
}

void bootstrap();
