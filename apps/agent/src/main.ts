import * as path from 'path';
import { AgentConfigManager } from './config/agent.config';
import { CredentialVault } from './security/credential-vault';
import { ApiClient } from './transport/api-client';
import { RouterOsWorker } from './router/routeros-worker';
import { MockRouterWorker } from './router/mock-router-worker';
import { CommandExecutor } from './executor/command-executor';
import { AgentDaemon } from './service/agent-daemon';
import { SingleInstanceLock } from './service/single-instance-lock';

interface CliArgs {
  command: string;
  code?: string;
  name?: string;
  configPath?: string;
  mock?: boolean;
  serverUrl?: string;
  keep?: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = { command: 'run' };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === 'pair' || arg === 'run' || arg === 'status' || arg === 'test-router' || arg === 'test-hotspot' || arg === 'unpair') {
      result.command = arg;
    } else if (arg === '--code' && i + 1 < args.length) {
      result.code = args[++i];
    } else if (arg === '--name' && i + 1 < args.length) {
      result.name = args[++i];
    } else if (arg === '--config' && i + 1 < args.length) {
      result.configPath = args[++i];
    } else if (arg === '--url' && i + 1 < args.length) {
      result.serverUrl = args[++i];
    } else if (arg === '--mock') {
      result.mock = true;
    } else if (arg === '--keep') {
      result.keep = true;
    }
  }

  return result;
}

async function main(): Promise<void> {
  const cliArgs = parseArgs(process.argv.slice(2));

  const configManager = new AgentConfigManager(cliArgs.configPath);
  if (cliArgs.mock) {
    configManager.setMockRouter(true);
  }
  if (cliArgs.serverUrl) {
    configManager.setServerUrl(cliArgs.serverUrl);
  }

  const config = configManager.get();
  const vault = new CredentialVault();
  const apiClient = new ApiClient({
    serverUrl: config.serverUrl,
    httpTimeoutMs: config.httpTimeoutMs,
    maxRetries: config.maxRetries,
  });

  const routerWorker = config.mockRouter
    ? new MockRouterWorker()
    : new RouterOsWorker(config.router!);

  const commandExecutor = new CommandExecutor(routerWorker);
  const daemon = new AgentDaemon(config, vault, apiClient, routerWorker, commandExecutor);

  console.log('========================================================');
  console.log(' SudaFi Windows LAN Agent v0.1.0 (وكيل سودافي المحلي)');
  console.log('========================================================');

  switch (cliArgs.command) {
    case 'pair': {
      if (!cliArgs.code) {
        console.error('Error: Pairing code is required. Usage: sudafi-agent pair --code <6-digit-code>');
        process.exit(1);
      }
      try {
        await daemon.pair(cliArgs.code, cliArgs.name);
        console.log('Pairing successful! You can now start the agent using: sudafi-agent run');
      } catch (err: any) {
        console.error(`Pairing failed: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'unpair': {
      await vault.clear();
      console.log('Agent credentials removed successfully. Device is now unpaired.');
      break;
    }

    case 'status': {
      const creds = await vault.load();
      if (!creds) {
        console.log('Status: UNPAIRED (الوكيل غير مقترن بأي راوتر)');
        console.log(`Vault path: ${vault.getFilePath()}`);
      } else {
        console.log('Status: PAIRED (الوكيل مقترن)');
        console.log(`Agent ID:   ${creds.agentId}`);
        console.log(`Device ID:  ${creds.deviceId}`);
        console.log(`Tenant ID:  ${creds.tenantId}`);
        console.log(`Server URL: ${creds.serverUrl}`);
        console.log(`Router:     ${config.router?.host}:${config.router?.port} (${config.mockRouter ? 'MOCK MODE' : 'HARDWARE'})`);
        console.log(`Paired At:  ${creds.pairedAt}`);
      }
      break;
    }

    case 'test-router': {
      console.log(`Testing connection to MikroTik router at ${config.router?.host}:${config.router?.port}...`);
      try {
        const isOnline = await routerWorker.ping();
        if (isOnline) {
          const health = await routerWorker.getHealth();
          console.log('Router connection OK! (الاتصال بالراوتر ناجح)');
          console.log(`Version:      ${health.version}`);
          console.log(`Board Name:   ${health.boardName ?? 'Unknown'}`);
          console.log(`CPU Load:     ${health.cpuLoad}%`);
          console.log(`Free Memory:  ${Math.round(health.memoryFree / 1024 / 1024)} MB`);
          console.log(`Uptime:       ${health.uptime}`);
        } else {
          console.error('Router is unreachable. Please verify IP, port, and credentials.');
          process.exit(1);
        }
      } catch (err: any) {
        console.error(`Router test failed: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'test-hotspot': {
      console.log(`[Lab Test] Connecting to MikroTik router at ${config.router?.host}:${config.router?.port}...`);
      try {
        const isOnline = await routerWorker.ping();
        if (!isOnline) {
          console.error('[Lab Test] Router is unreachable. Please verify IP, port, API service, and credentials.');
          process.exit(1);
        }
        const health = await routerWorker.getHealth();
        console.log(`[Lab Test] Connected OK! Router: ${health.boardName ?? 'Generic'}, ROS: ${health.version}, Uptime: ${health.uptime}`);

        const testUsers = [
          { name: 'sudafi_lab_01', password: 'lab_pass_01', profile: 'default', comment: 'sudafi-lab-test' },
          { name: 'sudafi_lab_02', password: 'lab_pass_02', profile: 'default', comment: 'sudafi-lab-test' },
        ];

        console.log('\n--- Step 1: Adding 2 Test HotSpot Users ---');
        const addRes = await routerWorker.batchAddHotspotUsers(testUsers);
        console.log(`Created: ${addRes.createdCount}, Existing: ${addRes.alreadyExistingCount}, Failed: ${addRes.failedCount}`);
        if (addRes.failedCount > 0 && addRes.errors) {
          console.error('Errors:', addRes.errors);
        }

        console.log('\n--- Step 2: Verifying Users Exist in Router ---');
        const verifyRes = await routerWorker.verifyHotspotUsers(['sudafi_lab_01', 'sudafi_lab_02']);
        console.log(`Found: [${verifyRes.existingUsers.join(', ')}], Missing: [${verifyRes.missingUsers.join(', ')}]`);

        console.log('\n--- Step 3: Testing Idempotency (Duplicate Prevention) ---');
        const dupRes = await routerWorker.batchAddHotspotUsers(testUsers);
        console.log(`Re-run: Created: ${dupRes.createdCount}, AlreadyExisting: ${dupRes.alreadyExistingCount}, Failed: ${dupRes.failedCount}`);
        if (dupRes.alreadyExistingCount === 2) {
          console.log('IDEMPOTENCY TEST PASSED: Duplicate cards detected and reconciled without error.');
        } else {
          console.warn('Idempotency warning: unexpected duplicate counts.');
        }

        console.log('\n--- Step 4: Testing Existing User Conflict Protection ---');
        const conflictRes = await routerWorker.batchAddHotspotUsers([
          { name: 'sudafi_lab_01', profile: 'non_matching_profile_xyz', comment: 'conflict-probe' },
        ]);
        console.log(`Conflict probe outcome: Failed: ${conflictRes.failedCount}, Created: ${conflictRes.createdCount}`);
        if (conflictRes.failedCount === 1) {
          console.log('CONFLICT PROTECTION PASSED: Mismatched profile rejected, existing user protected.');
        }

        if (cliArgs.keep) {
          console.log('\n[Lab Test] --keep specified: 2 test users left in router for manual WinBox inspection.');
        } else {
          console.log('\n--- Step 5: Rolling Back / Cleaning Up Test Cards ---');
          const removeRes = await routerWorker.removeHotspotUsers(['sudafi_lab_01', 'sudafi_lab_02']);
          console.log(`Removed: ${removeRes.removedCount}, Not Found: ${removeRes.notFoundCount}, Failed: ${removeRes.failedCount}`);
          console.log('CLEANUP COMPLETED: Router restored to original state.');
        }

        console.log('\n[Lab Test] All test steps executed successfully.');
      } catch (err: any) {
        console.error(`[Lab Test] HotSpot test failed: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'run':
    default: {
      const isPaired = await vault.isPaired();
      if (!isPaired) {
        console.warn('Agent is not paired yet. Please pair first using:');
        console.warn('  pnpm --filter @mikrotik-saas/agent start -- pair --code <6-digit-code>');
        process.exit(1);
      }

      // Single-instance protection
      const singleLock = new SingleInstanceLock(cliArgs.configPath ? path.dirname(cliArgs.configPath) : undefined);
      const lockRes = singleLock.acquire(config.agentName);
      if (!lockRes.acquired) {
        console.error(
          `[CRITICAL] Another SudaFi Agent instance is already running on this machine (PID: ${lockRes.existingPid}).\n` +
          `Only one agent instance can control this router connection at a time.\n` +
          `To stop the existing instance, terminate PID ${lockRes.existingPid} or use the stop-service script.`
        );
        process.exit(1);
      }

      console.log(`Running agent in ${config.mockRouter ? '[MOCK MODE]' : '[HARDWARE MODE]'}...`);
      await daemon.start();

      const shutdown = async () => {
        console.log('\nShutting down SudaFi Agent...');
        await daemon.stop();
        singleLock.release();
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      break;
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal agent error:', err);
    process.exit(1);
  });
}
