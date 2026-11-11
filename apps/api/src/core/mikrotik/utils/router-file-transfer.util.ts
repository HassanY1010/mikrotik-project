/**
 * Shared hardened HTTP(S) file transfer helper for RouterOS binary (.backup)
 * and text (.rsc) exports, enforcing TLS outside loopback hosts.
 */
export async function downloadRouterFileOverHttp(params: {
  host: string;
  port: number;
  useSsl: boolean;
  username: string;
  password?: string;
  filename: string;
}): Promise<Buffer> {
  const safeFilename = params.filename
    .replace(/[^a-zA-Z0-9_.\-\/]/g, '')
    .replace(/\.{2,}/g, '')
    .replace(/^\/+/, '');

  const isLoopback =
    params.host === 'localhost' || params.host === '127.0.0.1' || params.host === '::1';

  if (!params.useSsl && !isLoopback) {
    throw new Error(
      `لا يُسمح بتنزيل الملفات عبر HTTP غير مشفر (${params.host}). يلزم تفعيل SSL.`,
    );
  }

  const protocol = params.useSsl ? 'https' : 'http';
  const baseHttpUrl = `${protocol}://${params.host}:${params.port}`;
  const encodedPath = safeFilename.split('/').map(encodeURIComponent).join('/');
  const authHeader =
    'Basic ' + Buffer.from(`${params.username}:${params.password ?? ''}`).toString('base64');

  let response = await fetch(`${baseHttpUrl}/${encodedPath}`, {
    headers: { Authorization: authHeader },
    signal: AbortSignal.timeout(15000),
  });

  if (response.status === 404 && !safeFilename.startsWith('flash/')) {
    const flashResponse = await fetch(`${baseHttpUrl}/flash/${encodedPath}`, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(15000),
    });
    if (flashResponse.ok) {
      response = flashResponse;
    }
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/html') || contentType.includes('application/json')) {
    throw new Error(`استجابة غير متوقعة (${contentType}) أثناء تنزيل ${safeFilename}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader) {
    const expectedLen = parseInt(contentLengthHeader, 10);
    if (!isNaN(expectedLen) && expectedLen > 0 && buffer.length !== expectedLen) {
      throw new Error(
        `حجم الملف المستلم (${buffer.length} بايت) لا يطابق Content-Length (${expectedLen}).`,
      );
    }
  }

  const headerSample = buffer.subarray(0, 64).toString('utf8').toLowerCase();
  if (headerSample.includes('<!doctype') || headerSample.includes('<html')) {
    throw new Error(`الملف المستلم (${safeFilename}) يحتوي على صفحة HTML بدلاً من ملف الراوتر.`);
  }

  return buffer;
}
