import { Injectable } from '@nestjs/common';
import type { IRouterOsAdapter } from '../adapters/routeros-adapter.interface';
import { RouterOs6Adapter } from '../adapters/routeros6.adapter';
import { RouterOs7Adapter } from '../adapters/routeros7.adapter';
import type { RouterCapabilities, RouterOsMajorFamily } from '../interfaces/auto-provisioning.interface';

@Injectable()
export class RouterCompatibilityService {
  private readonly ros6Adapter = new RouterOs6Adapter();
  private readonly ros7Adapter = new RouterOs7Adapter();

  /**
   * Resolves the correct adapter from detected RouterOS family and actual feature flags.
   */
  resolveAdapter(capabilities: RouterCapabilities): IRouterOsAdapter {
    const family: RouterOsMajorFamily = capabilities.osFamily;
    if (family === 'ROS6') {
      return this.ros6Adapter;
    }
    return this.ros7Adapter;
  }

  /**
   * Evaluates whether an individual capability is satisfied for a stage before planning.
   */
  checkRequiredCapability(
    requiredKey: string,
    capabilities: RouterCapabilities,
  ): { satisfied: boolean; reason?: string } {
    switch (requiredKey) {
      case 'HOTSPOT':
        return capabilities.supportsHotspot
          ? { satisfied: true }
          : { satisfied: false, reason: 'حزمة Hotspot غير مثبّتة أو معطلة على الراوتر.' };
      case 'WIRELESS_OR_WIFI':
        return capabilities.supportsWifi || capabilities.supportsWireless
          ? { satisfied: true }
          : { satisfied: false, reason: 'الراوتر لا يحتوي على واجهات أو حزمة WiFi/Wireless نشطة.' };
      case 'QUEUES':
        return capabilities.supportsQueueTypes
          ? { satisfied: true }
          : { satisfied: false, reason: 'ميزة Queue Types غير متاحة على هذا الجهاز.' };
      case 'SCHEDULER':
        return capabilities.supportsScheduler
          ? { satisfied: true }
          : { satisfied: false, reason: 'ميزة System Scheduler غير متاحة.' };
      default:
        return { satisfied: true };
    }
  }
}
