import { RouterOsApiClient } from './routeros-api.client';
import { RouterOsRestClient } from './routeros-rest.client';

describe('MikroTik Backup Clients Audit Tests', () => {
  describe('RouterOsApiClient Backup Operations', () => {
    let client: RouterOsApiClient;

    beforeEach(() => {
      client = new RouterOsApiClient({
        host: '192.168.88.1',
        port: 8728,
        username: 'admin',
        password: 'password123',
      });
      // Mock internal socket connection
      (client as any).connected = true;
      (client as any).socket = { write: jest.fn() };
    });

    it('should send dont-encrypt=yes when password is not provided on RouterOS 7', async () => {
      const executedCommands: string[][] = [];
      (client as any).executeCommand = jest.fn(async (words: any) => {
        executedCommands.push(words);
        if (words[0] === '/file/print') {
          return [
            {
              type: '!re',
              attributes: {
                name: 'test_backup.backup',
                size: '204800',
                'creation-time': '2026-10-18 09:00:00',
                type: 'backup',
              },
            },
            { type: '!done', attributes: {} },
          ];
        }
        return [{ type: '!done', attributes: {} }];
      });

      const result = await client.createBackup('test_backup');

      expect(executedCommands[0]).toEqual([
        '/system/backup/save',
        '=name=test_backup',
        '=dont-encrypt=yes',
      ]);
      expect(result.filename).toBe('test_backup.backup');
      expect(result.size).toBe(204800);
    });

    it('should fallback to save without dont-encrypt if older RouterOS 6 rejects it', async () => {
      const executedCommands: string[][] = [];
      (client as any).executeCommand = jest.fn(async (words: any) => {
        executedCommands.push(words);
        if (words.includes('=dont-encrypt=yes')) {
          throw new Error('input does not match any value of dont-encrypt');
        }
        if (words[0] === '/file/print') {
          return [
            {
              type: '!re',
              attributes: {
                name: 'ros6_backup.backup',
                size: '150000',
                'creation-time': '2026-10-18 09:00:00',
              },
            },
            { type: '!done', attributes: {} },
          ];
        }
        return [{ type: '!done', attributes: {} }];
      });

      const result = await client.createBackup('ros6_backup');

      expect(executedCommands[0]).toEqual([
        '/system/backup/save',
        '=name=ros6_backup',
        '=dont-encrypt=yes',
      ]);
      expect(executedCommands[1]).toEqual(['/system/backup/save', '=name=ros6_backup']);
      expect(result.filename).toBe('ros6_backup.backup');
      expect(result.size).toBe(150000);
    });

    it('should pass password encryption parameter when password is supplied', async () => {
      const executedCommands: string[][] = [];
      (client as any).executeCommand = jest.fn(async (words: any) => {
        executedCommands.push(words);
        if (words[0] === '/file/print') {
          return [
            {
              type: '!re',
              attributes: {
                name: 'encrypted_backup.backup',
                size: '250000',
                'creation-time': '2026-10-18 09:15:00',
              },
            },
            { type: '!done', attributes: {} },
          ];
        }
        return [{ type: '!done', attributes: {} }];
      });

      const result = await client.createBackup('encrypted_backup', 'SecretP@ss2026');

      expect(executedCommands[0]).toEqual([
        '/system/backup/save',
        '=name=encrypted_backup',
        '=password=SecretP@ss2026',
      ]);
      expect(result.filename).toBe('encrypted_backup.backup');
    });

    it('should throw an error and refuse fake success if backup file is missing from router disk', async () => {
      (client as any).executeCommand = jest.fn(async (words: any) => {
        if (words[0] === '/file/print') {
          // File not found on disk (e.g. disk full or read-only flash)
          return [{ type: '!done', attributes: {} }];
        }
        return [{ type: '!done', attributes: {} }];
      });

      await expect(client.createBackup('missing_backup')).rejects.toThrow(
        /فشل التحقق من إنشاء ملف النسخة الاحتياطية/,
      );
    });

    it('should filter only .backup files when listBackups is called', async () => {
      (client as any).executeCommand = jest.fn(async () => [
        {
          type: '!re',
          attributes: { name: 'backup1.backup', size: '50000', type: 'backup', 'creation-time': '2026-10-18' },
        },
        {
          type: '!re',
          attributes: { name: 'hotspot/login.html', size: '1200', type: 'html' },
        },
        {
          type: '!re',
          attributes: { name: 'backup2.backup', size: '75000', type: 'backup', 'creation-time': '2026-10-17' },
        },
        { type: '!done', attributes: {} },
      ]);

      const backups = await client.listBackups();
      expect(backups).toHaveLength(2);
      expect(backups.map((b) => b.name)).toEqual(['backup1.backup', 'backup2.backup']);
    });
  });

  describe('RouterOsRestClient Backup Operations', () => {
    let restClient: RouterOsRestClient;

    beforeEach(() => {
      restClient = new RouterOsRestClient({
        host: '192.168.88.1',
        port: 443,
        username: 'admin',
        password: 'password123',
        useSsl: true,
      });
    });

    it('should post payload with dont-encrypt=yes when password is not provided on REST', async () => {
      const requests: { endpoint: string; options: any }[] = [];
      (restClient as any).request = jest.fn(async (endpoint: any, options: any) => {
        requests.push({ endpoint, options });
        if (endpoint === '/file') {
          return [
            {
              name: 'rest_backup.backup',
              size: '300000',
              'creation-time': '2026-10-18 09:20:00',
              type: 'backup',
            },
          ];
        }
        return {};
      });

      const result = await restClient.createBackup('rest_backup');

      expect(requests[0].endpoint).toBe('/system/backup/save');
      expect(JSON.parse(requests[0].options.body)).toEqual({
        name: 'rest_backup',
        'dont-encrypt': 'yes',
      });
      expect(result.filename).toBe('rest_backup.backup');
      expect(result.size).toBe(300000);
    });

    it('should post payload with password when encryption password is provided on REST', async () => {
      const requests: { endpoint: string; options: any }[] = [];
      (restClient as any).request = jest.fn(async (endpoint: any, options: any) => {
        requests.push({ endpoint, options });
        if (endpoint === '/file') {
          return [
            {
              name: 'enc_rest.backup',
              size: '320000',
              'creation-time': '2026-10-18 09:25:00',
              type: 'backup',
            },
          ];
        }
        return {};
      });

      const result = await restClient.createBackup('enc_rest', 'RestSecret999');

      expect(requests[0].endpoint).toBe('/system/backup/save');
      expect(JSON.parse(requests[0].options.body)).toEqual({
        name: 'enc_rest',
        password: 'RestSecret999',
      });
      expect(result.filename).toBe('enc_rest.backup');
    });

    it('should throw an error if file is not found on disk after REST backup save', async () => {
      (restClient as any).request = jest.fn(async (endpoint: any) => {
        if (endpoint === '/file') {
          return []; // Empty files list
        }
        return {};
      });

      await expect(restClient.createBackup('missing_rest')).rejects.toThrow(
        /فشل التحقق من إنشاء ملف النسخة الاحتياطية/,
      );
    });

    describe('downloadBackup Security & Integrity', () => {
      it('should reject cleartext HTTP download when host is a public IP', async () => {
        const publicClient = new RouterOsRestClient({
          host: '198.51.100.1', // Public IP
          port: 80,
          username: 'admin',
          password: 'secret',
          useSsl: false,
        });

        await expect(publicClient.downloadBackup('test.backup')).rejects.toThrow(
          /لا يُسمح بإرسال بيانات اعتماد الراوتر عبر بروتوكول HTTP غير مشفر/,
        );
      });

      it('should reject response if router returns an HTML error page', async () => {
        const originalFetch = global.fetch;
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'text/html' }),
          arrayBuffer: async () => Buffer.from('<!DOCTYPE html><html><body>Error 404</body></html>'),
        });

        try {
          await expect(restClient.downloadBackup('bad_page.backup')).rejects.toThrow(
            /استجاب الراوتر بنوع محتوى غير متوقع|Router returned an HTML error page/,
          );
        } finally {
          global.fetch = originalFetch;
        }
      });

      it('should reject response if buffer length does not match Content-Length header', async () => {
        const originalFetch = global.fetch;
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({
            'content-type': 'application/octet-stream',
            'content-length': '5000',
          }),
          arrayBuffer: async () => Buffer.from('partial_truncated_data'), // only 22 bytes
        });

        try {
          await expect(restClient.downloadBackup('truncated.backup')).rejects.toThrow(
            /لا يطابق Content-Length/,
          );
        } finally {
          global.fetch = originalFetch;
        }
      });

      it('should successfully download valid binary backup buffer', async () => {
        const validBinary = Buffer.from([0x88, 0xac, 0xa1, 0xb1, 0x00, 0x10, 0x00, 0x00]); // Mikrotik backup header
        const originalFetch = global.fetch;
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({
            'content-type': 'application/octet-stream',
            'content-length': validBinary.length.toString(),
          }),
          arrayBuffer: async () => validBinary,
        });

        try {
          const buffer = await restClient.downloadBackup('valid.backup');
          expect(buffer).toEqual(validBinary);
        } finally {
          global.fetch = originalFetch;
        }
      });
    });
  });
});
