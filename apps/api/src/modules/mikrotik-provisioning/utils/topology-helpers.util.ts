import type {
  RouterInterfaceItem,
  RouterIpAddressItem,
  RouterRouteItem,
} from '../../../core/mikrotik/interfaces/mikrotik-client.interface';

export interface ResolvedRouteEgress {
  route: RouterRouteItem;
  egressInterfaces: string[];
  isAmbiguous: boolean;
  isEcmp: boolean;
}

export interface ActiveDefaultRoutesEgressSummary {
  activeDefaultRoutes: RouterRouteItem[];
  egressInterfaces: string[];
  hasAmbiguousEgress: boolean;
  hasEcmp: boolean;
  perRoute: ResolvedRouteEgress[];
}

export function ipBelongsToCidr(ipStr: string, cidrStr?: string): boolean {
  if (!ipStr || !cidrStr || !cidrStr.includes('/')) return false;
  const [netIp, prefixStr] = cidrStr.split('/');
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;
  const toInt = (s: string): number | null => {
    const parts = s.trim().split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  };
  const ipInt = toInt(ipStr);
  const netInt = toInt(netIp);
  if (ipInt === null || netInt === null) return false;
  const mask = prefix === 0 ? 0 : (~((1 << (32 - prefix)) - 1)) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

export function resolveRouteEgress(
  route: RouterRouteItem,
  interfaces: RouterInterfaceItem[],
  ipAddresses: RouterIpAddressItem[],
): ResolvedRouteEgress {
  const resolved = new Set<string>();
  const rawRecord = route as unknown as Record<string, unknown>;
  const gwStatus = String(route.gatewayStatus || rawRecord['gateway-status'] || '');
  const immediateGw = String(route.immediateGw || rawRecord['immediate-gw'] || '');
  const statusAndImm = [gwStatus, immediateGw].filter(Boolean).join(',');

  let resolvedFromStatus = false;
  for (const m of statusAndImm.matchAll(/\bvia\s+([^\s,;]+)/gi)) {
    if (m[1]) {
      resolved.add(m[1].trim());
      resolvedFromStatus = true;
    }
  }
  for (const m of statusAndImm.matchAll(/%([^\s,;]+)/g)) {
    if (m[1]) {
      resolved.add(m[1].trim());
      resolvedFromStatus = true;
    }
  }

  let isAmbiguous = false;
  const gwParts = route.gateway
    ? String(route.gateway)
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean)
    : [];

  if (!resolvedFromStatus && gwParts.length > 0) {
    for (const gwEntry of gwParts) {
      const ifaceIdx = gwEntry.indexOf('%');
      if (ifaceIdx !== -1) {
        const explicitIface = gwEntry.slice(ifaceIdx + 1).trim();
        if (explicitIface) resolved.add(explicitIface);
        continue;
      }
      const directIface = interfaces.find((i) => i.name === gwEntry);
      if (directIface) {
        resolved.add(directIface.name);
        continue;
      }
      const matchedIfaces = Array.from(
        new Set(
          ipAddresses
            .filter((ip) => !ip.disabled && ip.interface && ipBelongsToCidr(gwEntry, ip.address))
            .map((ip) => ip.interface),
        ),
      );
      if (matchedIfaces.length === 1) {
        resolved.add(matchedIfaces[0]);
      } else {
        // Zero matches (unassigned subnet) or multiple overlapping subnets -> cannot unambiguously attribute egress
        isAmbiguous = true;
      }
    }
  }

  if (resolved.size === 0) {
    isAmbiguous = true;
  }

  const egressInterfaces = Array.from(resolved);
  const isEcmp = gwParts.length > 1 || egressInterfaces.length > 1;

  return {
    route,
    egressInterfaces,
    isAmbiguous,
    isEcmp,
  };
}

export function resolveActiveDefaultRoutesEgress(
  routes: RouterRouteItem[],
  interfaces: RouterInterfaceItem[],
  ipAddresses: RouterIpAddressItem[],
): ActiveDefaultRoutesEgressSummary {
  const activeDefaultRoutes = routes.filter(
    (r) =>
      (r.dstAddress === '0.0.0.0/0' || r.dstAddress === '0.0.0.0') &&
      !r.disabled &&
      r.active !== false,
  );

  const perRoute = activeDefaultRoutes.map((route) =>
    resolveRouteEgress(route, interfaces, ipAddresses),
  );

  const allEgress = new Set<string>();
  let hasAmbiguousEgress = false;
  let hasEcmp = perRoute.length > 1;

  for (const item of perRoute) {
    for (const iface of item.egressInterfaces) allEgress.add(iface);
    if (item.isAmbiguous) hasAmbiguousEgress = true;
    if (item.isEcmp) hasEcmp = true;
  }

  if (allEgress.size > 1) hasEcmp = true;

  return {
    activeDefaultRoutes,
    egressInterfaces: Array.from(allEgress),
    hasAmbiguousEgress,
    hasEcmp,
    perRoute,
  };
}
