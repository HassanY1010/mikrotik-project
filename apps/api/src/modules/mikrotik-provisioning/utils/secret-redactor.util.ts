const SECRET_KEY_NAMES = new Set([
  'password',
  'secret',
  'passphrase',
  'wpa-pre-shared-key',
  'wpa2-pre-shared-key',
  'preshared-key',
  'pre-shared-key',
  'shared-secret',
  'radius-secret',
  'backuppassword',
  'backup-password',
  'apikey',
  'api-key',
  'privatekey',
  'private-key',
  'token',
  'accesstoken',
  'access-token',
  'refreshtoken',
  'refresh-token',
  'authorization',
]);

export function isSensitiveFieldName(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return false;
  if (SECRET_KEY_NAMES.has(normalized)) return true;

  // Match dotted/hyphenated keys such as "security.passphrase" or "wifi.password"
  const segments = normalized.split(/[._]/);
  const lastSegment = segments[segments.length - 1];
  if (SECRET_KEY_NAMES.has(lastSegment)) return true;

  return /(password|passphrase|pre-shared-key|preshared|secret|private[_-]?key|token)/i.test(
    lastSegment,
  );
}

/**
 * Masks entire RouterOS API execution word values (including values containing spaces)
 * before words are joined into human-readable preview strings.
 */
export function maskExecutionWords(words: string[]): string[] {
  return words.map((w) => {
    if (!w.startsWith('=')) return w;
    const secondEq = w.indexOf('=', 1);
    if (secondEq <= 1) return w;
    const key = w.substring(1, secondEq);
    if (isSensitiveFieldName(key)) {
      return `=${key}=********`;
    }
    return w;
  });
}

/**
 * Masks secrets embedded inside free-form command strings, JSON payloads, HTTP headers, or router errors.
 * Safely captures multi-word values with spaces up to the next CLI parameter (` =key=`).
 */
export function maskSecretsInText(raw?: string | null): string | null {
  if (!raw) return raw ?? null;

  let masked = raw;

  // 1. RouterOS CLI/API key=value pairs including multi-word passwords (stop before next ` =<key>=` or end)
  masked = masked.replace(
    /(^|\s)=([a-zA-Z0-9_.-]+)=("[^"]*"|'[^']*'|.+?)(?=\s+=[a-zA-Z0-9_.-]+=|$)/gi,
    (full, prefix: string, key: string) => {
      if (isSensitiveFieldName(key)) {
        return `${prefix}=${key}=********`;
      }
      return full;
    },
  );

  // 2. Quoted or JSON key:value pairs
  masked = masked.replace(
    /("?[a-zA-Z0-9_.-]*(?:password|secret|passphrase|pre-shared-key|token|apiKey)[a-zA-Z0-9_.-]*"?\s*:\s*)("[^"]*"|'[^']*'|[^,}\]]+)/gi,
    (_m, prefix: string) => `${prefix}"********"`,
  );

  // 3. Generic unprefixed key=value (outside RouterOS =key=) for known sensitive field names
  masked = masked.replace(
    /\b([a-zA-Z0-9_.-]*(?:password|secret|passphrase|pre-shared-key|token)[a-zA-Z0-9_.-]*)=("[^"]*"|'[^']*'|[^\s,&;]+)/gi,
    (_m, key: string) => `${key}=********`,
  );

  // 4. HTTP Basic / Bearer auth headers if echoed in HTTP errors
  masked = masked.replace(/(Authorization["']?\s*[:=]\s*["']?)(Basic|Bearer)\s+[A-Za-z0-9+/=._-]+/gi, '$1$2 ********');

  return masked;
}

/**
 * Deep-sanitizes config snapshots or error objects before persisting to DB or logs.
 */
export function sanitizeStructuredSecrets<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return (maskSecretsInText(value) ?? value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeStructuredSecrets(item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveFieldName(k)) {
        out[k] = v ? '********' : undefined;
      } else {
        out[k] = sanitizeStructuredSecrets(v);
      }
    }
    return out as T;
  }
  return value;
}
