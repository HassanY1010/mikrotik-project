import { z } from 'zod';

// =============================================================================
// Shared Validation Schemas — MikroTik SaaS Platform
// =============================================================================

// ---------- Common ----------

export const uuidSchema = z.string().uuid({ message: 'Must be a valid UUID' });

export const emailSchema = z
  .string()
  .email({ message: 'Must be a valid email address' })
  .toLowerCase()
  .trim();

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const idParamSchema = z.object({
  id: uuidSchema,
});

// ---------- Auth ----------

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  tenantName: z.string().min(2).max(200).trim().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const resetPasswordRequestSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// ---------- Tenant ----------

export const createTenantSchema = z.object({
  name: z.string().min(2).max(200).trim(),
  email: emailSchema,
  phone: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
  timezone: z.string().default('UTC'),
  currency: z.string().length(3).default('USD'),
  locale: z.string().default('en'),
});

export const updateTenantSchema = createTenantSchema.partial();

// ---------- User ----------

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  roleId: uuidSchema,
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).trim().optional(),
  lastName: z.string().min(1).max(100).trim().optional(),
  roleId: uuidSchema.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
});

// ---------- MikroTik Device ----------

export const mikrotikDeviceSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  address: z
    .string()
    .min(1)
    .max(500)
    .trim()
    .describe('IP address or hostname of the MikroTik router'),
  protocol: z.enum(['API', 'API_SSL', 'REST']),
  port: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .describe('RouterOS API port (default: 8728 for API, 8729 for API-SSL, 443/80 for REST)'),
  username: z.string().min(1).max(200).trim(),
  password: z.string().min(1).max(500),
  notes: z.string().max(1000).optional(),
});

export const updateMikrotikDeviceSchema = mikrotikDeviceSchema
  .omit({ password: true })
  .partial()
  .extend({
    password: z.string().min(1).max(500).optional(),
  });

// ---------- HotSpot Profile ----------

export const hotspotProfileSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(200)
    .trim()
    .regex(/^[a-zA-Z0-9_\-. ]+$/, 'Profile name contains invalid characters'),
  speedUpload: z
    .string()
    .regex(/^\d+[kKmMgG]$/, 'Speed must be in format: 1M, 512k, 2M, etc.')
    .describe('Upload speed limit e.g. 2M'),
  speedDownload: z
    .string()
    .regex(/^\d+[kKmMgG]$/, 'Speed must be in format: 1M, 512k, 2M, etc.')
    .describe('Download speed limit e.g. 2M'),
  sessionTimeout: z.string().optional().describe('Session duration e.g. 24h, 1d, 30m'),
  idleTimeout: z.string().optional(),
  dataLimit: z.coerce.number().min(0).optional().describe('Data limit in MB (0 = unlimited)'),
  price: z.coerce.number().min(0).multipleOf(0.01).describe('Selling price'),
  currency: z.string().length(3).default('USD'),
  deviceId: uuidSchema,
  description: z.string().max(500).optional(),
});

// ---------- Card Generation ----------

export const cardGenerationSchema = z.object({
  profileId: uuidSchema,
  deviceId: uuidSchema,
  quantity: z.coerce.number().int().min(1).max(5000),
  templateId: uuidSchema.optional(),
  notes: z.string().max(500).optional(),
});

// ---------- Sale ----------

export const createSaleSchema = z.object({
  cardIds: z
    .array(uuidSchema)
    .min(1, 'At least one card must be sold')
    .max(100, 'Cannot sell more than 100 cards in one transaction'),
  customerName: z.string().max(200).optional(),
  customerPhone: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
  discountAmount: z.coerce.number().min(0).default(0),
});

// ---------- Template ----------

export const templateFieldSchema = z.object({
  showLogo: z.boolean().default(true),
  showNetworkName: z.boolean().default(true),
  showUsername: z.boolean().default(true),
  showPassword: z.boolean().default(true),
  showQrCode: z.boolean().default(true),
  showPrice: z.boolean().default(true),
  showSpeed: z.boolean().default(true),
  showDuration: z.boolean().default(true),
  showDataLimit: z.boolean().default(true),
  showSerialNumber: z.boolean().default(true),
  customText: z.string().max(500).optional(),
  networkName: z.string().max(200).optional(),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  printerType: z.enum(['A4', 'THERMAL_58MM', 'THERMAL_80MM']),
  fields: templateFieldSchema,
  isDefault: z.boolean().default(false),
  logoUrl: z.string().url().optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color')
    .optional(),
});

// ---------- Subscription (Super Admin) ----------

export const activateSubscriptionSchema = z.object({
  tenantId: uuidSchema,
  planId: uuidSchema,
  billingPeriod: z.enum(['MONTHLY', 'YEARLY']),
  startsAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
  notes: z.string().max(500).optional(),
});

// ---------- Type exports (inferred from schemas) ----------

export type LoginDto = z.infer<typeof loginSchema>;
export type RegisterDto = z.infer<typeof registerSchema>;
export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
export type ResetPasswordRequestDto = z.infer<typeof resetPasswordRequestSchema>;
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
export type CreateTenantDto = z.infer<typeof createTenantSchema>;
export type UpdateTenantDto = z.infer<typeof updateTenantSchema>;
export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
export type MikroTikDeviceDto = z.infer<typeof mikrotikDeviceSchema>;
export type UpdateMikroTikDeviceDto = z.infer<typeof updateMikrotikDeviceSchema>;
export type HotspotProfileDto = z.infer<typeof hotspotProfileSchema>;
export type CardGenerationDto = z.infer<typeof cardGenerationSchema>;
export type CreateSaleDto = z.infer<typeof createSaleSchema>;
export type CreateTemplateDto = z.infer<typeof createTemplateSchema>;
export type PaginationDto = z.infer<typeof paginationSchema>;
export type ActivateSubscriptionDto = z.infer<typeof activateSubscriptionSchema>;
