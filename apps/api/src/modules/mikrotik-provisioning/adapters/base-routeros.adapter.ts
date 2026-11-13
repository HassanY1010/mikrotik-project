import type {
  AdapterStageCommandInput,
  IRouterOsAdapter,
} from './routeros-adapter.interface';
import type {
  FullRouterDiscoveryReport,
  PlannedCommandSpec,
  ProvisioningStageId,
  RouterOsMajorFamily,
} from '../interfaces/auto-provisioning.interface';
import { isValidIpv4Cidr, isValidRouterOsId } from '../../../core/security/snapshot-integrity.util';
import { maskExecutionWords } from '../utils/secret-redactor.util';
import { CANONICAL_DEFAULTS } from '../constants/canonical-scripts';

/**
 * Shared base adapter containing version-agnostic network provisioning logic
 * so ROS6 and ROS7 adapters only specialize genuinely divergent RouterOS paths
 * (Wireless vs WiFi/WiFiWave2, NTP client vs servers table, RSC export flags, Scripts).
 */
export abstract class BaseRouterOsAdapter implements IRouterOsAdapter {
  abstract readonly family: RouterOsMajorFamily;

  protected makeCmd(
    order: number,
    stage: ProvisioningStageId,
    description: string,
    executionWords: string[],
    opts?: {
      idempotent?: boolean;
      safeToRetry?: boolean;
      checkExistingStrategy?: string;
      rollbackWords?: string[];
      createdResourceType?: string;
    },
  ): PlannedCommandSpec {
    const maskedWords = maskExecutionWords(executionWords);
    const maskedStr = maskedWords.join(' ');
    return {
      order,
      stage,
      description,
      commandMasked: maskedStr,
      executionWords,
      cliPreview: maskedStr,
      idempotent: opts?.idempotent ?? true,
      safeToRetry: opts?.safeToRetry ?? false,
      checkExistingStrategy: opts?.checkExistingStrategy,
      rollbackWords: opts?.rollbackWords,
      createdResourceType: opts?.createdResourceType,
    };
  }

  protected extractSubnetBase(ipWithCidr?: string | null): string {
    if (!ipWithCidr || !isValidIpv4Cidr(ipWithCidr)) return '10.5.50';
    const parts = ipWithCidr.split('/')[0].split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }

  protected extractNetworkCidr(ipWithCidr?: string | null): string {
    if (!ipWithCidr || !isValidIpv4Cidr(ipWithCidr)) return '10.5.50.0/24';
    const [ipPart, cidr = '24'] = ipWithCidr.split('/');
    const octets = ipPart.split('.').map(Number);
    const prefix = Number(cidr);
    if (prefix <= 0 || prefix > 32) return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
    const mask = (~((1 << (32 - prefix)) - 1)) >>> 0;
    const ipInt =
      ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
    const netInt = (ipInt & mask) >>> 0;
    return `${(netInt >>> 24) & 255}.${(netInt >>> 16) & 255}.${(netInt >>> 8) & 255}.${netInt & 255}/${prefix}`;
  }

  protected generateDefaultPoolRange(ipWithCidr?: string | null): string {
    const base = this.extractSubnetBase(ipWithCidr);
    return `${base}.10-${base}.254`;
  }

  protected isCleanTemplate(discovery: FullRouterDiscoveryReport, template?: string): boolean {
    return (template || 'CLEAN_SETUP') === 'CLEAN_SETUP' && discovery.interfaces.length >= 0;
  }

  buildWanCommands(input: AdapterStageCommandInput): PlannedCommandSpec[] {
    const { config, discovery } = input;
    let order = input.startOrder;
    const cmds: PlannedCommandSpec[] = [];
    const isClean = (config.template || 'CLEAN_SETUP') === 'CLEAN_SETUP';
    const wanIface = config.wan.interface.trim();

    if (config.wan.renameInterfaceTo && config.wan.renameInterfaceTo.trim() !== wanIface) {
      const targetName = config.wan.renameInterfaceTo.trim();
      const targetIfaceObj = discovery.interfaces.find((i) => i.name === wanIface);
      if (targetIfaceObj?.id && isValidRouterOsId(targetIfaceObj.id)) {
        cmds.push(
          this.makeCmd(
            order++,
            'WAN',
            `تسمية واجهة الإنترنت (${wanIface}) إلى (${targetName})`,
            ['/interface/set', `=.id=${targetIfaceObj.id}`, `=name=${targetName}`],
            {
              rollbackWords: ['/interface/set', `=.id=${targetIfaceObj.id}`, `=name=${wanIface}`],
            },
          ),
        );
      }
    }

    const effectiveWan = config.wan.renameInterfaceTo?.trim() || wanIface;

    if (config.wan.mode === 'DHCP') {
      const exists = !isClean && discovery.dhcpClients.some((c) => c.interface === effectiveWan);
      if (!exists) {
        cmds.push(
          this.makeCmd(
            order++,
            'WAN',
            `تفعيل عميل DHCP لاستقبال الإنترنت تلقائياً على (${effectiveWan})`,
            [
              '/ip/dhcp-client/add',
              `=interface=${effectiveWan}`,
              '=add-default-route=yes',
              '=use-peer-dns=yes',
              '=use-peer-ntp=yes',
              '=disabled=no',
              '=comment=SudaFi WAN DHCP',
            ],
            {
              idempotent: true,
              safeToRetry: false,
              checkExistingStrategy: 'ip.dhcp-client interface match',
              createdResourceType: 'dhcp-client',
            },
          ),
        );
      }
    } else if (config.wan.mode === 'PPPOE') {
      cmds.push(
        this.makeCmd(
          order++,
          'WAN',
          `إنشاء اتصال PPPoE Client على (${effectiveWan})`,
          [
            '/interface/pppoe-client/add',
            '=name=pppoe-out1',
            `=interface=${effectiveWan}`,
            `=user=${config.wan.pppoeUser ?? ''}`,
            `=password=${config.wan.pppoePassword ?? ''}`,
            '=add-default-route=yes',
            '=use-peer-dns=yes',
            '=disabled=no',
            '=comment=SudaFi WAN PPPoE',
          ],
          {
            idempotent: false,
            safeToRetry: false,
            createdResourceType: 'pppoe-client',
          },
        ),
      );
    } else if (config.wan.mode === 'STATIC') {
      if (config.wan.staticIp) {
        const exists =
          !isClean &&
          discovery.ipAddresses.some(
            (ip) => ip.interface === effectiveWan && ip.address === config.wan.staticIp,
          );
        if (!exists) {
          cmds.push(
            this.makeCmd(
              order++,
              'WAN',
              `تعيين عنوان IP ثابت (${config.wan.staticIp}) لواجهة WAN (${effectiveWan})`,
              [
                '/ip/address/add',
                `=address=${config.wan.staticIp}`,
                `=interface=${effectiveWan}`,
                '=comment=SudaFi WAN Static',
              ],
              { createdResourceType: 'ip-address' },
            ),
          );
        }
      }
      if (config.wan.staticGateway) {
        const routeExists =
          !isClean &&
          discovery.routes.some(
            (r) =>
              (r.dstAddress === '0.0.0.0/0' || r.dstAddress === '0.0.0.0') &&
              r.gateway === config.wan.staticGateway,
          );
        if (!routeExists) {
          cmds.push(
            this.makeCmd(
              order++,
              'WAN',
              `إضافة المسار الافتراضي عبر البوابة (${config.wan.staticGateway})`,
              [
                '/ip/route/add',
                '=dst-address=0.0.0.0/0',
                `=gateway=${config.wan.staticGateway}`,
                '=comment=SudaFi Default Route',
              ],
              { createdResourceType: 'ip-route' },
            ),
          );
        }
      }
    }

    return cmds;
  }

  buildLanBridgeCommands(input: AdapterStageCommandInput): PlannedCommandSpec[] {
    const { config, discovery } = input;
    let order = input.startOrder;
    const cmds: PlannedCommandSpec[] = [];
    const bridgeName = (config.lan.bridgeName || CANONICAL_DEFAULTS.BRIDGE_NAME).trim();
    const isClean = (config.template || 'CLEAN_SETUP') === 'CLEAN_SETUP';
    const memberPorts = (config.lan.memberInterfaces || []).map((p) => p.trim()).filter(Boolean);

    if (isClean) {
      // Safe per-ID removal ONLY for non-management static direct IPs & non-target bridge ports
      for (const port of memberPorts) {
        const directIps = discovery.ipAddresses.filter((ip) => ip.interface === port);
        const hasUnsafe = directIps.some((ip) => {
          const clean = ip.address.split('/')[0];
          const isMgmt = clean === discovery.device.host;
          const isDyn = ip.dynamic === true || ip.dynamic === 'true';
          return isMgmt || isDyn || !ip.id || !isValidRouterOsId(ip.id);
        });
        if (!hasUnsafe) {
          for (const ip of directIps) {
            if (!ip.id) continue;
            const rbWords = [
              '/ip/address/add',
              `=address=${ip.address}`,
              `=interface=${ip.interface}`,
            ];
            if (ip.network) rbWords.push(`=network=${ip.network}`);
            if (ip.comment) rbWords.push(`=comment=${ip.comment}`);
            if (ip.disabled) rbWords.push('=disabled=yes');
            cmds.push(
              this.makeCmd(
                order++,
                'LAN_BRIDGE',
                `إزالة عنوان IP السابق (${ip.address}) من المنفذ (${port}) قبل ضمه للجسر`,
                ['/ip/address/remove', `=.id=${ip.id}`],
                {
                  safeToRetry: false,
                  rollbackWords: rbWords,
                },
              ),
            );
          }
        }

        const prevBp = discovery.bridgePorts.find(
          (bp) => bp.interface === port && bp.bridge !== bridgeName,
        );
        if (prevBp?.id && isValidRouterOsId(prevBp.id)) {
          const bpRbWords = [
            '/interface/bridge/port/add',
            `=bridge=${prevBp.bridge}`,
            `=interface=${port}`,
          ];
          if (prevBp.horizon) bpRbWords.push(`=horizon=${prevBp.horizon}`);
          if (prevBp.comment) bpRbWords.push(`=comment=${prevBp.comment}`);
          if (prevBp.disabled) bpRbWords.push('=disabled=yes');
          cmds.push(
            this.makeCmd(
              order++,
              'LAN_BRIDGE',
              `فصل المنفذ (${port}) من الجسر السابق (${prevBp.bridge})`,
              ['/interface/bridge/port/remove', `=.id=${prevBp.id}`],
              {
                safeToRetry: false,
                rollbackWords: bpRbWords,
              },
            ),
          );
        }
      }
    }

    const bridgeExists = !isClean && discovery.bridges.some((b) => b.name === bridgeName);
    if (!bridgeExists) {
      const bridgeWords = [
        '/interface/bridge/add',
        `=name=${bridgeName}`,
        '=auto-mac=yes',
        '=comment=SudaFi Hotspot Bridge',
      ];
      cmds.push(
        this.makeCmd(
          order++,
          'LAN_BRIDGE',
          `إنشاء جسر شبكة المشتركين (${bridgeName}) بدون MAC ثابت مكرر`,
          bridgeWords,
          { createdResourceType: 'bridge' },
        ),
      );
    }

    // Bind member ports safely (with optional horizon=1 client isolation)
    const horizonEnabled = config.securityPolicies?.clientIsolation !== false;
    for (const port of memberPorts) {
      const existsOnTarget =
        !isClean &&
        discovery.bridgePorts.find((bp) => bp.bridge === bridgeName && bp.interface === port);

      if (!existsOnTarget) {
        const words = ['/interface/bridge/port/add', `=bridge=${bridgeName}`, `=interface=${port}`];
        if (horizonEnabled) words.push('=horizon=1');
        words.push('=comment=SudaFi LAN Member');
        cmds.push(
          this.makeCmd(
            order++,
            'LAN_BRIDGE',
            `ضم المنفذ (${port}) إلى الجسر (${bridgeName})${horizonEnabled ? ' مع عزل Horizon=1' : ''}`,
            words,
            { createdResourceType: 'bridge-port' },
          ),
        );
      } else if (horizonEnabled && Number(existsOnTarget.horizon) !== 1 && existsOnTarget.id) {
        cmds.push(
          this.makeCmd(
            order++,
            'LAN_BRIDGE',
            `تحديث عزل المشتركين (Horizon=1) للمنفذ (${port})`,
            ['/interface/bridge/port/set', `=.id=${existsOnTarget.id}`, '=horizon=1'],
            {
              rollbackWords: [
                '/interface/bridge/port/set',
                `=.id=${existsOnTarget.id}`,
                '=horizon=none',
              ],
            },
          ),
        );
      }
    }

    return cmds;
  }

  buildIpAddressingCommands(input: AdapterStageCommandInput): PlannedCommandSpec[] {
    const { config, discovery } = input;
    const bridgeName = (config.lan.bridgeName || CANONICAL_DEFAULTS.BRIDGE_NAME).trim();
    const isClean = (config.template || 'CLEAN_SETUP') === 'CLEAN_SETUP';
    const gatewayIp = (config.lan.gatewayIp || CANONICAL_DEFAULTS.GATEWAY_IP).trim();
    const exists =
      !isClean &&
      discovery.ipAddresses.some(
        (ip) => ip.interface === bridgeName && ip.address === gatewayIp,
      );

    if (exists) return [];

    return [
      this.makeCmd(
        input.startOrder,
        'IP_ADDRESSING',
        `تعيين عنوان البوابة (${gatewayIp}) على الجسر (${bridgeName})`,
        [
          '/ip/address/add',
          `=address=${gatewayIp}`,
          `=interface=${bridgeName}`,
          '=comment=SudaFi Hotspot Gateway',
        ],
        { createdResourceType: 'ip-address' },
      ),
    ];
  }

  buildDhcpCommands(input: AdapterStageCommandInput): PlannedCommandSpec[] {
    const { config, discovery } = input;
    let order = input.startOrder;
    const cmds: PlannedCommandSpec[] = [];
    const bridgeName = (config.lan.bridgeName || CANONICAL_DEFAULTS.BRIDGE_NAME).trim();
    const gatewayCidr = (config.lan.gatewayIp || CANONICAL_DEFAULTS.GATEWAY_IP).trim();
    const cleanGatewayIp = gatewayCidr.split('/')[0];
    const networkCidr = this.extractNetworkCidr(gatewayCidr);
    const poolName = (config.lan.poolName || CANONICAL_DEFAULTS.POOL_NAME).trim();
    const poolRange =
      config.lan.poolRange?.trim() ||
      (gatewayCidr === CANONICAL_DEFAULTS.GATEWAY_IP
        ? CANONICAL_DEFAULTS.POOL_RANGE
        : this.generateDefaultPoolRange(gatewayCidr));
    const leaseTime = config.lan.dhcpLeaseTime?.trim() || CANONICAL_DEFAULTS.DHCP_LEASE_TIME;
    const dhcpServerName = (config.lan.dhcpServerName || CANONICAL_DEFAULTS.DHCP_SERVER_NAME).trim();
    const dnsList =
      config.lan.dnsServers && config.lan.dnsServers.length > 0
        ? config.lan.dnsServers.join(',')
        : `${cleanGatewayIp},8.8.8.8`;

    const isClean = (config.template || 'CLEAN_SETUP') === 'CLEAN_SETUP';

    if (isClean) {
      // Scoped cleanup: remove previous conflicting DHCP servers on target bridge/ports
      for (const ds of discovery.dhcpServers) {
        if (
          (ds.interface === bridgeName || (config.lan.memberInterfaces || []).includes(ds.interface)) &&
          ds.name !== dhcpServerName &&
          ds.id &&
          isValidRouterOsId(ds.id)
        ) {
          cmds.push(
            this.makeCmd(
              order++,
              'DHCP',
              `إزالة خادم DHCP السابق (${ds.name}) لمنع تعارض توزيع العناوين`,
              ['/ip/dhcp-server/remove', `=.id=${ds.id}`],
              { safeToRetry: false },
            ),
          );
        }
      }
    }

    if (isClean || !discovery.pools.some((p) => p.name === poolName)) {
      cmds.push(
        this.makeCmd(
          order++,
          'DHCP',
          `إنشاء نطاق عناوين IP Pool (${poolName}: ${poolRange})`,
          ['/ip/pool/add', `=name=${poolName}`, `=ranges=${poolRange}`, '=comment=SudaFi Hotspot Pool'],
          { createdResourceType: 'ip-pool' },
        ),
      );
    }

    if (isClean || !discovery.dhcpServers.some((s) => s.name === dhcpServerName)) {
      cmds.push(
        this.makeCmd(
          order++,
          'DHCP',
          `إنشاء خادم DHCP (${dhcpServerName}) على (${bridgeName})`,
          [
            '/ip/dhcp-server/add',
            `=name=${dhcpServerName}`,
            `=interface=${bridgeName}`,
            `=address-pool=${poolName}`,
            `=lease-time=${leaseTime}`,
            '=disabled=no',
            '=comment=SudaFi DHCP Server',
          ],
          { createdResourceType: 'dhcp-server' },
        ),
      );
    }

    if (isClean || !discovery.dhcpNetworks.some((n) => n.address === networkCidr)) {
      cmds.push(
        this.makeCmd(
          order++,
          'DHCP',
          `إعداد شبكة DHCP (${networkCidr}) مع البوابة (${cleanGatewayIp}) و DNS`,
          [
            '/ip/dhcp-server/network/add',
            `=address=${networkCidr}`,
            `=gateway=${cleanGatewayIp}`,
            `=dns-server=${dnsList}`,
            '=comment=SudaFi DHCP Network',
          ],
          { createdResourceType: 'dhcp-network' },
        ),
      );
    }

    return cmds;
  }

  buildDnsCommands(input: AdapterStageCommandInput): PlannedCommandSpec[] {
    const { config } = input;
    const servers =
      config.dns?.servers && config.dns.servers.length > 0
        ? config.dns.servers
        : config.wan.staticDns && config.wan.staticDns.length > 0
          ? config.wan.staticDns
          : ['8.8.8.8', '1.1.1.1'];
    const allowRemote = config.dns?.allowRemoteRequests !== false ? 'yes' : 'no';

    return [
      this.makeCmd(
        input.startOrder,
        'DNS',
        `تفعيل خدمة DNS وتعيين الخوادم (${servers.join(', ')}) لصفحة الدخول`,
        ['/ip/dns/set', `=servers=${servers.join(',')}`, `=allow-remote-requests=${allowRemote}`],
        { safeToRetry: true },
      ),
    ];
  }

  buildFirewallCommands(input: AdapterStageCommandInput): PlannedCommandSpec[] {
    const { config, discovery } = input;
    let order = input.startOrder;
    const cmds: PlannedCommandSpec[] = [];
    const bridgeName = (config.lan.bridgeName || 'bridge-hotspot').trim();
    const wanIface = (config.wan.renameInterfaceTo || config.wan.interface).trim();
    const sec = config.securityPolicies || {};
    const isClean = (config.template || 'CLEAN_SETUP') === 'CLEAN_SETUP';

    if (sec.antiTethering !== false) {
      const exists =
        !isClean &&
        discovery.mangleRules.some((r) => r.comment === 'SudaFi_Anti_Tethering_TTL');
      if (!exists) {
        cmds.push(
          this.makeCmd(
            order++,
            'FIREWALL',
            `تثبيت TTL=1 على شبكة (${bridgeName}) لمنع بث ومشاركة الكروت`,
            [
              '/ip/firewall/mangle/add',
              '=chain=postrouting',
              `=out-interface=${bridgeName}`,
              '=action=change-ttl',
              '=new-ttl=set:1',
              '=passthrough=yes',
              '=comment=SudaFi_Anti_Tethering_TTL',
            ],
            { createdResourceType: 'firewall-mangle' },
          ),
        );
      }
    }

    if (sec.protectManagementAccess !== false) {
      const exists =
        !isClean &&
        discovery.filterRules.some((r) => r.comment === 'SudaFi_Drop_Subscriber_Admin_Ports');
      if (!exists) {
        cmds.push(
          this.makeCmd(
            order++,
            'FIREWALL',
            `حجب منافذ الإدارة (22,23,8291,8728,8729) عن شبكة المشتركين (${bridgeName})`,
            [
              '/ip/firewall/filter/add',
              '=chain=input',
              `=in-interface=${bridgeName}`,
              '=protocol=tcp',
              '=dst-port=22,23,8291,8728,8729',
              '=action=drop',
              '=comment=SudaFi_Drop_Subscriber_Admin_Ports',
            ],
            { createdResourceType: 'firewall-filter' },
          ),
        );
      }
    }

    if (sec.protectWanAccess) {
      const acceptExists =
        !isClean &&
        discovery.filterRules.some((r) => r.comment === 'SudaFi_Accept_Established_Related');
      if (!acceptExists) {
        cmds.push(
          this.makeCmd(
            order++,
            'FIREWALL',
            'السماح للاتصالات القائمة (established,related) لحماية جلسة الإدارة عن بُعد',
            [
              '/ip/firewall/filter/add',
              '=chain=input',
              '=connection-state=established,related',
              '=action=accept',
              '=comment=SudaFi_Accept_Established_Related',
            ],
            { createdResourceType: 'firewall-filter' },
          ),
        );
      }
      const wanDropExists =
        !isClean &&
        discovery.filterRules.some((r) => r.comment === 'SudaFi_Drop_WAN_Admin_Ports');
      if (!wanDropExists) {
        cmds.push(
          this.makeCmd(
            order++,
            'FIREWALL',
            `حجب منافذ الإدارة غير المصرح بها من جهة WAN (${wanIface})`,
            [
              '/ip/firewall/filter/add',
              '=chain=input',
              `=in-interface=${wanIface}`,
              '=protocol=tcp',
              '=dst-port=22,23,8291,8728,8729',
              '=action=drop',
              '=comment=SudaFi_Drop_WAN_Admin_Ports',
            ],
            { createdResourceType: 'firewall-filter' },
          ),
        );
      }
    }

    return cmds;
  }

  buildNatCommands(input: AdapterStageCommandInput): PlannedCommandSpec[] {
    const { config, discovery } = input;
    let order = input.startOrder;
    const cmds: PlannedCommandSpec[] = [];
    const bridgeName = (config.lan.bridgeName || 'bridge-hotspot').trim();
    const wanIface = (config.wan.renameInterfaceTo || config.wan.interface).trim();
    const outIface = config.wan.mode === 'PPPOE' ? 'pppoe-out1' : wanIface;
    const isClean = (config.template || 'CLEAN_SETUP') === 'CLEAN_SETUP';

    if (config.wan.enableNat !== false) {
      const natExists =
        !isClean &&
        discovery.natRules.some((r) => r.action === 'masquerade' && r.outInterface === outIface);
      if (!natExists) {
        cmds.push(
          this.makeCmd(
            order++,
            'NAT',
            `تفعيل تحويل العناوين NAT Masquerade نحو (${outIface})`,
            [
              '/ip/firewall/nat/add',
              '=chain=srcnat',
              `=out-interface=${outIface}`,
              '=action=masquerade',
              '=comment=SudaFi NAT Masquerade',
            ],
            { createdResourceType: 'firewall-nat' },
          ),
        );
      }
    }

    if (config.securityPolicies?.forceRouterDns !== false) {
      if (isClean || !discovery.natRules.some((r) => r.comment === 'SudaFi_Force_DNS_UDP')) {
        cmds.push(
          this.makeCmd(
            order++,
            'NAT',
            'إعادة توجيه طلبات DNS (UDP 53) إلى كاش الراوتر',
            [
              '/ip/firewall/nat/add',
              '=chain=dstnat',
              `=in-interface=${bridgeName}`,
              '=protocol=udp',
              '=dst-port=53',
              '=action=redirect',
              '=comment=SudaFi_Force_DNS_UDP',
            ],
            { createdResourceType: 'firewall-nat' },
          ),
        );
      }
      if (isClean || !discovery.natRules.some((r) => r.comment === 'SudaFi_Force_DNS_TCP')) {
        cmds.push(
          this.makeCmd(
            order++,
            'NAT',
            'إعادة توجيه طلبات DNS (TCP 53) لمنع تجاوز صفحة الدخول',
            [
              '/ip/firewall/nat/add',
              '=chain=dstnat',
              `=in-interface=${bridgeName}`,
              '=protocol=tcp',
              '=dst-port=53',
              '=action=redirect',
              '=comment=SudaFi_Force_DNS_TCP',
            ],
            { createdResourceType: 'firewall-nat' },
          ),
        );
      }
    }

    return cmds;
  }

  abstract buildWirelessCommands(input: AdapterStageCommandInput): PlannedCommandSpec[];

  buildHotspotCommands(input: AdapterStageCommandInput): PlannedCommandSpec[] {
    const { config, discovery } = input;
    let order = input.startOrder;
    const cmds: PlannedCommandSpec[] = [];
    const bridgeName = (config.lan.bridgeName || CANONICAL_DEFAULTS.BRIDGE_NAME).trim();
    const cleanGatewayIp = (config.lan.gatewayIp || CANONICAL_DEFAULTS.GATEWAY_IP).trim().split('/')[0];
    const serverProfileName = config.hotspot?.serverProfileName?.trim() || CANONICAL_DEFAULTS.HOTSPOT_PROFILE_NAME;
    const hsServerName = config.hotspot?.serverName?.trim() || CANONICAL_DEFAULTS.HOTSPOT_SERVER_NAME;
    const poolName = (config.lan.poolName || CANONICAL_DEFAULTS.POOL_NAME).trim();
    const dnsName = config.hotspot?.dnsName?.trim() || 'login.sudafi.net';
    const htmlDir = config.hotspot?.htmlDirectory?.trim() || 'hotspot';
    const loginBy = config.hotspot?.loginBy?.trim() || 'mac,cookie,http-chap,http-pap,mac-cookie';
    const cookieLifetime = config.hotspot?.cookieLifetime?.trim() || CANONICAL_DEFAULTS.COOKIE_TIMEOUT;
    const isClean = (config.template || 'CLEAN_SETUP') === 'CLEAN_SETUP';

    if (isClean) {
      // Scoped cleanup of prior conflicting hotspot servers to prevent duplicate running instances
      for (const hs of discovery.hotspotServers) {
        if (hs.name !== hsServerName && hs.id && isValidRouterOsId(hs.id)) {
          cmds.push(
            this.makeCmd(
              order++,
              'HOTSPOT',
              `إزالة خادم الهوتسبوت السابق (${hs.name}) لتفادي تكرار وتشابك البرمجة`,
              ['/ip/hotspot/remove', `=.id=${hs.id}`],
              { safeToRetry: false },
            ),
          );
        }
      }
      for (const prof of discovery.hotspotServerProfiles) {
        if (prof.name !== 'default' && prof.name !== serverProfileName && prof.id && isValidRouterOsId(prof.id)) {
          cmds.push(
            this.makeCmd(
              order++,
              'HOTSPOT',
              `إزالة بروفايل خادم الهوتسبوت القديم (${prof.name})`,
              ['/ip/hotspot/profile/remove', `=.id=${prof.id}`],
              { safeToRetry: false },
            ),
          );
        }
      }
    }

    const srvProfileExists =
      !isClean && discovery.hotspotServerProfiles.some((p) => p.name === serverProfileName);
    if (!srvProfileExists) {
      cmds.push(
        this.makeCmd(
          order++,
          'HOTSPOT',
          `إنشاء ملف تعريف خادم الهوتسبوت (${serverProfileName}) مع تفعيل Cookie (${cookieLifetime})`,
          [
            '/ip/hotspot/profile/add',
            `=name=${serverProfileName}`,
            `=hotspot-address=${cleanGatewayIp}`,
            `=dns-name=${dnsName}`,
            `=html-directory=${htmlDir}`,
            `=login-by=${loginBy}`,
            `=http-cookie-lifetime=${cookieLifetime}`,
            '=use-radius=no',
          ],
          { createdResourceType: 'hotspot-profile' },
        ),
      );
    }

    const hsServerExists =
      !isClean &&
      discovery.hotspotServers.some(
        (s) => s.name === hsServerName || s.interface === bridgeName,
      );
    if (!hsServerExists) {
      cmds.push(
        this.makeCmd(
          order++,
          'HOTSPOT',
          `تشغيل خادم الهوتسبوت (${hsServerName}) على (${bridgeName})`,
          [
            '/ip/hotspot/add',
            `=name=${hsServerName}`,
            `=interface=${bridgeName}`,
            `=address-pool=${poolName}`,
            `=profile=${serverProfileName}`,
            '=disabled=no',
          ],
          { createdResourceType: 'hotspot-server' },
        ),
      );
    }

    cmds.push(
      this.makeCmd(
        order++,
        'HOTSPOT',
        `السماح بالوصول لبوابة الدخول (${cleanGatewayIp}) في Walled Garden`,
        [
          '/ip/hotspot/walled-garden/ip/add',
          `=dst-address=${cleanGatewayIp}`,
          '=action=accept',
          '=comment=SudaFi Allow Gateway',
        ],
        { createdResourceType: 'walled-garden-ip' },
      ),
    );
    cmds.push(
      this.makeCmd(
        order++,
        'HOTSPOT',
        'السماح بنطاق منصة SudaFi السحابية في Walled Garden',
        [
          '/ip/hotspot/walled-garden/add',
          '=dst-host=*sudafi*',
          '=action=allow',
          '=comment=SudaFi Allow Platform',
        ],
        { createdResourceType: 'walled-garden' },
      ),
    );

    return cmds;
  }

  abstract buildUserProfileCommands(input: AdapterStageCommandInput): PlannedCommandSpec[];

  buildQueueCommands(input: AdapterStageCommandInput): PlannedCommandSpec[] {
    const { config, discovery } = input;
    if (config.queues?.enabled === false) return [];

    let order = input.startOrder;
    const cmds: PlannedCommandSpec[] = [];
    const customName = config.queues?.customQueueName?.trim() || CANONICAL_DEFAULTS.SFQ_QUEUE_NAME;

    if (!discovery.queueTypes.some((q) => q.name === customName)) {
      cmds.push(
        this.makeCmd(
          order++,
          'QUEUES',
          `إنشاء نوع طابور عادل (SFQ) باسم (${customName}) لمنع احتكار السرعة`,
          ['/queue/type/add', `=name=${customName}`, '=kind=sfq'],
          { createdResourceType: 'queue-type' },
        ),
      );
    }

    if (config.queues?.applySfqToDefaults) {
      const candidateDefaults = ['default', 'default-small', 'hotspot-default'];
      for (const qName of candidateDefaults) {
        const found = discovery.queueTypes.find((q) => q.name === qName);
        if (found && found.kind !== 'sfq' && found.id && isValidRouterOsId(found.id)) {
          cmds.push(
            this.makeCmd(
              order++,
              'QUEUES',
              `ضبط نوع الطابور القائم (${qName}) إلى SFQ لتوزيع العدالة`,
              ['/queue/type/set', `=.id=${found.id}`, '=kind=sfq'],
              {
                rollbackWords: ['/queue/type/set', `=.id=${found.id}`, `=kind=${found.kind}`],
              },
            ),
          );
        }
      }
    }

    return cmds;
  }

  abstract buildSchedulerAndSystemCommands(input: AdapterStageCommandInput): PlannedCommandSpec[];
}
