import { IRouterWorker } from '../router/interfaces/router-worker.interface';
import {
  AgentCommandType,
  CommandItem,
  SubmitResultPayload,
  HotspotBatchAddUser,
} from '../types';

export class CommandExecutor {
  constructor(private readonly routerWorker: IRouterWorker) {}

  /**
   * Strictly validates and executes an authorized typed command against the router.
   */
  async execute(command: CommandItem): Promise<SubmitResultPayload> {
    const { operationId, type, payload } = command;

    // Strict Whitelist Check
    const allowedTypes = Object.values(AgentCommandType);
    if (!allowedTypes.includes(type)) {
      return {
        operationId,
        status: 'FAILED',
        errorMessage: `Forbidden or unsupported command type: [${type}]. Permitted types are: ${allowedTypes.join(', ')}`,
      };
    }

    try {
      switch (type) {
        case AgentCommandType.ROUTER_HEALTH: {
          const health = await this.routerWorker.getHealth();
          return {
            operationId,
            status: 'COMPLETED',
            result: health as any,
          };
        }

        case AgentCommandType.HOTSPOT_BATCH_ADD: {
          const users: HotspotBatchAddUser[] = payload?.users ?? [];
          if (!Array.isArray(users)) {
            return {
              operationId,
              status: 'FAILED',
              errorMessage: 'Invalid payload: "users" must be an array',
            };
          }
          const addResult = await this.routerWorker.batchAddHotspotUsers(users);
          return {
            operationId,
            status: 'COMPLETED',
            result: addResult as any,
          };
        }

        case AgentCommandType.HOTSPOT_USER_REMOVE: {
          const names: string[] = payload?.names ?? [];
          if (!Array.isArray(names)) {
            return {
              operationId,
              status: 'FAILED',
              errorMessage: 'Invalid payload: "names" must be an array of strings',
            };
          }
          const removeResult = await this.routerWorker.removeHotspotUsers(names);
          return {
            operationId,
            status: 'COMPLETED',
            result: removeResult as any,
          };
        }

        case AgentCommandType.HOTSPOT_VERIFY_BATCH: {
          const names: string[] = payload?.names ?? [];
          if (!Array.isArray(names)) {
            return {
              operationId,
              status: 'FAILED',
              errorMessage: 'Invalid payload: "names" must be an array of strings',
            };
          }
          const verifyResult = await this.routerWorker.verifyHotspotUsers(names);
          return {
            operationId,
            status: 'COMPLETED',
            result: verifyResult as any,
          };
        }

        case AgentCommandType.HOTSPOT_SESSION_LIST: {
          const sessionResult = await this.routerWorker.listActiveSessions();
          return {
            operationId,
            status: 'COMPLETED',
            result: sessionResult as any,
          };
        }

        // ==================== PPPoE Command Handlers ====================

        case AgentCommandType.PPPOE_PROFILE_SYNC: {
          const name = payload?.name;
          if (!name || typeof name !== 'string' || !name.trim()) {
            return {
              operationId,
              status: 'FAILED',
              errorMessage: 'Invalid payload: "name" is required and must be a non-empty string',
            };
          }
          const syncResult = await this.routerWorker.syncPppoeProfile({
            name: name.trim(),
            localAddress: payload.localAddress,
            remoteAddress: payload.remoteAddress,
            rateLimit: payload.rateLimit,
            dnsServers: payload.dnsServers ?? payload.dnsServer,
            onlyOne: payload.onlyOne,
          });
          return {
            operationId,
            status: 'COMPLETED',
            result: syncResult as any,
          };
        }

        case AgentCommandType.PPPOE_SECRET_ADD: {
          const username = payload?.username;
          const password = payload?.password;
          const profile = payload?.profile;
          if (!username || typeof username !== 'string' || !username.trim()) {
            return {
              operationId,
              status: 'FAILED',
              errorMessage: 'Invalid payload: "username" is required and must be a non-empty string',
            };
          }
          if (!password || typeof password !== 'string') {
            return {
              operationId,
              status: 'FAILED',
              errorMessage: 'Invalid payload: "password" is required and must be a string',
            };
          }
          if (!profile || typeof profile !== 'string' || !profile.trim()) {
            return {
              operationId,
              status: 'FAILED',
              errorMessage: 'Invalid payload: "profile" is required and must be a non-empty string',
            };
          }
          const addResult = await this.routerWorker.addPppoeSecret({
            username: username.trim(),
            password,
            profile: profile.trim(),
            callerId: payload.callerId ?? payload.service,
            remoteAddress: payload.remoteAddress,
            comment: payload.comment,
            disabled: payload.disabled,
          });
          // STRICT: Never return raw password in result payload
          return {
            operationId,
            status: 'COMPLETED',
            result: {
              username: addResult.username,
              status: addResult.status,
              profile: addResult.profile,
              reconciled: addResult.reconciled,
            },
          };
        }

        case AgentCommandType.PPPOE_SECRET_UPDATE: {
          const username = payload?.username;
          if (!username || typeof username !== 'string' || !username.trim()) {
            return {
              operationId,
              status: 'FAILED',
              errorMessage: 'Invalid payload: "username" is required and must be a non-empty string',
            };
          }
          const updateResult = await this.routerWorker.updatePppoeSecret({
            username: username.trim(),
            password: payload.password,
            profile: payload.profile,
            remoteAddress: payload.remoteAddress,
            comment: payload.comment,
            disabled: payload.disabled,
          });
          // STRICT: Never return raw password in result payload
          return {
            operationId,
            status: 'COMPLETED',
            result: {
              username: updateResult.username,
              updated: updateResult.updated,
              fieldsModified: updateResult.fieldsModified,
            },
          };
        }

        case AgentCommandType.PPPOE_SECRET_DISABLE: {
          const username = payload?.username;
          if (!username || typeof username !== 'string' || !username.trim()) {
            return {
              operationId,
              status: 'FAILED',
              errorMessage: 'Invalid payload: "username" is required and must be a non-empty string',
            };
          }
          const disableResult = await this.routerWorker.disablePppoeSecret({
            username: username.trim(),
            disconnectActive: payload.disconnectActive ?? true,
          });
          return {
            operationId,
            status: 'COMPLETED',
            result: disableResult as any,
          };
        }

        case AgentCommandType.PPPOE_SECRET_ENABLE: {
          const username = payload?.username;
          if (!username || typeof username !== 'string' || !username.trim()) {
            return {
              operationId,
              status: 'FAILED',
              errorMessage: 'Invalid payload: "username" is required and must be a non-empty string',
            };
          }
          const enableResult = await this.routerWorker.enablePppoeSecret({
            username: username.trim(),
          });
          return {
            operationId,
            status: 'COMPLETED',
            result: enableResult as any,
          };
        }

        case AgentCommandType.PPPOE_SECRET_REMOVE: {
          const username = payload?.username;
          if (!username || typeof username !== 'string' || !username.trim()) {
            return {
              operationId,
              status: 'FAILED',
              errorMessage: 'Invalid payload: "username" is required and must be a non-empty string',
            };
          }
          const removeResult = await this.routerWorker.removePppoeSecret({
            username: username.trim(),
            disconnectActive: payload.disconnectActive ?? true,
          });
          return {
            operationId,
            status: 'COMPLETED',
            result: removeResult as any,
          };
        }

        case AgentCommandType.PPPOE_SESSION_LIST: {
          const sessionListResult = await this.routerWorker.listPppoeActiveSessions();
          return {
            operationId,
            status: 'COMPLETED',
            result: sessionListResult as any,
          };
        }

        case AgentCommandType.PPPOE_SESSION_DISCONNECT: {
          const username = payload?.username;
          const sessionId = payload?.sessionId;
          if ((!username || typeof username !== 'string') && (!sessionId || typeof sessionId !== 'string')) {
            return {
              operationId,
              status: 'FAILED',
              errorMessage: 'Invalid payload: either "username" or "sessionId" must be provided',
            };
          }
          const discResult = await this.routerWorker.disconnectPppoeSession({
            username: username ? String(username).trim() : undefined,
            sessionId: sessionId ? String(sessionId).trim() : undefined,
          });
          return {
            operationId,
            status: 'COMPLETED',
            result: discResult as any,
          };
        }

        case AgentCommandType.HOTSPOT_PORTAL_PUBLISH: {
          const directory = payload?.directoryName ?? 'hotspot';
          const files = payload?.files;
          if (!Array.isArray(files) || files.length === 0) {
            return {
              operationId,
              status: 'FAILED',
              errorMessage: 'Invalid payload: "files" must be a non-empty array',
            };
          }
          const publishResult = await this.routerWorker.publishHotspotPortal({
            directoryName: directory,
            files,
            applyToProfile: payload?.applyToProfile,
          });
          return {
            operationId,
            status: 'COMPLETED',
            result: publishResult as any,
          };
        }

        default: {
          return {
            operationId,
            status: 'FAILED',
            errorMessage: `Unhandled command type: ${type}`,
          };
        }
      }
    } catch (err: any) {
      // Sanitize error message to prevent leaking any potential credentials
      const safeError = (err?.message ?? 'Unknown router error')
        .replace(/password=[^\s&]+/gi, 'password=***')
        .replace(/token=[^\s&]+/gi, 'token=***')
        .replace(/password:\s*["']?[^"',\s]+["']?/gi, 'password: "***"');

      return {
        operationId,
        status: 'FAILED',
        errorMessage: safeError,
      };
    }
  }
}
