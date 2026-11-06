import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface StorageUploadResult {
  storagePath: string;
  fileSize: number;
}

@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private readonly supabaseUrl: string;
  private readonly secretKey: string;
  private readonly bucketName: string;

  constructor(private readonly configService: ConfigService) {
    this.supabaseUrl = (
      this.configService.get<string>('SUPABASE_URL') ||
      process.env.SUPABASE_URL ||
      ''
    ).replace(/\/+$/, '');
    this.secretKey =
      this.configService.get<string>('SUPABASE_SECRET_KEY') ||
      process.env.SUPABASE_SECRET_KEY ||
      '';
    this.bucketName =
      this.configService.get<string>('SUPABASE_STORAGE_BUCKET') ||
      process.env.SUPABASE_STORAGE_BUCKET ||
      'card-pdf-archive';
  }

  private get authHeaders(): Record<string, string> {
    if (!this.secretKey) {
      throw new BadRequestException('Supabase secret key is not configured');
    }
    return {
      apikey: this.secretKey,
      Authorization: `Bearer ${this.secretKey}`,
    };
  }

  /**
   * Uploads a PDF file buffer to Supabase Storage with tenant isolation path.
   * Path format: tenantId/fileId.pdf
   */
  async uploadPdf(
    tenantId: string,
    fileId: string,
    buffer: Buffer,
    _fileName?: string,
  ): Promise<StorageUploadResult> {
    if (!this.secretKey) {
      throw new InternalServerErrorException('Supabase Storage secret key is not configured');
    }

    const cleanTenantId = tenantId.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const storagePath = `${cleanTenantId}/${fileId}.pdf`;
    const uploadUrl = `${this.supabaseUrl}/storage/v1/object/${encodeURIComponent(this.bucketName)}/${storagePath}`;

    try {
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          ...this.authHeaders,
          'Content-Type': 'application/pdf',
          'x-upsert': 'true',
        },
        body: buffer as any,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Supabase upload failed (${response.status}): ${errorText}`);
        throw new InternalServerErrorException(`Failed to upload PDF to storage: ${response.statusText}`);
      }

      this.logger.log(`Successfully uploaded PDF to Supabase Storage: ${storagePath} (${buffer.length} bytes)`);
      return {
        storagePath,
        fileSize: buffer.length,
      };
    } catch (error: any) {
      if (error instanceof InternalServerErrorException) throw error;
      this.logger.error(`Error connecting to Supabase Storage: ${error.message || error}`);
      throw new InternalServerErrorException('Storage service connection failure');
    }
  }

  /**
   * Generates a short-lived signed URL for secure viewing or downloading without public bucket access.
   */
  async createSignedUrl(storagePath: string, expiresInSeconds: number = 3600): Promise<string> {
    const signUrl = `${this.supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(this.bucketName)}/${storagePath}`;

    try {
      const response = await fetch(signUrl, {
        method: 'POST',
        headers: {
          ...this.authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Supabase signed URL creation failed (${response.status}): ${errorText}`);
        throw new InternalServerErrorException('Failed to generate signed access URL');
      }

      const data = (await response.json()) as { signedURL: string };
      const rawSignedUrl = data.signedURL;
      const fullSignedUrl = rawSignedUrl.startsWith('http')
        ? rawSignedUrl
        : `${this.supabaseUrl}/storage/v1${rawSignedUrl.startsWith('/') ? '' : '/'}${rawSignedUrl}`;

      return fullSignedUrl;
    } catch (error: any) {
      if (error instanceof InternalServerErrorException) throw error;
      this.logger.error(`Error generating signed URL: ${error.message || error}`);
      throw new InternalServerErrorException('Failed to create secure access URL');
    }
  }

  /**
   * Downloads raw PDF bytes from Supabase Storage.
   */
  async downloadPdf(storagePath: string): Promise<Buffer> {
    const downloadUrl = `${this.supabaseUrl}/storage/v1/object/authenticated/${encodeURIComponent(this.bucketName)}/${storagePath}`;

    try {
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: this.authHeaders,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Supabase download failed (${response.status}): ${errorText}`);
        throw new InternalServerErrorException('Failed to download PDF from storage');
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error: any) {
      if (error instanceof InternalServerErrorException) throw error;
      this.logger.error(`Error downloading file from storage: ${error.message || error}`);
      throw new InternalServerErrorException('Storage download failure');
    }
  }

  /**
   * Deletes a file from Supabase Storage.
   */
  async deleteFile(storagePath: string): Promise<boolean> {
    const deleteUrl = `${this.supabaseUrl}/storage/v1/object/${encodeURIComponent(this.bucketName)}/${storagePath}`;

    try {
      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: this.authHeaders,
      });

      if (!response.ok) {
        if (response.status === 404) {
          // File was already removed or does not exist in storage - treated as safe success
          this.logger.log(`Storage file ${storagePath} was already deleted (404)`);
          return true;
        }
        const errorText = await response.text();
        this.logger.warn(`Supabase delete returned status ${response.status}: ${errorText}`);
        return false;
      }

      this.logger.log(`Successfully deleted file from Supabase Storage: ${storagePath}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Error deleting file from storage: ${error.message || error}`);
      return false;
    }
  }
}
