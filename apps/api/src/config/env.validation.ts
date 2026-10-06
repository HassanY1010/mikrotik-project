import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().optional(),
  APP_PORT: z.coerce.number().default(3000),
  APP_NAME: z.string().default('MikroTik SaaS API'),
  APP_VERSION: z.string().default('1.0.0'),
  APP_URL: z.string().url().default('https://mikrotik-api-yn0e.onrender.com'),
  FRONTEND_URL: z.string().url().default('https://mikrotik-admin.onrender.com'),
  REQUEST_ID_HEADER: z.string().default('X-Request-Id'),

  // Database
  DATABASE_URL: z
    .string()
    .default(
      'postgresql://postgres.mtstlpvqjxfzsrkzuvhq:hhaall112233hhaa@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require',
    ),
  DATABASE_HOST: z.string().default('aws-0-ap-northeast-2.pooler.supabase.com'),
  DATABASE_PORT: z.coerce.number().default(5432),
  DATABASE_NAME: z.string().default('postgres'),
  DATABASE_USER: z.string().default('postgres.mtstlpvqjxfzsrkzuvhq'),
  DATABASE_PASSWORD: z.string().default('hhaall112233hhaa'),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(10),

  // Redis
  REDIS_URL: z
    .string()
    .default(
      'rediss://default:gQAAAAAAAxYyAAIgcDIxZGVlODk0Yzg2NmE0NzNlYTEzZWE1Y2E0NmNjNDBiYQ@blessed-thrush-202290.upstash.io:6379',
    ),
  REDIS_HOST: z.string().default('blessed-thrush-202290.upstash.io'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z
    .string()
    .default('gQAAAAAAAxYyAAIgcDIxZGVlODk0Yzg2NmE0NzNlYTEzZWE1Y2E0NmNjNDBiYQ'),
  REDIS_DB: z.coerce.number().default(0),

  // JWT
  JWT_ACCESS_SECRET: z
    .string()
    .min(16)
    .default('development_jwt_access_secret_key_minimum_32_characters_long_12345'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16)
    .default('development_jwt_refresh_secret_key_minimum_32_characters_long_67890'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Encryption (AES-256-GCM)
  ENCRYPTION_KEY: z
    .string()
    .default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),

  // Argon2
  ARGON2_MEMORY_COST: z.coerce.number().default(65536),
  ARGON2_TIME_COST: z.coerce.number().default(3),
  ARGON2_PARALLELISM: z.coerce.number().default(4),

  // Rate Limiting
  RATE_LIMIT_AUTH_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().default(10),
  RATE_LIMIT_GLOBAL_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().default(300),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('pretty'),

  // Swagger
  SWAGGER_ENABLED: z.preprocess(
    (val) => (typeof val === 'string' ? val === 'true' : val),
    z.boolean().default(true),
  ),
  SWAGGER_PATH: z.string().default('docs'),

  // CORS
  CORS_ORIGINS: z
    .string()
    .default('https://mikrotik-admin.onrender.com,http://localhost:5173,*'),
  CORS_CREDENTIALS: z.preprocess(
    (val) => (typeof val === 'string' ? val === 'true' : val),
    z.boolean().default(true),
  ),

  // Session / Cookie
  COOKIE_SECRET: z
    .string()
    .min(16)
    .default('development_cookie_secret_key_minimum_32_characters_long_abcde'),
  COOKIE_SECURE: z.preprocess(
    (val) => (typeof val === 'string' ? val === 'true' : val),
    z.boolean().default(false),
  ),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateConfig(config: Record<string, unknown>): Record<string, unknown> {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const formatted = result.error.format();
    throw new Error(
      `❌ Environment variable validation error:\n${JSON.stringify(formatted, null, 2)}`,
    );
  }

  return result.data;
}
