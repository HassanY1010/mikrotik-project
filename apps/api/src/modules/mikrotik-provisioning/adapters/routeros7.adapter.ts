import { BaseRouterOsAdapter } from './base-routeros.adapter';
import type { AdapterStageCommandInput } from './routeros-adapter.interface';
import type { PlannedCommandSpec, RouterOsMajorFamily } from '../interfaces/auto-provisioning.interface';
import { isValidRouterOsId } from '../../../core/security/snapshot-integrity.util';

/**
 * RouterOS 7.x Adapter:
 * - Feature-detected WiFi paths: wifi-qcom/7.13+ (/interface/wifi), 7.0-7.12 (/interface/wifiwave2),
 *   or legacy wireless package (/interface/wireless) if installed.
 * - ROS7 /system/ntp/client/set + /system/ntp/client/servers/add (no primary-ntp legacy attr)
 * - ROS7 safe export flags and user profile attributes
 */
export class RouterOs7Adapter extends BaseRouterOsAdapter {
  readonly family: RouterOsMajorFamily = 'ROS7';

  buildWirelessCommands(input: AdapterStageCommandInput): PlannedCommandSpec[] {
    const { config, capabilities, discovery } = input;
    if (!config.wireless?.enabled || capabilities.wirelessStack === 'NONE') {
      return [];
    }

    let order = input.startOrder;
    const cmds: PlannedCommandSpec[] = [];
    const ssid = config.wireless.ssid?.trim() || 'SudaFi-Hotspot';
    const country = config.wireless.country?.trim();
    const pass = config.wireless.password?.trim();

    if (capabilities.wirelessStack === 'WIFI_QCOM' || capabilities.wirelessStack === 'WIFIWAVE2') {
      const basePath =
        capabilities.wirelessStack === 'WIFIWAVE2' ? '/interface/wifiwave2' : '/interface/wifi';
      const candidateIfaces =
        config.wireless.interfaceNames && config.wireless.interfaceNames.length > 0
          ? config.wireless.interfaceNames.filter((n) =>
              discovery.wifiInterfaces.some((w) => w.name === n || w.defaultName === n),
            )
          : discovery.wifiInterfaces.map((w) => w.name);

      for (const ifaceName of candidateIfaces) {
        const matched = discovery.wifiInterfaces.find(
          (w) => w.name === ifaceName || w.defaultName === ifaceName,
        );
        const targetRef =
          matched?.id && isValidRouterOsId(matched.id) ? `=.id=${matched.id}` : `=numbers=${ifaceName}`;

        const words = [
          `${basePath}/set`,
          targetRef,
          '=disabled=no',
          '=configuration.mode=ap',
          `=configuration.ssid=${ssid}`,
        ];
        if (country) {
          words.push(`=configuration.country=${country}`);
        }
        if (pass && pass.length >= 8) {
          words.push('=security.authentication-types=wpa2-psk,wpa3-psk');
          words.push(`=security.passphrase=${pass}`);
        }

        const wifiRbWords = matched
          ? [
              `${basePath}/set`,
              targetRef,
              `=disabled=${matched.disabled ? 'yes' : 'no'}`,
              ...(matched.ssid ? [`=configuration.ssid=${matched.ssid}`] : []),
              ...(matched.mode ? [`=configuration.mode=${matched.mode}`] : []),
            ]
          : undefined;

        cmds.push(
          this.makeCmd(
            order++,
            'WIRELESS_WIFI',
            `تهيئة بث WiFi (${ifaceName}) عبر ${basePath} باسم (${ssid})`,
            words,
            { rollbackWords: wifiRbWords },
          ),
        );
      }
      return cmds;
    }

    // Legacy wireless package installed on RouterOS 7
    if (capabilities.wirelessStack === 'LEGACY_WIRELESS' && discovery.wirelessInterfaces.length > 0) {
      let securityProfile = 'default';
      if (pass && pass.length >= 8) {
        securityProfile = 'sudafi-wifi-sec';
        cmds.push(
          this.makeCmd(
            order++,
            'WIRELESS_WIFI',
            `إنشاء ملف حماية Wireless WPA2 (${securityProfile}) على ROS7`,
            [
              '/interface/wireless/security-profiles/add',
              `=name=${securityProfile}`,
              '=mode=dynamic-keys',
              '=authentication-types=wpa2-psk',
              `=wpa2-pre-shared-key=${pass}`,
            ],
            { createdResourceType: 'wireless-security-profile' },
          ),
        );
      }
      for (const w of discovery.wirelessInterfaces) {
        const ref = w.id && isValidRouterOsId(w.id) ? `=.id=${w.id}` : `=numbers=${w.name}`;
        const words = [
          '/interface/wireless/set',
          ref,
          '=disabled=no',
          '=mode=ap-bridge',
          `=ssid=${ssid}`,
          `=security-profile=${securityProfile}`,
        ];
        if (config.wireless.disableWps !== false) words.push('=wps-mode=disabled');
        if (country) words.push(`=country=${country.toLowerCase()}`);

        const wlRbWords = [
          '/interface/wireless/set',
          ref,
          `=disabled=${w.disabled ? 'yes' : 'no'}`,
          ...(w.ssid ? [`=ssid=${w.ssid}`] : []),
          ...(w.mode ? [`=mode=${w.mode}`] : []),
          ...(w.securityProfile ? [`=security-profile=${w.securityProfile}`] : []),
        ];
        cmds.push(
          this.makeCmd(
            order++,
            'WIRELESS_WIFI',
            `تهيئة واجهة Wireless (${w.name}) باسم (${ssid})`,
            words,
            { rollbackWords: wlRbWords },
          ),
        );
      }
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
      ];
      if (config.hotspot?.enableLocalUsageScript) {
        words.push(
          '=on-login=:local d [/system clock get date]; :log info ("SudaFi ROS7 login " . $user . " at " . $d);',
          '=on-logout=:local d [/system clock get date]; :log info ("SudaFi ROS7 logout " . $user . " at " . $d . " cause=" . $cause);',
        );
      }
      cmds.push(
        this.makeCmd(
          order++,
          'USER_PROFILES',
          `إنشاء بروفايل مشتركين متوافق مع ROS7 (${hsProfileName}) بسرعة (${rateLimit})`,
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
          `تحديث خصائص البروفايل القائم (${hsProfileName}) على RouterOS 7`,
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

    if (config.system?.ntpEnabled && capabilities.ntpStack === 'NTP_V7') {
      cmds.push(
        this.makeCmd(
          order++,
          'SCHEDULER_MONITORING',
          'تفعيل عميل NTP في RouterOS 7',
          ['/system/ntp/client/set', '=enabled=yes'],
        ),
      );
      const servers = config.system.ntpServers?.length
        ? config.system.ntpServers
        : ['time.google.com'];
      for (const srv of servers) {
        cmds.push(
          this.makeCmd(
            order++,
            'SCHEDULER_MONITORING',
            `إضافة خادم التوقيت NTP (${srv}) في جدول ROS 7`,
            ['/system/ntp/client/servers/add', `=address=${srv}`],
            { createdResourceType: 'ntp-server' },
          ),
        );
      }
    }

    if (config.system?.hideLoginNote) {
      cmds.push(
        this.makeCmd(
          order++,
          'SCHEDULER_MONITORING',
          'إخفاء رسالة الدخول النظامية (System Note)',
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
            `جدولة نسخ احتياطي تلقائي كل (${interval})`,
            [
              '/system/scheduler/add',
              `=name=${schedName}`,
              `=interval=${interval}`,
              '=on-event=/export show-sensitive=no file=sudafi-auto-latest',
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
          `تفعيل مراقبة الاتصال Netwatch نحو (${host})`,
          ['/tool/netwatch/add', `=host=${host}`, `=interval=${interval}`, '=comment=SudaFi WAN Monitor'],
          { createdResourceType: 'netwatch' },
        ),
      );
    }

    return cmds;
  }
}
