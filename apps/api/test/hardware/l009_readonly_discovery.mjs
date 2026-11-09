/**
 * Standalone Read-Only Discovery Script for MikroTik L009UiGS (RouterOS v7 REST API)
 *
 * STRICT SAFETY & AUDIT ASSURANCES:
 * 1. MANDATORY HTTPS: Plaintext HTTP is completely prohibited; port 80 is rejected.
 * 2. STRICT CONFIG VALIDATION: Port (1-65535 integer), Timeout (positive integer <=60s), Host (IPv4/IPv6/FQDN).
 * 3. NO DEFAULT CREDENTIALS: Fails immediately if credentials or host are missing.
 * 4. METHOD & PATH WHITELIST: Only GET on strictly approved paths is allowed.
 * 5. NO REDIRECTS: All 3xx HTTP redirects are blocked immediately and socket is safely drained.
 * 6. STRICT TLS: rejectUnauthorized is enforced; fails if specified CA is missing/unreadable.
 * 7. DEEP STRUCTURAL VALIDATION: Checks types, non-null items, and mandatory fields per endpoint.
 * 8. MAX RESPONSE SIZE LIMIT: Aborts transfer if payload exceeds 2MB per endpoint.
 * 9. LOCALE-INDEPENDENT CANONICAL HASHING: Uses UTF-16 binary code point comparison matching Dart a.compareTo(b).
 * 10. CONDITIONAL HASHING: snapshotHash is strictly NULL if snapshot is incomplete; diagnosticHash provided for debug only.
 * 11. SENSITIVE REDACTION: Serial numbers and credentials are never logged or exposed.
 */

import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// 2MB maximum per endpoint response
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

// Explicit, Immutable Whitelist of Permitted Endpoints
export const ENDPOINT_WHITELIST = Object.freeze([
  { key: 'resource', path: '/rest/system/resource', critical: true, expectedType: 'object_or_single_array' },
  { key: 'routerboard', path: '/rest/system/routerboard', critical: false, expectedType: 'object_or_single_array' },
  { key: 'interfaces', path: '/rest/interface', critical: true, expectedType: 'array' },
  { key: 'ethernet', path: '/rest/interface/ethernet', critical: false, expectedType: 'array' },
  { key: 'bridges', path: '/rest/interface/bridge', critical: true, expectedType: 'array' },
  { key: 'bridgePorts', path: '/rest/interface/bridge/port', critical: true, expectedType: 'array' },
  { key: 'ipAddresses', path: '/rest/ip/address', critical: true, expectedType: 'array' },
  { key: 'routes', path: '/rest/ip/route', critical: true, expectedType: 'array' },
  { key: 'pools', path: '/rest/ip/pool', critical: true, expectedType: 'array' },
  { key: 'dhcpServers', path: '/rest/ip/dhcp-server', critical: true, expectedType: 'array' },
  { key: 'hotspots', path: '/rest/ip/hotspot', critical: true, expectedType: 'array' },
]);

export const ALLOWED_PATHS = new Set(ENDPOINT_WHITELIST.map((e) => e.path));

// Arrays representing unordered sets that can safely be sorted
export const SORTABLE_ARRAY_KEYS = new Set([
  'interfaces',
  'ethernet',
  'bridges',
  'bridgePorts',
  'ipAddresses',
  'pools',
  'dhcpServers',
  'hotspots',
]);

/**
 * Strict Hostname / IP address validation
 */
export function isValidHost(host) {
  if (!host || typeof host !== 'string') return false;
  const trimmed = host.trim();
  if (trimmed.length === 0 || trimmed.length > 253) return false;
  if (/\s/.test(trimmed)) return false;

  // IPv4 validation
  const ipv4Match = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = [Number(ipv4Match[1]), Number(ipv4Match[2]), Number(ipv4Match[3]), Number(ipv4Match[4])];
    return octets.every((o) => o >= 0 && o <= 255);
  }

  // IPv6 validation (basic bracketed or unbracketed hex/colon)
  const cleanIpv6 = trimmed.replace(/^\[|\]$/g, '');
  if (/^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(cleanIpv6)) {
    return true;
  }

  // Hostname / FQDN validation (RFC 1123)
  const fqdnPattern = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
  return fqdnPattern.test(trimmed);
}

/**
 * Validate and sanitize configuration
 */
export function validateAndLoadConfig(customEnv = {}) {
  const env = { ...process.env, ...customEnv };

  // 1. Mandatory HTTPS enforcement
  const useSslEnv = env.ROUTER_USE_SSL;
  if (useSslEnv === 'false' || useSslEnv === '0') {
    throw new Error('SECURITY VIOLATION: HTTPS is mandatory. Transmission over plaintext HTTP is strictly prohibited.');
  }

  // Port validation: strictly positive integer 1-65535, reject 80
  const portStr = String(env.ROUTER_PORT || '443').trim();
  if (!/^\d+$/.test(portStr)) {
    throw new Error(`CONFIGURATION ERROR: ROUTER_PORT must be an integer between 1 and 65535. Received "${portStr}".`);
  }
  const port = parseInt(portStr, 10);
  if (port < 1 || port > 65535) {
    throw new Error(`CONFIGURATION ERROR: ROUTER_PORT out of range (1-65535). Received ${port}.`);
  }
  if (port === 80) {
    throw new Error('SECURITY VIOLATION: Port 80 (HTTP) is prohibited. Connection must use HTTPS.');
  }

  // Timeout validation: strictly positive integer 1-60000 ms
  const timeoutStr = String(env.ROUTER_TIMEOUT_MS || '5000').trim();
  if (!/^\d+$/.test(timeoutStr)) {
    throw new Error(`CONFIGURATION ERROR: ROUTER_TIMEOUT_MS must be a positive integer. Received "${timeoutStr}".`);
  }
  const timeoutMs = parseInt(timeoutStr, 10);
  if (timeoutMs <= 0 || timeoutMs > 60000) {
    throw new Error(`CONFIGURATION ERROR: ROUTER_TIMEOUT_MS must be between 1 and 60000 ms. Received ${timeoutMs}.`);
  }

  // Host validation
  const host = env.ROUTER_HOST ? env.ROUTER_HOST.trim() : '';
  if (!host) {
    throw new Error('CONFIGURATION ERROR: Missing mandatory ROUTER_HOST. You must specify the target router address.');
  }
  if (!isValidHost(host)) {
    throw new Error(`CONFIGURATION ERROR: Invalid ROUTER_HOST "${host}". Must be a valid IPv4, IPv6, or FQDN.`);
  }

  // Username validation
  const username = env.ROUTER_USER ? env.ROUTER_USER.trim() : '';
  if (!username) {
    throw new Error('CONFIGURATION ERROR: Missing mandatory ROUTER_USER. Default credentials have been disabled.');
  }

  // Password validation
  const password = env.ROUTER_PASSWORD !== undefined ? env.ROUTER_PASSWORD : '';
  if (!password || password.trim().length === 0) {
    throw new Error('CONFIGURATION ERROR: Missing mandatory ROUTER_PASSWORD. Password cannot be empty.');
  }

  // CA Certificate validation
  let caCertContent = null;
  const caCertPath = env.ROUTER_CA_CERT_PATH ? env.ROUTER_CA_CERT_PATH.trim() : '';
  if (caCertPath) {
    if (!fs.existsSync(caCertPath)) {
      throw new Error(`TLS CONFIGURATION ERROR: Specified ROUTER_CA_CERT_PATH does not exist: "${caCertPath}"`);
    }
    try {
      caCertContent = fs.readFileSync(caCertPath);
    } catch (err) {
      throw new Error(`TLS CONFIGURATION ERROR: Failed to read ROUTER_CA_CERT_PATH ("${caCertPath}"): ${err.message}`);
    }
  }

  return {
    host,
    port,
    username,
    password,
    timeoutMs,
    caCertContent,
    caCertPath,
  };
}

/**
 * Hard Assert: Method must be GET and path must belong to the approved whitelist.
 */
export function assertPermittedReadOnlyRequest(method, path) {
  if (!method || method.toUpperCase() !== 'GET') {
    throw new Error(`CRITICAL SECURITY VIOLATION: Method "${method}" is prohibited. Only GET is permitted.`);
  }
  if (!ALLOWED_PATHS.has(path)) {
    throw new Error(`CRITICAL SECURITY VIOLATION: Path "${path}" is not in the approved read-only whitelist.`);
  }
}

/**
 * Deep Structural Validation: Verifies that array items are non-null objects and carry essential fields.
 */
export function validateEndpointStructure(key, expectedType, data) {
  if (data === null || data === undefined) {
    return { valid: false, error: `Response payload is null/empty for "${key}".` };
  }

  if (expectedType === 'array') {
    if (!Array.isArray(data)) {
      return { valid: false, error: `Expected array for "${key}", received ${typeof data}.` };
    }

    // Verify all items in array are non-null objects
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        return { valid: false, error: `Array item at index ${i} for "${key}" is not a valid object.` };
      }

      // Check essential fields per endpoint
      if (key === 'interfaces' && (!item.name || typeof item.name !== 'string')) {
        return { valid: false, error: `Interface item at index ${i} missing valid "name" string.` };
      }
      if (key === 'bridges' && (!item.name || typeof item.name !== 'string')) {
        return { valid: false, error: `Bridge item at index ${i} missing valid "name" string.` };
      }
      if (key === 'bridgePorts' && (!item.interface || !item.bridge)) {
        return { valid: false, error: `Bridge port at index ${i} missing "interface" or "bridge".` };
      }
      if (key === 'ipAddresses' && (!item.address || typeof item.address !== 'string')) {
        return { valid: false, error: `IP address item at index ${i} missing valid "address" string.` };
      }
      if (key === 'pools' && (!item.name || !item.ranges)) {
        return { valid: false, error: `IP pool item at index ${i} missing "name" or "ranges".` };
      }
      if (key === 'dhcpServers' && (!item.name || !item.interface)) {
        return { valid: false, error: `DHCP server item at index ${i} missing "name" or "interface".` };
      }
      if (key === 'routes' && (!item['dst-address'] && !item.gateway)) {
        return { valid: false, error: `Route item at index ${i} missing "dst-address" or "gateway".` };
      }
    }
    return { valid: true };
  }

  if (expectedType === 'object_or_single_array') {
    let target = data;
    if (Array.isArray(data)) {
      if (data.length === 0) {
        return { valid: false, error: `Expected non-empty resource array for "${key}".` };
      }
      target = data[0];
    }
    if (typeof target !== 'object' || target === null || Array.isArray(target)) {
      return { valid: false, error: `Expected object representation for "${key}".` };
    }
    if (key === 'resource') {
      if (!target.version || typeof target.version !== 'string') {
        return { valid: false, error: `Resource object missing valid "version" string.` };
      }
      if (!target['architecture-name'] || typeof target['architecture-name'] !== 'string') {
        return { valid: false, error: `Resource object missing valid "architecture-name" string.` };
      }
    }
    return { valid: true };
  }

  return { valid: true };
}

/**
 * Binary UTF-16 Code-Unit Lexicographical Comparison (Deterministic & Locale-Independent)
 * Exactly matches Dart's String.compareTo(b) and standard binary code-unit ordering.
 */
export function binaryCompare(a, b) {
  const strA = String(a ?? '');
  const strB = String(b ?? '');
  return strA < strB ? -1 : strA > strB ? 1 : 0;
}

/**
 * Redact sensitive fields (Serial numbers, Passwords, Keys)
 */
export function redactSensitiveData(key, value) {
  if (typeof value === 'string') {
    if (key.toLowerCase().includes('serial') || key === 'serial-number') {
      return value.length > 4 ? value.slice(0, 2) + '******' + value.slice(-2) : '******';
    }
    if (/password|secret|key|token|auth/i.test(key)) {
      return '******';
    }
  }
  return value;
}

/**
 * Deterministic JSON Canonicalization for Hashing
 * 1. Dictionaries: sorted lexicographically by UTF-16 code units (binaryCompare).
 * 2. Unordered entity arrays: sorted deterministically with composite key and total ordering tie-breaker.
 * 3. Sequence-sensitive arrays: preserved in native order.
 * 4. Volatile fields: stripped before computing hash.
 */
export function canonicalizeJson(obj, parentKey = null) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    // Only sort arrays that represent unordered entity sets
    const shouldSort = parentKey === null || SORTABLE_ARRAY_KEYS.has(parentKey);

    let itemsToSerialize = obj;
    if (shouldSort) {
      itemsToSerialize = [...obj].sort((a, b) => {
        const getStableKey = (item) => {
          if (!item || typeof item !== 'object') return String(item);
          return String(item.name || item.address || item['.id'] || item['mac-address'] || '');
        };
        const keyA = getStableKey(a);
        const keyB = getStableKey(b);
        const primaryCmp = binaryCompare(keyA, keyB);
        if (primaryCmp !== 0) {
          return primaryCmp;
        }
        // Total ordering tie-breaker: compare full canonical JSON strings using binaryCompare
        return binaryCompare(canonicalizeJson(a), canonicalizeJson(b));
      });
    }

    return '[' + itemsToSerialize.map((item) => canonicalizeJson(item, parentKey)).join(',') + ']';
  }

  const sortedKeys = Object.keys(obj).sort(binaryCompare);

  // Volatile / non-deterministic runtime counters
  const volatileKeys = new Set([
    'uptime',
    'free-memory',
    'cpu-load',
    'rx-byte',
    'tx-byte',
    'free-hdd-space',
    'write-sect-total',
    'write-sect-since-reboot',
  ]);

  const pairs = [];
  for (const key of sortedKeys) {
    if (!volatileKeys.has(key)) {
      pairs.push(JSON.stringify(key) + ':' + canonicalizeJson(obj[key], key));
    }
  }
  return '{' + pairs.join(',') + '}';
}

/**
 * Perform a strictly Read-Only HTTPS GET request
 */
export async function fetchEndpoint(endpointDef, config) {
  const { path, key, expectedType } = endpointDef;
  assertPermittedReadOnlyRequest('GET', path);

  const startTime = Date.now();
  const authHeader = 'Basic ' + Buffer.from(`${config.username}:${config.password}`).toString('base64');

  const options = {
    hostname: config.host,
    port: config.port,
    path: path,
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json',
      'User-Agent': 'SudaFi-Audited-ReadOnly/1.0',
    },
    timeout: config.timeoutMs,
    rejectUnauthorized: true, // Strict certificate enforcement
  };

  if (config.caCertContent) {
    options.ca = config.caCertContent;
  }

  return new Promise((resolve) => {
    let receivedBytes = 0;
    let isAborted = false;

    const req = https.request(options, (res) => {
      // Reject any redirect immediately (drain stream to prevent resource leaks)
      if (res.statusCode >= 300 && res.statusCode < 400) {
        res.resume(); // Safely drain and release socket
        return resolve({
          statusCode: res.statusCode,
          latencyMs: Date.now() - startTime,
          data: null,
          rawLength: 0,
          error: `HTTP Redirect ${res.statusCode} encountered and blocked by security policy.`,
        });
      }

      let rawData = '';

      res.on('data', (chunk) => {
        receivedBytes += chunk.length;
        if (receivedBytes > MAX_RESPONSE_BYTES) {
          isAborted = true;
          req.destroy();
          return resolve({
            statusCode: res.statusCode || 200,
            latencyMs: Date.now() - startTime,
            data: null,
            rawLength: receivedBytes,
            error: `RESPONSE_SIZE_EXCEEDED: Endpoint response exceeded ${MAX_RESPONSE_BYTES} bytes limit.`,
          });
        }
        rawData += chunk;
      });

      res.on('end', () => {
        if (isAborted) return;

        const latencyMs = Date.now() - startTime;
        let parsed = null;
        let parseError = null;

        try {
          if (rawData && rawData.trim().length > 0) {
            parsed = JSON.parse(rawData);
          }
        } catch (e) {
          parseError = `JSON parse failed: ${e.message}`;
        }

        // Structural schema verification
        if (res.statusCode === 200 && !parseError) {
          const structCheck = validateEndpointStructure(key, expectedType, parsed);
          if (!structCheck.valid) {
            return resolve({
              statusCode: 200,
              latencyMs,
              data: parsed,
              rawLength: receivedBytes, // Fixed: actual network bytes
              error: `STRUCTURAL_VALIDATION_FAILED: ${structCheck.error}`,
            });
          }
        }

        resolve({
          statusCode: res.statusCode,
          latencyMs,
          data: parsed,
          rawLength: receivedBytes, // Fixed: actual network bytes
          error: res.statusCode >= 400 ? `HTTP Error ${res.statusCode}` : parseError,
        });
      });
    });

    req.on('error', (err) => {
      if (isAborted) return;
      resolve({
        statusCode: 0,
        latencyMs: Date.now() - startTime,
        data: null,
        rawLength: 0,
        error: `Network/TLS Error: ${err.message}`,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        statusCode: 408,
        latencyMs: Date.now() - startTime,
        data: null,
        rawLength: 0,
        error: `Request timed out after ${config.timeoutMs}ms`,
      });
    });

    req.end();
  });
}

/**
 * Main Discovery Executor
 */
export async function runReadOnlyDiscovery(customEnv = {}) {
  const config = validateAndLoadConfig(customEnv);

  console.log('='.repeat(75));
  console.log(' SudaFi Read-Only Discovery Engine - MikroTik L009UiGS (Audited)');
  console.log(` Target Host: ${config.host}:${config.port} (HTTPS [Strict TLS])`);
  console.log(` Account:     ${config.username} (Group: 'read,api' ONLY)`);
  console.log(' Safety:      Strict Whitelist | No Redirects | Max 2MB | Zero Mutation (GET only)');
  console.log('='.repeat(75));

  const results = {};
  const telemetry = [];
  const criticalFailures = [];

  for (const endpoint of ENDPOINT_WHITELIST) {
    process.stdout.write(`Querying ${endpoint.path.padEnd(32)} ... `);
    const res = await fetchEndpoint(endpoint, config);

    const isSuccess = res.statusCode === 200 && res.data !== null && !res.error;
    telemetry.push({
      key: endpoint.key,
      path: endpoint.path,
      critical: endpoint.critical,
      statusCode: res.statusCode,
      latencyMs: res.latencyMs,
      success: isSuccess,
      error: res.error,
    });

    if (isSuccess) {
      console.log(`[OK] (${res.latencyMs}ms, ${res.rawLength} bytes)`);
      results[endpoint.key] = res.data;
    } else {
      console.log(`[FAILED] Status: ${res.statusCode} (${res.latencyMs}ms) - ${res.error || 'Empty response'}`);
      results[endpoint.key] = { error: res.error, statusCode: res.statusCode, status: 'FAILED' };
      if (endpoint.critical) {
        criticalFailures.push({ endpoint: endpoint.path, error: res.error, statusCode: res.statusCode });
      }
    }
  }

  // Completeness Enforcement
  const isComplete = criticalFailures.length === 0;

  // Canonical Representation
  const canonicalString = canonicalizeJson(results);
  const diagnosticHash = crypto.createHash('sha256').update(canonicalString).digest('hex');

  // snapshotHash is strictly NULL if snapshot is incomplete; only complete snapshots receive valid hash
  const snapshotHash = isComplete ? diagnosticHash : null;

  // Extract Sanitized/Redacted Hardware Summary
  const resource = Array.isArray(results.resource) ? results.resource[0] : results.resource;
  const routerboard = Array.isArray(results.routerboard) ? results.routerboard[0] : results.routerboard;

  const rawSerial = routerboard?.['serial-number'] || 'N/A';
  const redactedSerial = redactSensitiveData('serial-number', rawSerial);

  const report = {
    timestamp: new Date().toISOString(),
    targetHost: config.host,
    model: routerboard?.model || resource?.['board-name'] || 'Unknown',
    architecture: resource?.['architecture-name'] || 'Unknown',
    routerOsVersion: resource?.version || 'Unknown',
    cpuCount: resource?.['cpu-count'] || 'Unknown',
    serialNumber: redactedSerial,
    isComplete,
    criticalFailures,
    snapshotHash,
    diagnosticHash,
    telemetry,
  };

  console.log('\n' + '='.repeat(75));
  console.log(' AUDITED DISCOVERY REPORT:');
  console.log(` - Hardware Model:    ${report.model}`);
  console.log(` - Architecture:      ${report.architecture}`);
  console.log(` - RouterOS Version:  ${report.routerOsVersion}`);
  console.log(` - Serial Number:     ${report.serialNumber} [REDACTED]`);
  console.log(` - Overall Status:    ${isComplete ? 'PASSED (Complete)' : 'REJECTED (Critical Failure)'}`);
  console.log(` - Snapshot SHA-256:  ${report.snapshotHash ?? 'NULL (Incomplete Snapshot)'}`);
  console.log(` - Diagnostic Hash:   ${report.diagnosticHash}`);
  if (!isComplete) {
    console.log('\n [!] CRITICAL ENDPOINTS FAILED:');
    for (const fail of criticalFailures) {
      console.log(`     * ${fail.endpoint}: ${fail.error} (Status: ${fail.statusCode})`);
    }
  }
  console.log('='.repeat(75));

  return report;
}

// Reliable direct execution check for Windows and POSIX
const isDirectExecution =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  runReadOnlyDiscovery()
    .then((rep) => {
      if (!rep.isComplete) {
        console.error('\nProcess exiting with code 2: Snapshot incomplete due to critical endpoint failure.');
        process.exit(2);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('\nFatal execution error:', err.message);
      process.exit(1);
    });
}
