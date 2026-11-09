/**
 * Unit & Integration Mock Tests for l009_readonly_discovery.mjs
 *
 * Verifies all security, validation, canonicalization, and parity assertions:
 * 1. Plaintext HTTP & port 80 rejection.
 * 2. HTTP Method restriction (only GET allowed).
 * 3. Whitelist path restriction.
 * 4. Real HTTP 302 Redirect blocking and socket stream draining.
 * 5. Strict TLS verification without CA rejection.
 * 6. Configuration validation: invalid ports, invalid timeouts, invalid hostnames.
 * 7. Missing credentials rejection.
 * 8. Deep structural validation: null array items, unexpected primitive types, missing required fields.
 * 9. Network receivedBytes accuracy matching Buffer.byteLength (including multi-byte Unicode/Arabic).
 * 10. snapshotHash is strictly NULL on critical endpoint failure.
 * 11. Canonical hash invariance and binary UTF-16 locale-independent comparison.
 * 12. Dynamic, Reproducible Cross-Platform Parity with Dart (testing unordered vs ordered arrays and Arabic Unicode).
 * 13. Full Discovery Success Scenario against Mock Server.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  validateAndLoadConfig,
  assertPermittedReadOnlyRequest,
  validateEndpointStructure,
  canonicalizeJson,
  binaryCompare,
  fetchEndpoint,
  runReadOnlyDiscovery,
  MAX_RESPONSE_BYTES,
  ENDPOINT_WHITELIST,
  SORTABLE_ARRAY_KEYS,
} from './l009_readonly_discovery.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CERT_PATH = path.join(__dirname, 'fixtures', 'test_cert.pem');
const KEY_PATH = path.join(__dirname, 'fixtures', 'test_key.pem');
const PARITY_FIXTURE_PATH = path.join(__dirname, 'fixtures', 'parity_snapshot.json');
const DART_SCRIPT_PATH = path.join(__dirname, 'dart_parity_test.dart');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DART_PACKAGE_CONFIG = path.join(REPO_ROOT, 'apps', 'mobile', '.dart_tool', 'package_config.json');

function resolveDartExecutable() {
  const candidates = [
    process.env.DART_EXECUTABLE,
    path.join(process.env.FLUTTER_ROOT || 'C:\\src\\flutter', 'bin', 'cache', 'dart-sdk', 'bin', 'dart.exe'),
    path.join(process.env.FLUTTER_ROOT || 'C:\\src\\flutter', 'bin', 'dart.bat'),
    'dart',
  ];
  for (const candidate of candidates) {
    if (candidate && (fs.existsSync(candidate) || candidate === 'dart')) {
      return candidate;
    }
  }
  return 'dart';
}

describe('L009 Read-Only Discovery Audited Test Suite', () => {
  let mockServer;
  let mockPort;
  let mockRedirectActive = false;
  let mockUnicodeResponseBody = null;

  const validUser = 'test_readonly_user';
  const validPass = 'SecureReadPass123!';

  before(async () => {
    // Audit that all test fixture and script files exist
    assert.ok(fs.existsSync(CERT_PATH), `Missing test certificate: ${CERT_PATH}`);
    assert.ok(fs.existsSync(KEY_PATH), `Missing test key: ${KEY_PATH}`);
    assert.ok(fs.existsSync(PARITY_FIXTURE_PATH), `Missing parity fixture: ${PARITY_FIXTURE_PATH}`);
    assert.ok(fs.existsSync(DART_SCRIPT_PATH), `Missing Dart script: ${DART_SCRIPT_PATH}`);

    const cert = fs.readFileSync(CERT_PATH);
    const key = fs.readFileSync(KEY_PATH);

    mockServer = https.createServer({ cert, key }, (req, res) => {
      const url = req.url;

      // Real 302 Redirect Trigger on whitelisted path
      if (url === '/rest/system/resource' && mockRedirectActive) {
        res.writeHead(302, { Location: 'https://127.0.0.1/rest/system/resource_redirected' });
        return res.end();
      }

      // Dynamic Unicode test response
      if (url === '/rest/interface' && mockUnicodeResponseBody !== null) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(mockUnicodeResponseBody);
      }

      if (url === '/rest/system/resource') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify([
            {
              'board-name': 'L009UiGS',
              'architecture-name': 'arm',
              version: '7.14.3',
              'cpu-count': 2,
              uptime: '5d12h',
              'cpu-load': 4,
            },
          ])
        );
      }

      if (url === '/rest/interface') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify([
            { name: 'ether2', type: 'ether', 'mac-address': '00:11:22:33:44:02' },
            { name: 'ether1', type: 'ether', 'mac-address': '00:11:22:33:44:01' },
          ])
        );
      }

      if (url === '/rest/interface/bridge') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify([{ name: 'bridge1', mtu: 1500 }]));
      }

      if (url === '/rest/interface/bridge/port') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify([{ interface: 'ether2', bridge: 'bridge1' }]));
      }

      if (url === '/rest/ip/address') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify([{ address: '192.168.88.1/24', interface: 'bridge1' }]));
      }

      if (url === '/rest/ip/route') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify([{ 'dst-address': '0.0.0.0/0', gateway: '192.168.1.1' }]));
      }

      if (url === '/rest/ip/pool') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify([{ name: 'dhcp-pool1', ranges: '192.168.88.10-192.168.88.254' }]));
      }

      if (url === '/rest/ip/dhcp-server') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify([{ name: 'dhcp1', interface: 'bridge1', 'address-pool': 'dhcp-pool1' }]));
      }

      if (url === '/rest/ip/hotspot') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify([]));
      }

      if (url === '/rest/system/routerboard') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            routerboard: true,
            model: 'L009UiGS-RM',
            'serial-number': 'HFA09XYZ123',
          })
        );
      }

      if (url === '/rest/interface/ethernet') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify([
            { name: 'ether1', speed: '1Gbps' },
            { name: 'sfp-sfpplus1', speed: '2.5Gbps' },
          ])
        );
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    await new Promise((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        mockPort = mockServer.address().port;
        resolve();
      });
    });
  });

  after(() => {
    if (mockServer) {
      mockServer.close();
    }
  });

  // Test 1: Plaintext HTTP Rejection
  it('1. MUST reject plaintext HTTP and port 80 explicitly', () => {
    assert.throws(
      () =>
        validateAndLoadConfig({
          ROUTER_USE_SSL: 'false',
          ROUTER_HOST: '127.0.0.1',
          ROUTER_USER: 'u',
          ROUTER_PASSWORD: 'p',
        }),
      /SECURITY VIOLATION: HTTPS is mandatory/
    );

    assert.throws(
      () =>
        validateAndLoadConfig({
          ROUTER_PORT: '80',
          ROUTER_HOST: '127.0.0.1',
          ROUTER_USER: 'u',
          ROUTER_PASSWORD: 'p',
        }),
      /SECURITY VIOLATION: Port 80 \(HTTP\) is prohibited/
    );
  });

  // Test 2: Method Restriction
  it('2. MUST reject any HTTP method other than GET', () => {
    for (const forbiddenMethod of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
      assert.throws(
        () => assertPermittedReadOnlyRequest(forbiddenMethod, '/rest/system/resource'),
        /CRITICAL SECURITY VIOLATION: Method.*is prohibited/
      );
    }
    assert.doesNotThrow(() => assertPermittedReadOnlyRequest('GET', '/rest/system/resource'));
  });

  // Test 3: Path Whitelist Restriction
  it('3. MUST reject unauthorized or non-whitelisted paths', () => {
    const maliciousPaths = [
      '/rest/system/reboot',
      '/rest/system/script',
      '/rest/system/backup/save',
      '/rest/user',
      '/etc/passwd',
      '/rest/ip/firewall/filter',
    ];

    for (const badPath of maliciousPaths) {
      assert.throws(
        () => assertPermittedReadOnlyRequest('GET', badPath),
        /CRITICAL SECURITY VIOLATION: Path.*is not in the approved read-only whitelist/
      );
    }
  });

  // Test 4: Real HTTP 302 Redirect Rejection & Stream Drain
  it('4. MUST reject HTTP Redirects (3xx) on network level, never follow them, and drain socket', async () => {
    const configWithCA = {
      host: '127.0.0.1',
      port: mockPort,
      username: validUser,
      password: validPass,
      timeoutMs: 3000,
      caCertContent: fs.readFileSync(CERT_PATH),
    };

    const endpointDef = {
      key: 'resource',
      path: '/rest/system/resource',
      critical: true,
      expectedType: 'object_or_single_array',
    };

    // Activate 302 Redirect on Mock Server
    mockRedirectActive = true;
    try {
      const res = await fetchEndpoint(endpointDef, configWithCA);

      // Verify 302 is received, not followed, and blocked
      assert.equal(res.statusCode, 302);
      assert.equal(res.data, null);
      assert.equal(res.rawLength, 0);
      assert.match(res.error, /HTTP Redirect 302 encountered and blocked by security policy/);
    } finally {
      mockRedirectActive = false;
    }
  });

  // Test 5: Untrusted TLS Certificate Rejection
  it('5. MUST reject untrusted TLS certificates when CA is not provided', async () => {
    const configWithoutCA = {
      host: '127.0.0.1',
      port: mockPort,
      username: validUser,
      password: validPass,
      timeoutMs: 3000,
      caCertContent: null,
    };

    const res = await fetchEndpoint(
      { key: 'resource', path: '/rest/system/resource', critical: true, expectedType: 'object_or_single_array' },
      configWithoutCA
    );

    assert.equal(res.statusCode, 0);
    assert.match(res.error, /Network\/TLS Error.*(self-signed|CERT)/i);

    const configWithCA = {
      ...configWithoutCA,
      caCertContent: fs.readFileSync(CERT_PATH),
    };

    const resWithCA = await fetchEndpoint(
      { key: 'resource', path: '/rest/system/resource', critical: true, expectedType: 'object_or_single_array' },
      configWithCA
    );

    assert.equal(resWithCA.statusCode, 200);
    assert.equal(resWithCA.error, null);
  });

  // Test 6: Configuration Validation (Port, Timeout, Host)
  it('6. MUST reject invalid port, invalid timeout, and malformed hostnames', () => {
    assert.throws(
      () => validateAndLoadConfig({ ROUTER_PORT: '70000', ROUTER_HOST: '127.0.0.1', ROUTER_USER: 'u', ROUTER_PASSWORD: 'p' }),
      /ROUTER_PORT out of range/
    );
    assert.throws(
      () => validateAndLoadConfig({ ROUTER_PORT: '-1', ROUTER_HOST: '127.0.0.1', ROUTER_USER: 'u', ROUTER_PASSWORD: 'p' }),
      /ROUTER_PORT must be an integer/
    );
    assert.throws(
      () => validateAndLoadConfig({ ROUTER_PORT: 'abc', ROUTER_HOST: '127.0.0.1', ROUTER_USER: 'u', ROUTER_PASSWORD: 'p' }),
      /ROUTER_PORT must be an integer/
    );

    assert.throws(
      () => validateAndLoadConfig({ ROUTER_TIMEOUT_MS: '0', ROUTER_HOST: '127.0.0.1', ROUTER_USER: 'u', ROUTER_PASSWORD: 'p' }),
      /ROUTER_TIMEOUT_MS must be between 1 and 60000/
    );
    assert.throws(
      () => validateAndLoadConfig({ ROUTER_TIMEOUT_MS: '-500', ROUTER_HOST: '127.0.0.1', ROUTER_USER: 'u', ROUTER_PASSWORD: 'p' }),
      /ROUTER_TIMEOUT_MS must be a positive integer/
    );
    assert.throws(
      () => validateAndLoadConfig({ ROUTER_TIMEOUT_MS: '999999', ROUTER_HOST: '127.0.0.1', ROUTER_USER: 'u', ROUTER_PASSWORD: 'p' }),
      /ROUTER_TIMEOUT_MS must be between 1 and 60000/
    );

    assert.throws(
      () => validateAndLoadConfig({ ROUTER_HOST: '192.168.1.300', ROUTER_USER: 'u', ROUTER_PASSWORD: 'p' }),
      /Invalid ROUTER_HOST/
    );
    assert.throws(
      () => validateAndLoadConfig({ ROUTER_HOST: 'host with spaces', ROUTER_USER: 'u', ROUTER_PASSWORD: 'p' }),
      /Invalid ROUTER_HOST/
    );
    assert.throws(
      () => validateAndLoadConfig({ ROUTER_HOST: 'router;reboot', ROUTER_USER: 'u', ROUTER_PASSWORD: 'p' }),
      /Invalid ROUTER_HOST/
    );
  });

  // Test 7: Missing Credentials Rejection
  it('7. MUST reject missing or empty credentials and hosts', () => {
    assert.throws(
      () => validateAndLoadConfig({ ROUTER_HOST: '', ROUTER_USER: 'u', ROUTER_PASSWORD: 'p' }),
      /Missing mandatory ROUTER_HOST/
    );
    assert.throws(
      () => validateAndLoadConfig({ ROUTER_HOST: '10.0.0.1', ROUTER_USER: '', ROUTER_PASSWORD: 'p' }),
      /Missing mandatory ROUTER_USER/
    );
    assert.throws(
      () => validateAndLoadConfig({ ROUTER_HOST: '10.0.0.1', ROUTER_USER: 'u', ROUTER_PASSWORD: '' }),
      /Missing mandatory ROUTER_PASSWORD/
    );
  });

  // Test 8: Deep Structural Validation (Nulls, Types, Required Fields)
  it('8. MUST detect null items, unexpected primitive types, and missing required fields in arrays', () => {
    const nullCheck = validateEndpointStructure('interfaces', 'array', [null]);
    assert.equal(nullCheck.valid, false);
    assert.match(nullCheck.error, /not a valid object/);

    const primitiveCheck = validateEndpointStructure('bridges', 'array', ['string_instead_of_object', 123]);
    assert.equal(primitiveCheck.valid, false);
    assert.match(primitiveCheck.error, /not a valid object/);

    const missingNameCheck = validateEndpointStructure('interfaces', 'array', [{ comment: 'no name here' }]);
    assert.equal(missingNameCheck.valid, false);
    assert.match(missingNameCheck.error, /missing valid "name" string/);

    const missingAddressCheck = validateEndpointStructure('ipAddresses', 'array', [{ interface: 'ether1' }]);
    assert.equal(missingAddressCheck.valid, false);
    assert.match(missingAddressCheck.error, /missing valid "address" string/);

    const resourceCheck = validateEndpointStructure('resource', 'object_or_single_array', [{ version: '7.14' }]);
    assert.equal(resourceCheck.valid, false);
    assert.match(resourceCheck.error, /missing valid "architecture-name"/);
  });

  // Test 9: Exact Accuracy of receivedBytes (Network Payload & Multi-Byte Unicode)
  it('9. MUST accurately report receivedBytes matching Buffer.byteLength including multi-byte Unicode', async () => {
    const configWithCA = {
      host: '127.0.0.1',
      port: mockPort,
      username: validUser,
      password: validPass,
      timeoutMs: 5000,
      caCertContent: fs.readFileSync(CERT_PATH),
    };

    // 9a. ASCII JSON test
    const asciiEndpoint = { key: 'interface', path: '/rest/interface', critical: true, expectedType: 'array' };
    const asciiRes = await fetchEndpoint(asciiEndpoint, configWithCA);
    assert.equal(asciiRes.statusCode, 200);
    assert.ok(asciiRes.rawLength > 0);

    // 9b. Multi-Byte Arabic Unicode JSON test
    // Arabic characters take 2 bytes per char in UTF-8, emoji takes 4 bytes.
    const unicodePayload = JSON.stringify([
      { name: 'ether1', comment: 'واجهة الألياف الضوئية الرئيسية 🌐', type: 'ether' },
      { name: 'ether2', comment: 'شبكة المشتركين بالخرطوم ⚡', type: 'ether' },
    ]);

    mockUnicodeResponseBody = unicodePayload;
    try {
      const expectedByteLength = Buffer.byteLength(unicodePayload, 'utf8');
      const charLength = unicodePayload.length;

      // Ensure that byte length is strictly greater than character length for this fixture
      assert.ok(
        expectedByteLength > charLength,
        `Unicode payload must have more bytes (${expectedByteLength}) than characters (${charLength})`
      );

      const unicodeRes = await fetchEndpoint(
        { key: 'interfaces', path: '/rest/interface', critical: true, expectedType: 'array' },
        configWithCA
      );

      assert.equal(unicodeRes.statusCode, 200);
      assert.equal(
        unicodeRes.rawLength,
        expectedByteLength,
        `rawLength (${unicodeRes.rawLength}) must match Buffer.byteLength (${expectedByteLength}) exactly`
      );
      assert.notEqual(
        unicodeRes.rawLength,
        charLength,
        'rawLength must NOT equal the string character count'
      );
    } finally {
      mockUnicodeResponseBody = null;
    }
  });

  // Test 10: snapshotHash is strictly NULL on Critical Endpoint Failure
  it('10. MUST set snapshotHash to NULL if any critical endpoint fails', async () => {
    const failingEnv = {
      ROUTER_HOST: '127.0.0.1',
      ROUTER_PORT: '9999',
      ROUTER_USER: validUser,
      ROUTER_PASSWORD: validPass,
      ROUTER_TIMEOUT_MS: '200',
      ROUTER_CA_CERT_PATH: CERT_PATH,
    };

    const report = await runReadOnlyDiscovery(failingEnv);

    assert.equal(report.isComplete, false);
    assert.equal(report.snapshotHash, null);
    assert.ok(report.diagnosticHash !== null);
    assert.ok(report.criticalFailures.length > 0);
  });

  // Test 11: Binary Comparison & Locale-Independent Sorting
  it('11. MUST use binary UTF-16 code unit comparison independent of system locale', () => {
    const charA = 'i';
    const charB = 'I';
    const result = binaryCompare(charA, charB);
    assert.equal(result, 1, 'In UTF-16 binary order, "i" (U+0069) is strictly greater than "I" (U+0049)');

    const dataset1 = {
      interfaces: [
        { name: 'ether2', address: '10.0.0.2' },
        { name: 'ether1', address: '10.0.0.1' },
      ],
      resource: { 'board-name': 'L009UiGS', version: '7.14' },
    };

    const dataset2 = {
      resource: { version: '7.14', 'board-name': 'L009UiGS' },
      interfaces: [
        { name: 'ether1', address: '10.0.0.1' },
        { name: 'ether2', address: '10.0.0.2' },
      ],
    };

    const hash1 = crypto.createHash('sha256').update(canonicalizeJson(dataset1)).digest('hex');
    const hash2 = crypto.createHash('sha256').update(canonicalizeJson(dataset2)).digest('hex');
    assert.equal(hash1, hash2, 'Canonical hash must be identical across key and array permutations');
  });

  // Test 12: Dynamic Reproducible Cross-Platform Parity with Dart
  it('12. MUST dynamically execute Dart and match canonical SHA-256 byte-for-byte across unordered and ordered arrays', () => {
    // 12a. Execute Dart CLI dynamically on shared fixture
    const dartCmd = resolveDartExecutable();
    const dartOutput = execFileSync(
      dartCmd,
      [`--packages=${DART_PACKAGE_CONFIG}`, 'run', DART_SCRIPT_PATH, PARITY_FIXTURE_PATH],
      { encoding: 'utf8' }
    ).trim();

    // 12b. Compute Node.js canonical hash dynamically on the same fixture
    const fixtureJson = JSON.parse(fs.readFileSync(PARITY_FIXTURE_PATH, 'utf8'));
    const nodeCanonical = canonicalizeJson(fixtureJson);
    const nodeHash = crypto.createHash('sha256').update(nodeCanonical).digest('hex');

    assert.equal(
      nodeHash,
      dartOutput,
      `Cross-platform parity failure: Node.js produced ${nodeHash}, but Dart produced ${dartOutput}`
    );

    // 12c. Test Unordered Array Invariance: Reordering "interfaces" produces the EXACT SAME hash
    const reorderedInterfaces = {
      ...fixtureJson,
      interfaces: [fixtureJson.interfaces[2], fixtureJson.interfaces[0], fixtureJson.interfaces[1]],
    };
    const nodeHashReordered = crypto.createHash('sha256').update(canonicalizeJson(reorderedInterfaces)).digest('hex');
    assert.equal(nodeHashReordered, nodeHash, 'Reordering unordered array (interfaces) MUST preserve the exact hash');

    // 12d. Test Order-Sensitive Array Preservation: Reordering "routes" MUST produce a DIFFERENT hash
    const reorderedRoutes = {
      ...fixtureJson,
      routes: [fixtureJson.routes[1], fixtureJson.routes[0]], // Swap routes order
    };
    const nodeHashReorderedRoutes = crypto.createHash('sha256').update(canonicalizeJson(reorderedRoutes)).digest('hex');
    assert.notEqual(
      nodeHashReorderedRoutes,
      nodeHash,
      'Reordering order-sensitive array (routes) MUST produce a different hash'
    );
  });

  // Full Success Scenario
  it('13. MUST successfully complete full discovery against valid mock server', async () => {
    const successEnv = {
      ROUTER_HOST: '127.0.0.1',
      ROUTER_PORT: String(mockPort),
      ROUTER_USER: validUser,
      ROUTER_PASSWORD: validPass,
      ROUTER_TIMEOUT_MS: '2000',
      ROUTER_CA_CERT_PATH: CERT_PATH,
    };

    const report = await runReadOnlyDiscovery(successEnv);

    assert.equal(report.isComplete, true);
    assert.equal(report.model, 'L009UiGS-RM');
    assert.equal(report.architecture, 'arm');
    assert.equal(report.routerOsVersion, '7.14.3');
    assert.equal(report.serialNumber, 'HF******23');
    assert.ok(report.snapshotHash !== null);
    assert.equal(report.snapshotHash, report.diagnosticHash);
    assert.equal(report.criticalFailures.length, 0);
  });
});
