import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ProvisioningBackupStorageService {
  private readonly logger = new Logger(ProvisioningBackupStorageService.name);
  private readonly supabaseUrl: string;
  private readonly secretKey: string;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    this.supabaseUrl = (
      this.configService.get<string>('SUPABASE_URL') ||
      'https://mtstlpvqjxfzsrkzuvhq.supabase.co'
    ).replace(/\/+$/, '');
    this.secretKey = this.configService.get<string>('SUPABASE_SECRET_KEY') || '';
    this.bucket =
      this.configService.get<string>('SUPABASE_BACKUP_BUCKET') || 'router-backups';
  }

  getBucketName(): string {
    return this.bucket;
  }

  isConfigured(): boolean {
    return this.secretKey.trim().length > 0;
  }

  async uploadPrivateObject(params: {
    tenantId: string;
    deviceId: string;
    backupId: string;
    fileName: string;
    content: Buffer;
    contentType: string;
  }): Promise<{ uploaded: boolean; bucket: string; storagePath: string; error?: string }> {
    const cleanTenant = params.tenantId.replace(/[^a-zA-Z0-9_-]/g, '');
    const cleanDevice = params.deviceId.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeName = params.fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const storagePath = `${cleanTenant}/${cleanDevice}/${params.backupId}_${safeName}`;

    if (!this.isConfigured()) {
      return {
        uploaded: false,
        bucket: this.bucket,
        storagePath,
        error: 'SUPABASE_SECRET_KEY غير مضبوط؛ تم حفظ النسخة على ذاكرة الراوتر والقاعدة محلياً فقط.',
      };
    }

    const endpoint = `${this.supabaseUrl}/storage/v1/object/${this.bucket}/${storagePath}`;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          apikey: this.secretKey,
          'Content-Type': params.contentType,
          'x-upsert': 'true',
        },
        body: new Uint8Array(params.content),
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        const errBody = await response.text();
        this.logger.warn(`Private backup storage upload failed (${response.status}): ${errBody}`);
        return {
          uploaded: false,
          bucket: this.bucket,
          storagePath,
          error: `HTTP ${response.status} أثناء الرفع إلى ${this.bucket}`,
        };
      }

      return { uploaded: true, bucket: this.bucket, storagePath };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Private backup upload error: ${msg}`);
      return { uploaded: false, bucket: this.bucket, storagePath, error: msg };
    }
  }

  async downloadPrivateObject(storagePath: string): Promise<Buffer | null> {
    if (!this.isConfigured() || !storagePath) return null;
    const endpoint = `${this.supabaseUrl}/storage/v1/object/authenticated/${this.bucket}/${storagePath}`;
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          apikey: this.secretKey,
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    } catch {
      return null;
    }
  }

  async createSignedDownloadUrl(storagePath: string, expiresInSeconds = 300): Promise<string | undefined> {
    if (!this.isConfigured() || !storagePath) return undefined;
    const endpoint = `${this.supabaseUrl}/storage/v1/object/sign/${this.bucket}/${storagePath}`;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          apikey: this.secretKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return undefined;
      const data = (await response.json()) as { signedURL?: string };
      return data.signedURL ? `${this.supabaseUrl}/storage/v1${data.signedURL}` : undefined;
    } catch {
      return undefined;
    }
  }
}
