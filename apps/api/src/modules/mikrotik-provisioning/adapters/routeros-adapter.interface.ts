import type {
  FullRouterDiscoveryReport,
  PlannedCommandSpec,
  RouterCapabilities,
  RouterOsMajorFamily,
} from '../interfaces/auto-provisioning.interface';
import type { AutoProvisionConfigDto } from '../dto/auto-provisioning.dto';

export interface AdapterStageCommandInput {
  config: AutoProvisionConfigDto;
  discovery: FullRouterDiscoveryReport;
  capabilities: RouterCapabilities;
  startOrder: number;
}

export interface IRouterOsAdapter {
  readonly family: RouterOsMajorFamily;

  buildWanCommands(input: AdapterStageCommandInput): PlannedCommandSpec[];
  buildLanBridgeCommands(input: AdapterStageCommandInput): PlannedCommandSpec[];
  buildIpAddressingCommands(input: AdapterStageCommandInput): PlannedCommandSpec[];
  buildDhcpCommands(input: AdapterStageCommandInput): PlannedCommandSpec[];
  buildDnsCommands(input: AdapterStageCommandInput): PlannedCommandSpec[];
  buildFirewallCommands(input: AdapterStageCommandInput): PlannedCommandSpec[];
  buildNatCommands(input: AdapterStageCommandInput): PlannedCommandSpec[];
  buildWirelessCommands(input: AdapterStageCommandInput): PlannedCommandSpec[];
  buildHotspotCommands(input: AdapterStageCommandInput): PlannedCommandSpec[];
  buildUserProfileCommands(input: AdapterStageCommandInput): PlannedCommandSpec[];
  buildQueueCommands(input: AdapterStageCommandInput): PlannedCommandSpec[];
  buildSchedulerAndSystemCommands(input: AdapterStageCommandInput): PlannedCommandSpec[];
}
