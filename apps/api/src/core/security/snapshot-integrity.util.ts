import * as crypto from 'crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';

/**
 * Deterministic UTF-16 code unit binary comparison (matching Dart String.compareTo)
 */
export function binaryCompare(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const codeA = a.charCodeAt(i);
    const codeB = b.charCodeAt(i);
    if (codeA !== codeB) {
      return codeA - codeB;
    }
  }
  return a.length - b.length;
}

const SORTABLE_ARRAY_KEYS = new Set([
  'interfaces',
  'bridges',
  'bridgePorts',
  'ipAddresses',
  'dhcpServers',
  'dhcpClients',
  'dhcpNetworks',
  'pools',
  'natRules',
  'filterRules',
  'mangleRules',
  'routes',
  'hotspotServers',
  'hotspotProfiles',
  'hotspotUserProfiles',
]);

const VOLATILE_KEYS = new Set([
  'uptime',
  'free-memory',
  'cpu-load',
  'rx-byte',
  'tx-byte',
  'free-hdd-space',
  'write-sect-total',
  'write-sect-since-reboot',
  'discoveredAt',
  'snapshotHash',
  'cachedAt',
]);

/**
 * Validates RouterOS internal ID syntax (*1, *2, *1F, or positive integer numbers)
 */
export function isValidRouterOsId(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  const trimmed = id.trim();
  return /^(\*[0-9a-fA-F]+|[0-9]+)$/.test(trimmed);
}

/**
 * Mathematically validates IPv4 and IPv4/CIDR strings.
 * Enforces:
 * - Exactly 4 octets separated by dots
 * - Each octet is an integer between 0 and 255
 * - No invalid leading zeros (e.g. '0' is valid, '01' is invalid)
 * - Optional prefix between /0 and /32 without invalid leading zeros
 */
export function isValidIpv4Cidr(ipOrCidr?: string | null): boolean {
  if (!ipOrCidr || typeof ipOrCidr !== 'string') return false;
  const trimmed = ipOrCidr.trim();
  if (!trimmed) return false;

  const parts = trimmed.split('/');
  if (parts.length > 2) return false;

  const ipPart = parts[0];
  const octets = ipPart.split('.');
  if (octets.length !== 4) return false;

  for (const octet of octets) {
    if (!/^\d+$/.test(octet)) return false;
    if (octet.length > 1 && octet.startsWith('0')) return false; // No invalid leading zeros like '01'
    const num = Number(octet);
    if (!Number.isInteger(num) || num < 0 || num > 255) return false;
  }

  if (parts.length === 2) {
    const prefixStr = parts[1];
    if (!/^\d+$/.test(prefixStr)) return false;
    if (prefixStr.length > 1 && prefixStr.startsWith('0')) return false; // No invalid leading zeros like '02'
    const prefix = Number(prefixStr);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  }

  return true;
}

/**
 * Deterministically canonicalizes a snapshot object for cryptographically reproducible hashing
 */
export function canonicalizeSnapshotJson(obj: any, parentKey: string | null = null): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const shouldSort = parentKey === null || SORTABLE_ARRAY_KEYS.has(parentKey);
    let itemsToSerialize = obj;

    if (shouldSort) {
      itemsToSerialize = [...obj].sort((a, b) => {
        const getStableKey = (item: any): string => {
          if (!item || typeof item !== 'object') return String(item);
          return String(item.name || item.address || item['.id'] || item.id || item.interface || '');
        };
        const keyA = getStableKey(a);
        const keyB = getStableKey(b);
        const cmp = binaryCompare(keyA, keyB);
        if (cmp !== 0) return cmp;
        return binaryCompare(canonicalizeSnapshotJson(a), canonicalizeSnapshotJson(b));
      });
    }

    return '[' + itemsToSerialize.map((item) => canonicalizeSnapshotJson(item, parentKey)).join(',') + ']';
  }

  const sortedKeys = Object.keys(obj).sort(binaryCompare);
  const pairs: string[] = [];

  for (const key of sortedKeys) {
    if (!VOLATILE_KEYS.has(key)) {
      pairs.push(JSON.stringify(key) + ':' + canonicalizeSnapshotJson(obj[key], key));
    }
  }

  return '{' + pairs.join(',') + '}';
}

/**
 * Computes authoritative SHA-256 hash of a router discovery snapshot
 */
export function computeAuthoritativeSnapshotHash(snapshot: any): string {
  const canonical = canonicalizeSnapshotJson(snapshot);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export interface SnapshotValidationResult {
  isValid: boolean;
  authoritativeHash: string;
  missingSections: string[];
}

/**
 * Validates freshness, structural completeness, and integrity of a client snapshot
 */
export function validateSnapshotIntegrity(
  snapshot: any,
  discoveredAt?: string,
  _clientHash?: string,
): SnapshotValidationResult {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new BadRequestException({
      code: 'SNAPSHOT_MISSING',
      message: 'بيانات استكشاف الراوتر (Snapshot) مفقودة أو غير صالحة.',
    });
  }

  // 1. Mandatory Freshness & Timestamp Validation
  if (!discoveredAt || typeof discoveredAt !== 'string' || !discoveredAt.trim()) {
    throw new BadRequestException({
      code: 'DISCOVERED_AT_REQUIRED',
      message: 'حقل تاريخ ووقت الاستكشاف (discoveredAt) إلزامي للتحقق من حداثة البيانات.',
    });
  }

  const discTime = new Date(discoveredAt).getTime();
  if (!Number.isFinite(discTime)) {
    throw new BadRequestException({
      code: 'DISCOVERED_AT_INVALID',
      message: 'صيغة تاريخ الاستكشاف (discoveredAt) غير صالحة ولا يمكن تحليلها.',
    });
  }

  const now = Date.now();
  if (now - discTime > 15 * 60 * 1000) {
    throw new ConflictException({
      code: 'SNAPSHOT_STALE',
      message: 'بيانات استكشاف الراوتر قديمة (تجاوزت 15 دقيقة) وتتطلب إعادة الفحص لضمان الدقة.',
    });
  }
  if (discTime - now > 120000) {
    throw new ConflictException({
      code: 'SNAPSHOT_TIME_SKEW',
      message: 'الطابع الزمني للاستكشاف يسبق وقت الخادم بأكثر من دقيقتين (تحقق من ضبط الوقت).',
    });
  }

  // 2. Structural Completeness: Verify essential sections
  const missingSections: string[] = [];

  // 2a. Interfaces
  if (!Array.isArray(snapshot.interfaces) || snapshot.interfaces.length === 0) {
    missingSections.push('interfaces');
  } else {
    const hasValidNames = snapshot.interfaces.every(
      (i: any) => i && typeof i === 'object' && typeof i.name === 'string' && i.name.trim().length > 0,
    );
    if (!hasValidNames) {
      missingSections.push('interfaces_invalid_entries');
    }
  }

  // 2b. IP Addresses (Critical for PRE_CLEANUP and Management Path)
  if (!Array.isArray(snapshot.ipAddresses)) {
    missingSections.push('ipAddresses');
  } else {
    const hasValidIps = snapshot.ipAddresses.every(
      (ip: any) =>
        ip &&
        typeof ip === 'object' &&
        typeof ip.address === 'string' &&
        ip.address.trim().length > 0 &&
        isValidIpv4Cidr(ip.address.trim()) &&
        typeof ip.interface === 'string' &&
        ip.interface.trim().length > 0,
    );
    if (!hasValidIps) {
      missingSections.push('ipAddresses_invalid_entries');
    }
    const hasValidIpIds = snapshot.ipAddresses.every(
      (ip: any) =>
        (!ip.id || isValidRouterOsId(ip.id)) &&
        (!ip['.id'] || isValidRouterOsId(ip['.id'])),
    );
    if (!hasValidIpIds) {
      missingSections.push('ipAddresses_invalid_ids');
    }
  }

  // 2c. Bridge Ports (Critical for PRE_CLEANUP bridge member detachment and L2 loop prevention)
  if (!Array.isArray(snapshot.bridgePorts)) {
    missingSections.push('bridgePorts');
  } else {
    const hasValidBridgePorts = snapshot.bridgePorts.every(
      (bp: any) =>
        bp &&
        typeof bp === 'object' &&
        typeof bp.interface === 'string' &&
        bp.interface.trim().length > 0 &&
        typeof bp.bridge === 'string' &&
        bp.bridge.trim().length > 0,
    );
    if (!hasValidBridgePorts) {
      missingSections.push('bridgePorts_invalid_entries');
    }
    const hasValidBridgePortIds = snapshot.bridgePorts.every(
      (bp: any) =>
        (!bp.id || isValidRouterOsId(bp.id)) &&
        (!bp['.id'] || isValidRouterOsId(bp['.id'])),
    );
    if (!hasValidBridgePortIds) {
      missingSections.push('bridgePorts_invalid_ids');
    }
  }

  // 2d. Bridges (Critical for Bridge Setup and verification)
  if (!Array.isArray(snapshot.bridges)) {
    missingSections.push('bridges');
  } else {
    const hasValidBridges = snapshot.bridges.every(
      (b: any) => b && typeof b === 'object' && typeof b.name === 'string' && b.name.trim().length > 0,
    );
    if (!hasValidBridges) {
      missingSections.push('bridges_invalid_entries');
    }
  }

  // 2e. Routes (If present, must be structured objects with valid destination and gateway)
  if (snapshot.routes !== undefined) {
    if (!Array.isArray(snapshot.routes)) {
      missingSections.push('routes_not_array');
    } else {
      const hasValidRoutes = snapshot.routes.every(
        (r: any) =>
          r &&
          typeof r === 'object' &&
          (typeof r.dstAddress === 'string' || typeof r['dst-address'] === 'string') &&
          isValidIpv4Cidr(String(r.dstAddress || r['dst-address']).trim()),
      );
      if (!hasValidRoutes) {
        missingSections.push('routes_invalid_entries');
      }
    }
  }

  if (missingSections.length > 0) {
    throw new BadRequestException({
      code: 'SNAPSHOT_INCOMPLETE',
      message: `بيانات استكشاف الراوتر غير مكتملة أو تحتوي عناصر غير صالحة. الحقول المفقودة/المشوهة: ${missingSections.join(', ')}`,
      missingSections,
    });
  }

  // 3. Recompute Authoritative SHA-256 Hash
  const authoritativeHash = computeAuthoritativeSnapshotHash(snapshot);

  return {
    isValid: true,
    authoritativeHash,
    missingSections: [],
  };
}
