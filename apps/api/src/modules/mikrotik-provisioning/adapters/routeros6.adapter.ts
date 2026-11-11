import { BaseRouterOsAdapter } from './base-routeros.adapter';
import type { AdapterStageCommandInput } from './routeros-adapter.interface';
import type { PlannedCommandSpec, RouterOsMajorFamily } from '../interfaces/auto-provisioning.interface';
import { isValidIpv4Cidr, isValidRouterOsId } from '../../../core/security/snapshot-integrity.util';

/**
 * RouterOS 6.x Adapter:
 * - Legacy /interface/wireless (requires wireless package + interfaces)
 * - SNTP / NTP package v6 syntax (=primary-ntp / =secondary-ntp)
 * - ROS6 user profile properties (!mac-cookie-timeout avoided in API, explicit attributes)
 */
export class RouterOs6Adapter extends BaseRouterOsAdapter {
  readonly family: RouterOsMajorFamily = 'ROS6';

  buildWirelessCommands(input: AdapterStageCommandInput): PlannedCommandSpec[] {
    const { config, capabilities, discovery } = input;
    if (!config.wireless?.enabled || !capabilities.supportsWireless) {
      return [];
    }

    let order = input.startOrder;
    const cmds: PlannedCommandSpec[] = [];
    const targetNames =
      config.wireless.interfaceNames && config.wireless.interfaceNames.length > 0
        ? config.wireless.interfaceNames.filter((n) =>
            discovery.wirelessInterfaces.some((w) => w.name === n || w.defaultName === n),
          )
        : discovery.wirelessInterfaces.map((w) => w.name);

    if (targetNames.length === 0) return [];

    let securityProfile = 'default';
    if (config.wireless.password && config.wireless.password.trim().length >= 8) {
      securityProfile = 'sudafi-wifi-sec';
      cmds.push(
        this.makeCmd(
          order++,
          'WIRELESS_WIFI',
          `إنشاء ملف حماية WiFi WPA2 (${securityProfile}) على RouterOS 6`,
          [
            '/interface/wireless/security-profiles/add',
            `=name=${securityProfile}`,
            '=mode=dynamic-keys',
            '=authentication-types=wpa2-psk',
            `=wpa2-pre-shared-key=${config.wireless.password.trim()}`,
          ],
          { createdResourceType: 'wireless-security-profile' },
        ),
      );
    }

    const ssid = config.wireless.ssid?.trim() || 'SudaFi-Hotspot';
    for (const ifaceName of targetNames) {
      const matched = discovery.wirelessInterfaces.find(
        (w) => w.name === ifaceName || w.defaultName === ifaceName,
      );
      const idOrNum = matched?.id && isValidRouterOsId(matched.id) ? `=.id=${matched.id}` : `=numbers=${ifaceName}`;
      const words = [
        '/interface/wireless/set',
        idOrNum,
        '=disabled=no',
        '=mode=ap-bridge',
        `=ssid=${ssid}`,
        `=security-profile=${securityProfile}`,
      ];
      if (config.wireless.disableWps !== false) words.push('=wps-mode=disabled');
      if (config.wireless.country?.trim()) words.push(`=country=${config.wireless.country.trim().toLowerCase()}`);

      const rbWords = matched
        ? [
            '/interface/wireless/set',
            idOrNum,
            `=disabled=${matched.disabled ? 'yes' : 'no'}`,
            ...(matched.ssid ? [`=ssid=${matched.ssid}`] : []),
            ...(matched.mode ? [`=mode=${matched.mode}`] : []),
            ...(matched.securityProfile ? [`=security-profile=${matched.securityProfile}`] : []),
          ]
        : undefined;

      cmds.push(
        this.makeCmd(
          order++,
          'WIRELESS_WIFI',
          `تهيئة بث الوايرلس (${ifaceName}) على RouterOS 6 باسم الشبكة (${ssid})`,
          words,
          { rollbackWords: rbWords },
        ),
      );
    }

    return cmds;
  }

  buildUserProfileCommands(input: AdapterStageCommandInput): PlannedCommandSpec[] {
    const { config, discovery } = input;
    let order = input.startOrder;
    const cmds: PlannedCommandSpec[] = [];
    const isClean = (config.template || 'CLEAN_SETUP') === 'CLEAN_SETUP';
    const hsProfileName = config.hotspot?.userProfileName?.trim() || 'hsp-sudafi';
    const rateLimit = config.hotspot?.defaultRateLimit?.trim() || '2M/5M';
    const sharedUsers =
      config.securityPolicies?.enforceSingleDevice === false
        ? String(config.hotspot?.sharedUsers || 1)
        : '1';
    const keepalive = config.hotspot?.keepaliveTimeout?.trim() || '2m';

    const existingProf = !isClean
      ? discovery.hotspotUserProfiles.find((p) => p.name === hsProfileName)
      : undefined;

    if (!existingProf) {
      const words = [
        '/ip/hotspot/user/profile/add',
        `=name=${hsProfileName}`,
        `=rate-limit=${rateLimit}`,
        `=shared-users=${sharedUsers}`,
        `=keepalive-timeout=${keepalive}`,
        '=status-autorefresh=1m',
        '=transparent-proxy=no',
        '=add-mac-cookie=yes',
        '=mac-cookie-timeout=1d',
        '=comment=SudaFi ROS6 User Profile',
      ];
      if (config.hotspot?.enableLocalUsageScript) {
        words.push(
          '=on-login=:local u $user; :log info ("SudaFi login " . $u);',
          '=on-logout=:local u $user; :log info ("SudaFi logout " . $u . " cause=" . $cause);',
        );
      }
      cmds.push(
        this.makeCmd(
          order++,
          'USER_PROFILES',
          `إنشاء بروفايل مشتركين متوافق مع ROS6 (${hsProfileName}) بسرعة (${rateLimit})`,
          words,
          { createdResourceType: 'hotspot-user-profile' },
        ),
      );
    } else if (existingProf.id && isValidRouterOsId(existingProf.id)) {
      const profRbWords = ['/ip/hotspot/user/profile/set', `=.id=${existingProf.id}`];
      if (existingProf.rateLimit !== undefined) profRbWords.push(`=rate-limit=${existingProf.rateLimit}`);
      if (existingProf.sharedUsers !== undefined) profRbWords.push(`=shared-users=${existingProf.sharedUsers}`);
      if (existingProf.keepaliveTimeout !== undefined) {
        profRbWords.push(`=keepalive-timeout=${existingProf.keepaliveTimeout}`);
      }
      cmds.push(
        this.makeCmd(
          order++,
          'USER_PROFILES',
          `تحديث خصائص البروفايل القائم (${hsProfileName}) على RouterOS 6`,
          [
            '/ip/hotspot/user/profile/set',
            `=.id=${existingProf.id}`,
            `=rate-limit=${rateLimit}`,
            `=shared-users=${sharedUsers}`,
            `=keepalive-timeout=${keepalive}`,
            '=status-autorefresh=1m',
            '=transparent-proxy=no',
          ],
          { rollbackWords: profRbWords },
        ),
      );
    }

    return cmds;
  }

  buildSchedulerAndSystemCommands(input: AdapterStageCommandInput): PlannedCommandSpec[] {
    const { config, capabilities, discovery } = input;
    let order = input.startOrder;
    const cmds: PlannedCommandSpec[] = [];

    if (config.system?.identity?.trim()) {
      cmds.push(
        this.makeCmd(
          order++,
          'SCHEDULER_MONITORING',
          `تعيين هوية الراوتر (${config.system.identity.trim()})`,
          ['/system/identity/set', `=name=${config.system.identity.trim()}`],
        ),
      );
    }

    if (config.system?.timezone?.trim()) {
      cmds.push(
        this.makeCmd(
          order++,
          'SCHEDULER_MONITORING',
          `ضبط المنطقة الزمنية (${config.system.timezone.trim()})`,
          ['/system/clock/set', `=time-zone-name=${config.system.timezone.trim()}`],
        ),
      );
    }

    if (config.system?.ntpEnabled && capabilities.ntpStack !== 'NONE') {
      const ntpServers = config.system.ntpServers || [];
      const ipv4Servers = ntpServers.filter((s) => isValidIpv4Cidr(s) && !s.includes('/'));
      const dnsServers = ntpServers.filter((s) => !ipv4Servers.includes(s));
      const ntpWords = ['/system/ntp/client/set', '=enabled=yes'];
      if (ipv4Servers[0]) ntpWords.push(`=primary-ntp=${ipv4Servers[0]}`);
      if (ipv4Servers[1]) ntpWords.push(`=secondary-ntp=${ipv4Servers[1]}`);
      if (dnsServers.length > 0 && capabilities.ntpStack === 'SNTP_V6') {
        ntpWords.push(`=server-dns-names=${dnsServers.join(',')}`);
      }
      cmds.push(
        this.makeCmd(
          order++,
          'SCHEDULER_MONITORING',
          'تفعيل مزامنة الوقت NTP/SNTP بصيغة RouterOS 6',
          ntpWords,
        ),
      );
    }

    if (config.system?.hideLoginNote) {
      cmds.push(
        this.makeCmd(
          order++,
          'SCHEDULER_MONITORING',
          'إخفاء رسالة الملاحظات عند تسجيل الدخول',
          ['/system/note/set', '=show-at-login=no'],
        ),
      );
    }

    if (config.scheduler?.enableAutoBackupSchedule && capabilities.supportsScheduler) {
      const interval = config.scheduler.autoBackupInterval?.trim() || '12h';
      const schedName = 'sudafi-auto-backup';
      if (!discovery.schedulers.some((s) => s.name === schedName)) {
        cmds.push(
          this.makeCmd(
            order++,
            'SCHEDULER_MONITORING',
            `جدولة نسخ احتياطي دوري كل (${interval}) دون أخطاء سكربت`,
            [
              '/system/scheduler/add',
              `=name=${schedName}`,
              `=interval=${interval}`,
              '=on-event=/export file=sudafi-auto-latest',
              '=comment=SudaFi Auto Backup Schedule',
            ],
            { createdResourceType: 'scheduler' },
          ),
        );
      }
    }

    if (config.scheduler?.enableNetwatch && capabilities.supportsNetwatch) {
      const host = config.scheduler.netwatchHost?.trim() || '8.8.8.8';
      const interval = config.scheduler.netwatchInterval?.trim() || '1m';
      cmds.push(
        this.makeCmd(
          order++,
          'SCHEDULER_MONITORING',
          `تفعيل مراقبة الاتصال Netwatch لهدف (${host})`,
          ['/tool/netwatch/add', `=host=${host}`, `=interval=${interval}`, '=comment=SudaFi WAN Monitor'],
          { createdResourceType: 'netwatch' },
        ),
      );
    }

    return cmds;
  }
}
