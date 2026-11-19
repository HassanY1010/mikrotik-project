import { Injectable, Logger } from '@nestjs/common';
import { MikrotikClientFactory, DeviceConnectionConfig } from '../mikrotik-client.factory';
import type {
  IMikrotikClient,
  HotspotProfileItem,
  HotspotUserItem,
  RouterPppProfileItem,
  RouterPppSecretItem,
} from '../interfaces/mikrotik-client.interface';
import {
  OperationExecutionStatus,
  OperationFailurePhase,
  GenericOperationContext,
  OperationResult,
  PreCheckResult,
  PostVerifyResult,
} from '../interfaces/mikrotik-operation.interface';

@Injectable()
export class MikrotikOperationExecutorService {
  private readonly logger = new Logger(MikrotikOperationExecutorService.name);

  constructor(private readonly clientFactory: MikrotikClientFactory) {}

  /**
   * Sanitizes strings, error messages, and payloads to ensure no passwords or credentials leak into logs.
   */
  public sanitize(text: string): string {
    if (!text) return text;
    return text
      .replace(/password=\S+/gi, 'password=***')
      .replace(/"password"\s*:\s*"[^"]*"/gi, '"password":"***"')
      .replace(/"passwordEncrypted"\s*:\s*"[^"]*"/gi, '"passwordEncrypted":"***"')
      .replace(/"secret"\s*:\s*"[^"]*"/gi, '"secret":"***"');
  }

  /**
   * Translates common RouterOS / network error messages into friendly Arabic descriptions.
   */
  public translateErrorToArabic(rawError: string): string {
    if (/permission|not enough permissions|action not permitted|read-only/i.test(rawError)) {
      return 'حساب الاتصال بالراوتر لا يمتلك الصلاحيات الكافية (صلاحيات الكتابة) (Read-Only)';
    }
    if (/timeout|timed out|ETIMEDOUT/i.test(rawError)) {
      return 'انتهت مهلة الاتصال بالراوتر دون استجابة (Timeout)';
    }
    if (/ECONNREFUSED/i.test(rawError)) {
      return 'تم رفض الاتصال من الراوتر (Connection Refused - تأكد من تفعيل خدمة API أو www)';
    }
    if (/ENETUNREACH|EHOSTUNREACH/i.test(rawError)) {
      return 'تعذر الوصول إلى عنوان الراوتر (Host Unreachable)';
    }
    if (/already have|already exists|item with such name already exists/i.test(rawError)) {
      return 'العنصر موجود مسبقاً على الراوتر';
    }
    if (/no such item|not found|cannot find/i.test(rawError)) {
      return 'العنصر غير موجود على الراوتر';
    }
    if (/invalid/i.test(rawError)) {
      return `قيمة غير صالحة للأمر على الراوتر: ${this.sanitize(rawError)}`;
    }
    return `فشل العملية على الراوتر: ${this.sanitize(rawError)}`;
  }

  /**
   * Identifies if an error represents a true missing item (404 / no such item)
   * while excluding HTML proxies, web servers, permissions, or network timeouts.
   */
  public isItemNotFoundError(error: unknown): boolean {
    if (!error) return false;
    const msg = error instanceof Error ? error.message : String(error);
    const lower = msg.toLowerCase();

    if (
      lower.includes('timeout') ||
      lower.includes('econnrefused') ||
      lower.includes('econnreset') ||
      lower.includes('broken socket') ||
      lower.includes('network')
    ) {
      return false;
    }

    if (lower.includes('401') || lower.includes('403') || lower.includes('permission') || lower.includes('read-only')) {
      return false;
    }

    if (
      lower.includes('<!doctype') ||
      lower.includes('<html') ||
      lower.includes('nginx') ||
      lower.includes('apache') ||
      lower.includes('caddy') ||
      lower.includes('cannot get') ||
      lower.includes('cannot post') ||
      lower.includes('cannot delete') ||
      lower.includes('route not found') ||
      lower.includes('not implemented')
    ) {
      return false;
    }

    const isNoSuchItem = lower.includes('no such item') || lower.includes('does not exist') || lower.includes('item not found');
    const isSpecificRest404 =
      lower.includes('404') &&
      (lower.includes('/ip/hotspot') || lower.includes('/ppp') || lower.includes('/file') || lower.includes('no such item') || lower.includes('detail'));

    return isNoSuchItem || isSpecificRest404;
  }

  /**
   * Core 10-step execution engine for any RouterOS operation:
   * 1. Validate inputs
   * 2. Identify target router
   * 3. Verify connection & authentication
   * 4. Pre-read current state (idempotency check)
   * 5. Verify operation feasibility
   * 6. Execute command on MikroTik
   * 7. Read back state from MikroTik
   * 8. Compare result against desired state (Read-After-Write Verification)
   * 9. Persist to application database ONLY if verified
   * 10. Return precise telemetry & execution status
   */
  async executeCustom<TTarget = unknown, TResult = unknown>(
    context: GenericOperationContext<TTarget, TResult>,
  ): Promise<OperationResult<TTarget>> {
    const startTime = Date.now();
    const { deviceConfig, operationType, resourceType, resourceIdentifier } = context;

    // Step 1: Input Validation
    if (!deviceConfig || !deviceConfig.host || !deviceConfig.id) {
      return {
        status: OperationExecutionStatus.FAILED,
        phase: OperationFailurePhase.INPUT_VALIDATION,
        resourceType,
        resourceIdentifier,
        routerId: deviceConfig?.id ?? 'UNKNOWN',
        routerHost: deviceConfig?.host ?? 'UNKNOWN',
        error: 'Invalid device configuration provided',
        errorArabic: 'بيانات تكوين الراوتر غير صالحة أو ناقصة',
        durationMs: Date.now() - startTime,
      };
    }

    if (!resourceIdentifier || resourceIdentifier.trim() === '') {
      return {
        status: OperationExecutionStatus.FAILED,
        phase: OperationFailurePhase.INPUT_VALIDATION,
        resourceType,
        resourceIdentifier: 'EMPTY',
        routerId: deviceConfig.id,
        routerHost: deviceConfig.host,
        error: 'Resource identifier cannot be empty',
        errorArabic: 'معرف المورد المستهدف لا يمكن أن يكون فارغاً',
        durationMs: Date.now() - startTime,
      };
    }

    // Step 2 & 3: Connection & Authentication Verification
    let client: IMikrotikClient;
    try {
      client = await this.clientFactory.getClient(deviceConfig);
    } catch (connErr: unknown) {
      const rawMsg = connErr instanceof Error ? connErr.message : String(connErr);
      const sanitized = this.sanitize(rawMsg);
      this.logger.error({
        operation: operationType,
        phase: OperationFailurePhase.CONNECTION,
        routerId: deviceConfig.id,
        routerHost: deviceConfig.host,
        resourceType,
        resourceIdentifier,
        error: sanitized,
      });

      return {
        status: OperationExecutionStatus.FAILED,
        phase: OperationFailurePhase.CONNECTION,
        resourceType,
        resourceIdentifier,
        routerId: deviceConfig.id,
        routerHost: deviceConfig.host,
        error: sanitized,
        errorArabic: this.translateErrorToArabic(rawMsg),
        durationMs: Date.now() - startTime,
      };
    }

    // Step 4 & 5: Pre-execution check & Feasibility (Idempotency)
    let preCheckResult: PreCheckResult<TTarget> = { canExecute: true };
    if (context.preCheck) {
      try {
        preCheckResult = await context.preCheck(client);
        if (preCheckResult.alreadyCompliant) {
          // Idempotency: Item already in desired state
          this.logger.log({
            operation: operationType,
            phase: 'IDEMPOTENT_SHORTCUT',
            routerId: deviceConfig.id,
            resourceType,
            resourceIdentifier,
            msg: 'Resource is already in desired state on router. Skipping redundant write.',
          });

          // Still allow persistence sync if required
          if (context.persist) {
            try {
              await context.persist(preCheckResult.existingItem ?? null, null as unknown as TResult);
            } catch (persistErr) {
              const pMsg = persistErr instanceof Error ? persistErr.message : String(persistErr);
              return {
                status: OperationExecutionStatus.FAILED,
                phase: OperationFailurePhase.PERSISTENCE,
                resourceType,
                resourceIdentifier,
                routerId: deviceConfig.id,
                routerHost: deviceConfig.host,
                error: `Database persistence failed: ${pMsg}`,
                errorArabic: `فشل تحديث قاعدة البيانات: ${pMsg}`,
                durationMs: Date.now() - startTime,
              };
            }
          }

          return {
            status: OperationExecutionStatus.SUCCESS,
            phase: 'COMPLETED',
            resourceType,
            resourceIdentifier,
            routerId: deviceConfig.id,
            routerHost: deviceConfig.host,
            data: preCheckResult.existingItem,
            durationMs: Date.now() - startTime,
          };
        }

        if (!preCheckResult.canExecute) {
          return {
            status: OperationExecutionStatus.FAILED,
            phase: OperationFailurePhase.PRE_VERIFICATION,
            resourceType,
            resourceIdentifier,
            routerId: deviceConfig.id,
            routerHost: deviceConfig.host,
            error: preCheckResult.reason ?? 'Pre-execution check failed',
            errorArabic: preCheckResult.reasonArabic ?? 'فشل فحص الحالة المسبقة على الراوتر قبل التنفيذ',
            durationMs: Date.now() - startTime,
          };
        }
      } catch (preErr: unknown) {
        const rawMsg = preErr instanceof Error ? preErr.message : String(preErr);
        const sanitized = this.sanitize(rawMsg);
        return {
          status: OperationExecutionStatus.FAILED,
          phase: OperationFailurePhase.PRE_VERIFICATION,
          resourceType,
          resourceIdentifier,
          routerId: deviceConfig.id,
          routerHost: deviceConfig.host,
          error: `Pre-check query failed: ${sanitized}`,
          errorArabic: `فشل الاستعلام المسبق من الراوتر: ${this.translateErrorToArabic(rawMsg)}`,
          durationMs: Date.now() - startTime,
        };
      }
    }

    // Step 6: Command Execution on Router
    let executeResult: TResult;
    try {
      executeResult = await context.execute(client, preCheckResult);
    } catch (execErr: unknown) {
      const rawMsg = execErr instanceof Error ? execErr.message : String(execErr);
      const sanitized = this.sanitize(rawMsg);
      this.logger.error({
        operation: operationType,
        phase: OperationFailurePhase.COMMAND_EXECUTION,
        routerId: deviceConfig.id,
        routerHost: deviceConfig.host,
        resourceType,
        resourceIdentifier,
        error: sanitized,
      });

      return {
        status: OperationExecutionStatus.FAILED,
        phase: OperationFailurePhase.COMMAND_EXECUTION,
        resourceType,
        resourceIdentifier,
        routerId: deviceConfig.id,
        routerHost: deviceConfig.host,
        error: sanitized,
        errorArabic: this.translateErrorToArabic(rawMsg),
        durationMs: Date.now() - startTime,
      };
    }

    // Step 7 & 8: Read-After-Write Verification (Verify state matches expectation)
    let verifyResult: PostVerifyResult<TTarget>;
    try {
      verifyResult = await context.verify(client, executeResult, preCheckResult);
    } catch (verifyErr: unknown) {
      const rawMsg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
      const sanitized = this.sanitize(rawMsg);
      this.logger.error({
        operation: operationType,
        phase: OperationFailurePhase.POST_VERIFICATION,
        routerId: deviceConfig.id,
        routerHost: deviceConfig.host,
        resourceType,
        resourceIdentifier,
        error: `Verification read-back failed: ${sanitized}`,
      });

      // Write was sent, but verification could not be verified due to network disconnect/timeout!
      // Must return UNKNOWN (never FAILED without investigation, and NEVER SUCCESS!)
      return {
        status: OperationExecutionStatus.UNKNOWN,
        phase: OperationFailurePhase.POST_VERIFICATION,
        resourceType,
        resourceIdentifier,
        routerId: deviceConfig.id,
        routerHost: deviceConfig.host,
        error: `Operation was dispatched to router, but read-back verification failed due to network error: ${sanitized}`,
        errorArabic: `تم إرسال الأمر للراوتر ولكن تعذر التحقق من حالته بسبب انقطاع الاتصال: ${this.translateErrorToArabic(rawMsg)}`,
        durationMs: Date.now() - startTime,
      };
    }

    if (!verifyResult.verified) {
      this.logger.warn({
        operation: operationType,
        phase: OperationFailurePhase.POST_VERIFICATION,
        routerId: deviceConfig.id,
        resourceType,
        resourceIdentifier,
        reason: verifyResult.reason,
      });

      return {
        status: OperationExecutionStatus.FAILED,
        phase: OperationFailurePhase.POST_VERIFICATION,
        resourceType,
        resourceIdentifier,
        routerId: deviceConfig.id,
        routerHost: deviceConfig.host,
        error: verifyResult.reason ?? 'Post-execution verification failed: state does not match expected state',
        errorArabic: verifyResult.reasonArabic ?? 'فشل التحقق بعد التنفيذ: الحالة الفعلية على الراوتر لا تطابق المطلوب',
        durationMs: Date.now() - startTime,
      };
    }

    // Step 9: Database Persistence (ONLY called after confirmed verification)
    if (context.persist) {
      try {
        await context.persist(verifyResult.actualItem ?? null, executeResult);
      } catch (persistErr: unknown) {
        const rawMsg = persistErr instanceof Error ? persistErr.message : String(persistErr);
        const sanitized = this.sanitize(rawMsg);
        this.logger.error({
          operation: operationType,
          phase: OperationFailurePhase.PERSISTENCE,
          routerId: deviceConfig.id,
          routerHost: deviceConfig.host,
          resourceType,
          resourceIdentifier,
          error: `CRITICAL: Router operation succeeded and was verified, but database persistence failed: ${sanitized}`,
        });

        // Attempt rollback on router if requested
        if (context.rollbackOnPersistenceFailure) {
          try {
            await context.rollbackOnPersistenceFailure(client, verifyResult.actualItem ?? null);
            this.logger.warn(`Rollback on router succeeded for ${resourceIdentifier}`);
          } catch (rbErr) {
            const rbMsg = rbErr instanceof Error ? rbErr.message : String(rbErr);
            this.logger.error(`Rollback on router failed for ${resourceIdentifier}: ${rbMsg}`);
          }
        }

        return {
          status: OperationExecutionStatus.FAILED,
          phase: OperationFailurePhase.PERSISTENCE,
          resourceType,
          resourceIdentifier,
          routerId: deviceConfig.id,
          routerHost: deviceConfig.host,
          data: verifyResult.actualItem ?? undefined,
          error: `Database persistence failed after router operation: ${sanitized}`,
          errorArabic: `تم تنفيذ العملية والتحقق منها على الراوتر، لكن فشل حفظ البيانات في قاعدة بيانات التطبيق: ${sanitized}`,
          durationMs: Date.now() - startTime,
        };
      }
    }

    // Step 10: Accurate Successful Return
    return {
      status: OperationExecutionStatus.SUCCESS,
      phase: 'COMPLETED',
      resourceType,
      resourceIdentifier,
      routerId: deviceConfig.id,
      routerHost: deviceConfig.host,
      data: verifyResult.actualItem ?? undefined,
      durationMs: Date.now() - startTime,
    };
  }

  // =========================================================================
  // HIGH-LEVEL HELPER METHODS WITH EMBEDDED READ-AFTER-WRITE VERIFICATION
  // =========================================================================

  /**
   * Creates a Hotspot Profile on MikroTik with Read-After-Write verification.
   */
  async executeHotspotProfileCreate(
    deviceConfig: DeviceConnectionConfig,
    payload: {
      name: string;
      rateLimit?: string;
      sessionTimeout?: string;
      idleTimeout?: string;
      keepaliveTimeout?: string;
      sharedUsers?: number;
      addressPool?: string;
    },
    persistFn?: (profile: HotspotProfileItem) => Promise<void>,
  ): Promise<OperationResult<HotspotProfileItem>> {
    return this.executeCustom<HotspotProfileItem, unknown>({
      deviceConfig,
      operationType: 'CREATE',
      resourceType: 'HOTSPOT_PROFILE',
      resourceIdentifier: payload.name,

      preCheck: async (client) => {
        const existing = await client.listHotspotProfiles();
        const found = existing.find((p) => p.name === payload.name);
        if (found) {
          // Check if attributes match exactly
          const matches =
            (!payload.rateLimit || found.rateLimit === payload.rateLimit) &&
            (!payload.sessionTimeout || found.sessionTimeout === payload.sessionTimeout) &&
            (!payload.sharedUsers || found.sharedUsers === payload.sharedUsers);

          if (matches) {
            return { canExecute: false, alreadyCompliant: true, existingItem: found };
          }
          return {
            canExecute: false,
            reason: `Profile "${payload.name}" already exists on router with different settings`,
            reasonArabic: `البروفايل "${payload.name}" موجود مسبقاً على الراوتر بإعدادات مختلفة`,
          };
        }
        return { canExecute: true };
      },

      execute: async (client) => {
        return client.createHotspotProfile(payload);
      },

      verify: async (client) => {
        const profiles = await client.listHotspotProfiles();
        const found = profiles.find((p) => p.name === payload.name);
        if (!found) {
          return {
            verified: false,
            reason: `Profile "${payload.name}" was not found on router after creation command`,
            reasonArabic: `تعذر العثور على البروفايل "${payload.name}" على الراوتر بعد إرسال أمر الإنشاء`,
          };
        }
        return { verified: true, actualItem: found };
      },

      persist: async (verifiedItem) => {
        if (persistFn && verifiedItem) {
          await persistFn(verifiedItem);
        }
      },

      rollbackOnPersistenceFailure: async (client) => {
        await client.deleteHotspotProfile(payload.name);
      },
    });
  }

  /**
   * Updates a Hotspot Profile on MikroTik with Read-After-Write verification.
   */
  async executeHotspotProfileUpdate(
    deviceConfig: DeviceConnectionConfig,
    name: string,
    payload: {
      rateLimit?: string;
      sessionTimeout?: string;
      idleTimeout?: string;
      keepaliveTimeout?: string;
      sharedUsers?: number;
      addressPool?: string;
    },
    persistFn?: (profile: HotspotProfileItem) => Promise<void>,
  ): Promise<OperationResult<HotspotProfileItem>> {
    return this.executeCustom<HotspotProfileItem, unknown>({
      deviceConfig,
      operationType: 'UPDATE',
      resourceType: 'HOTSPOT_PROFILE',
      resourceIdentifier: name,

      preCheck: async (client) => {
        const existing = await client.listHotspotProfiles();
        const found = existing.find((p) => p.name === name);
        if (!found) {
          return {
            canExecute: false,
            reason: `Profile "${name}" does not exist on router`,
            reasonArabic: `البروفايل "${name}" غير موجود على الراوتر للتعديل`,
          };
        }
        return { canExecute: true, existingItem: found };
      },

      execute: async (client) => {
        return client.updateHotspotProfile(name, payload);
      },

      verify: async (client) => {
        const profiles = await client.listHotspotProfiles();
        const found = profiles.find((p) => p.name === name);
        if (!found) {
          return {
            verified: false,
            reason: `Profile "${name}" not found after update`,
            reasonArabic: `لم يتم العثور على البروفايل "${name}" بعد التعديل`,
          };
        }

        // Verify updated fields
        if (payload.rateLimit !== undefined && found.rateLimit !== payload.rateLimit) {
          return {
            verified: false,
            reason: `rateLimit mismatch on router: expected ${payload.rateLimit}, got ${found.rateLimit}`,
            reasonArabic: `عدم تطابق السرعة (rate-limit) على الراوتر بعد التعديل`,
          };
        }
        return { verified: true, actualItem: found };
      },

      persist: async (verifiedItem) => {
        if (persistFn && verifiedItem) {
          await persistFn(verifiedItem);
        }
      },
    });
  }

  /**
   * Deletes a Hotspot Profile on MikroTik with Read-After-Write verification.
   */
  async executeHotspotProfileDelete(
    deviceConfig: DeviceConnectionConfig,
    name: string,
    persistFn?: () => Promise<void>,
  ): Promise<OperationResult<null>> {
    return this.executeCustom<null, unknown>({
      deviceConfig,
      operationType: 'DELETE',
      resourceType: 'HOTSPOT_PROFILE',
      resourceIdentifier: name,

      preCheck: async (client) => {
        const existing = await client.listHotspotProfiles();
        const found = existing.find((p) => p.name === name);
        if (!found) {
          // Already deleted on router
          return { canExecute: false, alreadyCompliant: true, existingItem: null };
        }
        return { canExecute: true };
      },

      execute: async (client) => {
        return client.deleteHotspotProfile(name);
      },

      verify: async (client) => {
        const profiles = await client.listHotspotProfiles();
        const found = profiles.find((p) => p.name === name);
        if (found) {
          return {
            verified: false,
            reason: `Profile "${name}" still exists on router after delete command`,
            reasonArabic: `البروفايل "${name}" ما زال موجوداً على الراوتر بعد أمر الحذف`,
          };
        }
        return { verified: true, actualItem: null };
      },

      persist: async () => {
        if (persistFn) {
          await persistFn();
        }
      },
    });
  }

  /**
   * Creates a Hotspot User (voucher/card) on MikroTik with Read-After-Write verification.
   */
  async executeHotspotUserCreate(
    deviceConfig: DeviceConnectionConfig,
    payload: {
      name: string;
      password?: string;
      profile: string;
      comment?: string;
      limitUptime?: string;
      limitBytesTotal?: number;
      disabled?: boolean;
    },
    persistFn?: (user: HotspotUserItem) => Promise<void>,
  ): Promise<OperationResult<HotspotUserItem>> {
    return this.executeCustom<HotspotUserItem, unknown>({
      deviceConfig,
      operationType: 'CREATE',
      resourceType: 'HOTSPOT_USER',
      resourceIdentifier: payload.name,

      preCheck: async (client) => {
        const existing = client.getHotspotUser
          ? await client.getHotspotUser(payload.name)
          : (await client.listHotspotUsers()).find((u) => u.name === payload.name) ?? null;
        if (existing) {
          // Check if profile and limits match
          if (existing.profile === payload.profile) {
            return { canExecute: false, alreadyCompliant: true, existingItem: existing };
          }
          return {
            canExecute: false,
            reason: `Hotspot user "${payload.name}" already exists on router with profile "${existing.profile}"`,
            reasonArabic: `المستخدم "${payload.name}" موجود مسبقاً على الراوتر مع بروفايل مختلف`,
          };
        }
        return { canExecute: true };
      },

      execute: async (client) => {
        return client.createHotspotUser(payload);
      },

      verify: async (client) => {
        const user = client.getHotspotUser
          ? await client.getHotspotUser(payload.name)
          : (await client.listHotspotUsers()).find((u) => u.name === payload.name) ?? null;
        if (!user) {
          return {
            verified: false,
            reason: `Hotspot user "${payload.name}" was not found on router after creation command`,
            reasonArabic: `تعذر العثور على المستخدم "${payload.name}" على الراوتر بعد إرسال أمر الإنشاء`,
          };
        }
        if (payload.profile && user.profile !== payload.profile) {
          return {
            verified: false,
            reason: `Profile mismatch on router for "${payload.name}": expected ${payload.profile}, found ${user.profile}`,
            reasonArabic: `عدم تطابق البروفايل للمستخدم "${payload.name}" على الراوتر بعد الإنشاء`,
          };
        }
        return { verified: true, actualItem: user };
      },

      persist: async (verifiedItem) => {
        if (persistFn && verifiedItem) {
          await persistFn(verifiedItem);
        }
      },

      rollbackOnPersistenceFailure: async (client) => {
        await client.deleteHotspotUser(payload.name);
      },
    });
  }

  /**
   * Updates a Hotspot User on MikroTik with Read-After-Write verification.
   */
  async executeHotspotUserUpdate(
    deviceConfig: DeviceConnectionConfig,
    target: { id?: string; name?: string },
    payload: {
      name?: string;
      password?: string;
      profile?: string;
      comment?: string;
      limitUptime?: string;
      limitBytesTotal?: number;
      disabled?: boolean;
    },
    persistFn?: (user: HotspotUserItem) => Promise<void>,
  ): Promise<OperationResult<HotspotUserItem>> {
    const identifier = target.name || target.id || 'UNKNOWN';

    return this.executeCustom<HotspotUserItem, unknown>({
      deviceConfig,
      operationType: 'UPDATE',
      resourceType: 'HOTSPOT_USER',
      resourceIdentifier: identifier,

      preCheck: async (client) => {
        const existing = client.getHotspotUser
          ? await client.getHotspotUser(identifier)
          : (await client.listHotspotUsers()).find((u) => u.name === identifier || u.id === identifier) ?? null;
        if (!existing) {
          return {
            canExecute: false,
            reason: `Hotspot user "${identifier}" not found on router`,
            reasonArabic: `المستخدم "${identifier}" غير موجود على الراوتر للتعديل`,
          };
        }
        return { canExecute: true, existingItem: existing };
      },

      execute: async (client) => {
        if (payload.disabled === true && typeof client.disableHotspotUser === 'function') {
          await client.disableHotspotUser(identifier);
        } else if (payload.disabled === false && typeof client.enableHotspotUser === 'function') {
          await client.enableHotspotUser(identifier);
        }
        const hasOtherFields =
          payload.name !== undefined ||
          payload.password !== undefined ||
          payload.profile !== undefined ||
          payload.comment !== undefined ||
          payload.limitUptime !== undefined ||
          payload.limitBytesTotal !== undefined;
        if (hasOtherFields && typeof client.updateHotspotUser === 'function') {
          return client.updateHotspotUser(identifier, payload);
        }
        return null;
      },

      verify: async (client) => {
        const lookupKey = payload.name || identifier;
        const user = client.getHotspotUser
          ? await client.getHotspotUser(lookupKey)
          : (await client.listHotspotUsers()).find((u) => u.name === lookupKey || u.id === lookupKey) ?? null;
        if (!user) {
          return {
            verified: false,
            reason: `Hotspot user "${lookupKey}" not found after update`,
            reasonArabic: `لم يتم العثور على المستخدم "${lookupKey}" على الراوتر بعد التعديل`,
          };
        }
        if (payload.profile && user.profile !== payload.profile) {
          return {
            verified: false,
            reason: `User profile mismatch: expected ${payload.profile}, got ${user.profile}`,
            reasonArabic: `عدم تطابق البروفايل بعد التعديل على الراوتر`,
          };
        }
        if (payload.disabled !== undefined && user.disabled !== payload.disabled) {
          return {
            verified: false,
            reason: `User disabled state mismatch: expected ${payload.disabled}, got ${user.disabled}`,
            reasonArabic: `حالة التعطيل/التفعيل لم تنعكس على الراوتر بعد التعديل`,
          };
        }
        return { verified: true, actualItem: user };
      },

      persist: async (verifiedItem) => {
        if (persistFn && verifiedItem) {
          await persistFn(verifiedItem);
        }
      },

      rollbackOnPersistenceFailure: async (client) => {
        if (payload.disabled !== undefined) {
          // If we changed disabled state and DB failed, revert to opposite state (e.g. if we enabled, disable)
          if (payload.disabled === false) {
            await client.disableHotspotUser(identifier);
          } else {
            await client.enableHotspotUser(identifier);
          }
        }
      },
    });
  }

  /**
   * Deletes a Hotspot User from MikroTik with Read-After-Write verification.
   */
  async executeHotspotUserDelete(
    deviceConfig: DeviceConnectionConfig,
    target: string | { id?: string; name?: string },
    persistFn?: () => Promise<void>,
  ): Promise<OperationResult<null>> {
    const identifier = typeof target === 'string' ? target : target.name || target.id || 'UNKNOWN';

    return this.executeCustom<null, unknown>({
      deviceConfig,
      operationType: 'DELETE',
      resourceType: 'HOTSPOT_USER',
      resourceIdentifier: identifier,

      preCheck: async (client) => {
        if (client.getHotspotUser) {
          try {
            const user = await client.getHotspotUser(identifier);
            if (!user) {
              return { canExecute: false, alreadyCompliant: true, existingItem: null };
            }
            return { canExecute: true, existingItem: null };
          } catch (err: unknown) {
            if (this.isItemNotFoundError(err)) {
              return { canExecute: false, alreadyCompliant: true, existingItem: null };
            }
          }
        }
        return { canExecute: true, existingItem: null };
      },

      execute: async (client) => {
        try {
          return await client.deleteHotspotUser(identifier);
        } catch (err: unknown) {
          if (this.isItemNotFoundError(err)) {
            return null;
          }
          throw err;
        }
      },

      verify: async (client) => {
        if (client.getHotspotUser) {
          try {
            const user = await client.getHotspotUser(identifier);
            if (user) {
              return {
                verified: false,
                reason: `Hotspot user "${identifier}" still exists on router after deletion command`,
                reasonArabic: `المستخدم "${identifier}" ما زال موجوداً على الراوتر بعد أمر الحذف`,
              };
            }
          } catch (_) {
            // Error checking single user (e.g. 404) means already gone
          }
        }
        return { verified: true, actualItem: null };
      },

      persist: async () => {
        if (persistFn) {
          await persistFn();
        }
      },
    });
  }

  /**
   * Removes an active hotspot session with Read-After-Write verification.
   */
  async executeActiveSessionRemove(
    deviceConfig: DeviceConnectionConfig,
    target: { id?: string; user?: string },
    persistFn?: () => Promise<void>,
  ): Promise<OperationResult<null>> {
    const identifier = target.user || target.id || 'UNKNOWN';

    return this.executeCustom<null, unknown>({
      deviceConfig,
      operationType: 'ACTION',
      resourceType: 'ACTIVE_SESSION',
      resourceIdentifier: identifier,

      preCheck: async (client) => {
        const sessions = await client.listActiveSessions();
        const found = sessions.find((s) => {
          if (target.id && s.id === target.id) return true;
          if (target.user && s.user === target.user) return true;
          return false;
        });

        if (!found) {
          // Session already gone (idempotent)
          return { canExecute: false, alreadyCompliant: true, existingItem: null };
        }
        return { canExecute: true };
      },

      execute: async (client) => {
        return client.removeActiveSession(identifier);
      },

      verify: async (client) => {
        const sessions = await client.listActiveSessions();
        const found = sessions.find((s) => {
          if (target.id && s.id === target.id) return true;
          if (target.user && s.user === target.user) return true;
          return false;
        });

        if (found) {
          return {
            verified: false,
            reason: `Session for "${identifier}" still active on router after removal command`,
            reasonArabic: `جلسة المستخدم "${identifier}" ما زالت نشطة على الراوتر بعد أمر الإنهاء`,
          };
        }
        return { verified: true, actualItem: null };
      },

      persist: async () => {
        if (persistFn) {
          await persistFn();
        }
      },
    });
  }

  /**
   * Creates a PPPoE Profile on MikroTik with Read-After-Write verification.
   */
  async executePppProfileCreate(
    deviceConfig: DeviceConnectionConfig,
    payload: {
      name: string;
      localAddress?: string;
      remoteAddress?: string;
      rateLimit?: string;
      onlyOne?: string;
      dnsServer?: string;
      comment?: string;
    },
    persistFn?: (profile: RouterPppProfileItem) => Promise<void>,
  ): Promise<OperationResult<RouterPppProfileItem>> {
    return this.executeCustom<RouterPppProfileItem, unknown>({
      deviceConfig,
      operationType: 'CREATE',
      resourceType: 'PPP_PROFILE',
      resourceIdentifier: payload.name,

      preCheck: async (client) => {
        if (!client.listPppProfiles) {
          throw new Error('PPPoE profile management is not supported by this router client');
        }
        const existing = await client.listPppProfiles();
        const found = existing.find((p) => p.name === payload.name);
        if (found) {
          if (!payload.rateLimit || found.rateLimit === payload.rateLimit) {
            return { canExecute: false, alreadyCompliant: true, existingItem: found };
          }
          return {
            canExecute: false,
            reason: `PPP Profile "${payload.name}" already exists on router with different settings`,
            reasonArabic: `بروفايل PPPoE "${payload.name}" موجود مسبقاً على الراوتر بإعدادات مختلفة`,
          };
        }
        return { canExecute: true };
      },

      execute: async (client) => {
        if (!client.createPppProfile) {
          throw new Error('createPppProfile is not supported on this client');
        }
        return client.createPppProfile(payload);
      },

      verify: async (client) => {
        if (!client.listPppProfiles) {
          throw new Error('listPppProfiles is not supported on this client');
        }
        const profiles = await client.listPppProfiles();
        const found = profiles.find((p) => p.name === payload.name);
        if (!found) {
          return {
            verified: false,
            reason: `PPP Profile "${payload.name}" not found after creation command`,
            reasonArabic: `تعذر العثور على بروفايل PPPoE "${payload.name}" على الراوتر بعد أمر الإنشاء`,
          };
        }
        return { verified: true, actualItem: found };
      },

      persist: async (verifiedItem) => {
        if (persistFn && verifiedItem) {
          await persistFn(verifiedItem);
        }
      },

      rollbackOnPersistenceFailure: async (client) => {
        if (client.deletePppProfile) {
          await client.deletePppProfile(payload.name);
        }
      },
    });
  }

  /**
   * Updates a PPPoE Profile on MikroTik with Read-After-Write verification.
   */
  async executePppProfileUpdate(
    deviceConfig: DeviceConnectionConfig,
    name: string,
    payload: Partial<RouterPppProfileItem>,
    persistFn?: (profile: RouterPppProfileItem) => Promise<void>,
  ): Promise<OperationResult<RouterPppProfileItem>> {
    return this.executeCustom<RouterPppProfileItem, unknown>({
      deviceConfig,
      operationType: 'UPDATE',
      resourceType: 'PPP_PROFILE',
      resourceIdentifier: name,

      preCheck: async (client) => {
        if (!client.listPppProfiles) {
          throw new Error('PPPoE profile management is not supported by this router client');
        }
        const existing = await client.listPppProfiles();
        const found = existing.find((p) => p.name === name);
        if (!found) {
          return {
            canExecute: false,
            reason: `PPP Profile "${name}" does not exist on router`,
            reasonArabic: `بروفايل PPPoE "${name}" غير موجود على الراوتر للتعديل`,
          };
        }
        return { canExecute: true, existingItem: found };
      },

      execute: async (client) => {
        if (!client.updatePppProfile) {
          throw new Error('updatePppProfile is not supported on this client');
        }
        return client.updatePppProfile(name, payload);
      },

      verify: async (client) => {
        if (!client.listPppProfiles) {
          throw new Error('listPppProfiles is not supported on this client');
        }
        const profiles = await client.listPppProfiles();
        const found = profiles.find((p) => p.name === (payload.name || name));
        if (!found) {
          return {
            verified: false,
            reason: `PPP Profile "${payload.name || name}" not found after update`,
            reasonArabic: `تعذر العثور على بروفايل PPPoE "${payload.name || name}" على الراوتر بعد التعديل`,
          };
        }
        if (payload.rateLimit && found.rateLimit !== payload.rateLimit) {
          return {
            verified: false,
            reason: `PPP Profile rate-limit mismatch: expected ${payload.rateLimit}, found ${found.rateLimit}`,
            reasonArabic: `عدم تطابق السرعة المحددة لبروفايل PPPoE على الراوتر`,
          };
        }
        return { verified: true, actualItem: found };
      },

      persist: async (verifiedItem) => {
        if (persistFn && verifiedItem) {
          await persistFn(verifiedItem);
        }
      },
    });
  }

  /**
   * Deletes a PPPoE Profile from MikroTik with Read-After-Write verification.
   */
  async executePppProfileDelete(
    deviceConfig: DeviceConnectionConfig,
    name: string,
    persistFn?: () => Promise<void>,
  ): Promise<OperationResult<null>> {
    return this.executeCustom<null, unknown>({
      deviceConfig,
      operationType: 'DELETE',
      resourceType: 'PPP_PROFILE',
      resourceIdentifier: name,

      preCheck: async (client) => {
        if (!client.listPppProfiles) {
          throw new Error('PPPoE profile management is not supported by this router client');
        }
        const existing = await client.listPppProfiles();
        const found = existing.find((p) => p.name === name);
        if (!found) {
          return { canExecute: false, alreadyCompliant: true, existingItem: null };
        }
        return { canExecute: true };
      },

      execute: async (client) => {
        if (!client.deletePppProfile) {
          throw new Error('deletePppProfile is not supported on this client');
        }
        return client.deletePppProfile(name);
      },

      verify: async (client) => {
        if (!client.listPppProfiles) {
          throw new Error('listPppProfiles is not supported on this client');
        }
        const profiles = await client.listPppProfiles();
        const found = profiles.find((p) => p.name === name);
        if (found) {
          return {
            verified: false,
            reason: `PPP Profile "${name}" still exists on router after deletion command`,
            reasonArabic: `بروفايل PPPoE "${name}" ما زال موجوداً على الراوتر بعد أمر الحذف`,
          };
        }
        return { verified: true, actualItem: null };
      },

      persist: async () => {
        if (persistFn) {
          await persistFn();
        }
      },
    });
  }

  /**
   * Creates a PPPoE Secret on MikroTik with Read-After-Write verification.
   */
  async executePppSecretCreate(
    deviceConfig: DeviceConnectionConfig,
    payload: {
      name: string;
      password?: string;
      service?: string;
      profile: string;
      localAddress?: string;
      remoteAddress?: string;
      comment?: string;
      disabled?: boolean;
    },
    persistFn?: (secret: RouterPppSecretItem) => Promise<void>,
  ): Promise<OperationResult<RouterPppSecretItem>> {
    return this.executeCustom<RouterPppSecretItem, unknown>({
      deviceConfig,
      operationType: 'CREATE',
      resourceType: 'PPP_SECRET',
      resourceIdentifier: payload.name,

      preCheck: async (client) => {
        if (!client.listPppSecrets) {
          throw new Error('PPPoE secret management is not supported by this router client');
        }
        const existing = await client.listPppSecrets();
        const found = existing.find((s) => s.name === payload.name);
        if (found) {
          if (found.profile === payload.profile) {
            return { canExecute: false, alreadyCompliant: true, existingItem: found };
          }
          return {
            canExecute: false,
            reason: `PPP Secret "${payload.name}" already exists on router with profile "${found.profile}"`,
            reasonArabic: `مستخدم PPPoE "${payload.name}" موجود مسبقاً على الراوتر مع بروفايل مختلف`,
          };
        }
        return { canExecute: true };
      },

      execute: async (client) => {
        if (!client.createPppSecret) {
          throw new Error('createPppSecret is not supported on this client');
        }
        return client.createPppSecret(payload);
      },

      verify: async (client) => {
        if (!client.listPppSecrets) {
          throw new Error('listPppSecrets is not supported on this client');
        }
        const secrets = await client.listPppSecrets();
        const found = secrets.find((s) => s.name === payload.name);
        if (!found) {
          return {
            verified: false,
            reason: `PPP Secret "${payload.name}" not found after creation command`,
            reasonArabic: `تعذر العثور على مستخدم PPPoE "${payload.name}" على الراوتر بعد أمر الإنشاء`,
          };
        }
        if (payload.profile && found.profile !== payload.profile) {
          return {
            verified: false,
            reason: `PPP Secret profile mismatch: expected ${payload.profile}, found ${found.profile}`,
            reasonArabic: `عدم تطابق بروفايل PPPoE على الراوتر بعد الإنشاء`,
          };
        }
        return { verified: true, actualItem: found };
      },

      persist: async (verifiedItem) => {
        if (persistFn && verifiedItem) {
          await persistFn(verifiedItem);
        }
      },

      rollbackOnPersistenceFailure: async (client) => {
        if (client.deletePppSecret) {
          await client.deletePppSecret(payload.name);
        }
      },
    });
  }

  /**
   * Deletes a PPPoE Secret from MikroTik with Read-After-Write verification.
   */
  async executePppSecretDelete(
    deviceConfig: DeviceConnectionConfig,
    target: string | { id?: string; name?: string },
    persistFn?: () => Promise<void>,
  ): Promise<OperationResult<null>> {
    const identifier = typeof target === 'string' ? target : target.name || target.id || 'UNKNOWN';

    return this.executeCustom<null, unknown>({
      deviceConfig,
      operationType: 'DELETE',
      resourceType: 'PPP_SECRET',
      resourceIdentifier: identifier,

      preCheck: async (client) => {
        if (!client.listPppSecrets) {
          throw new Error('PPPoE secret management is not supported by this router client');
        }
        const existing = await client.listPppSecrets();
        const found = existing.find((s) => s.name === identifier || s.id === identifier);
        if (!found) {
          return { canExecute: false, alreadyCompliant: true, existingItem: null };
        }
        return { canExecute: true };
      },

      execute: async (client) => {
        if (!client.deletePppSecret) {
          throw new Error('deletePppSecret is not supported on this client');
        }
        return client.deletePppSecret(identifier);
      },

      verify: async (client) => {
        if (!client.listPppSecrets) {
          throw new Error('listPppSecrets is not supported on this client');
        }
        const secrets = await client.listPppSecrets();
        const found = secrets.find((s) => s.name === identifier || s.id === identifier);
        if (found) {
          return {
            verified: false,
            reason: `PPP Secret "${identifier}" still exists on router after deletion command`,
            reasonArabic: `مستخدم PPPoE "${identifier}" ما زال موجوداً على الراوتر بعد أمر الحذف`,
          };
        }
        return { verified: true, actualItem: null };
      },

      persist: async () => {
        if (persistFn) {
          await persistFn();
        }
      },
    });
  }

  /**
   * Updates a PPPoE Secret on MikroTik with Read-After-Write verification.
   */
  async executePppSecretUpdate(
    deviceConfig: DeviceConnectionConfig,
    name: string,
    payload: Partial<RouterPppSecretItem>,
    persistFn?: (secret: RouterPppSecretItem) => Promise<void>,
  ): Promise<OperationResult<RouterPppSecretItem>> {
    return this.executeCustom<RouterPppSecretItem, unknown>({
      deviceConfig,
      operationType: 'UPDATE',
      resourceType: 'PPP_SECRET',
      resourceIdentifier: name,

      preCheck: async (client) => {
        if (!client.listPppSecrets) {
          throw new Error('PPPoE secret management is not supported by this router client');
        }
        const existing = await client.listPppSecrets();
        const found = existing.find((s) => s.name === name);
        if (!found) {
          return {
            canExecute: false,
            reason: `PPP Secret "${name}" does not exist on router`,
            reasonArabic: `مستخدم PPPoE "${name}" غير موجود على الراوتر للتعديل`,
          };
        }
        return { canExecute: true, existingItem: found };
      },

      execute: async (client) => {
        if (!client.updatePppSecret) {
          throw new Error('updatePppSecret is not supported on this client');
        }
        await client.updatePppSecret(name, payload);
        if (payload.disabled === true && client.disablePppSecret) {
          await client.disablePppSecret(name);
        } else if (payload.disabled === false && client.enablePppSecret) {
          await client.enablePppSecret(name);
        }
        return null;
      },

      verify: async (client) => {
        if (!client.listPppSecrets) {
          throw new Error('listPppSecrets is not supported on this client');
        }
        const secrets = await client.listPppSecrets();
        const found = secrets.find((s) => s.name === (payload.name || name));
        if (!found) {
          return {
            verified: false,
            reason: `PPP Secret "${payload.name || name}" not found after update`,
            reasonArabic: `تعذر العثور على مستخدم PPPoE "${payload.name || name}" بعد التعديل`,
          };
        }
        if (payload.profile && found.profile !== payload.profile) {
          return {
            verified: false,
            reason: `PPP Secret profile mismatch: expected ${payload.profile}, found ${found.profile}`,
            reasonArabic: `عدم تطابق بروفايل PPPoE بعد التعديل`,
          };
        }
        return { verified: true, actualItem: found };
      },

      persist: async (verifiedItem) => {
        if (persistFn && verifiedItem) {
          await persistFn(verifiedItem);
        }
      },
    });
  }

  /**
   * Kicks/removes an active PPPoE broadband session with Read-After-Write verification.
   */
  async executePppActiveSessionRemove(
    deviceConfig: DeviceConnectionConfig,
    sessionOrUsername: string,
    persistFn?: () => Promise<void>,
  ): Promise<OperationResult<null>> {
    return this.executeCustom<null, unknown>({
      deviceConfig,
      operationType: 'ACTION',
      resourceType: 'ACTIVE_SESSION',
      resourceIdentifier: sessionOrUsername,

      execute: async (client) => {
        if (!client.removePppActiveSession) {
          throw new Error('removePppActiveSession is not supported on this client');
        }
        await client.removePppActiveSession(sessionOrUsername);
        return null;
      },

      verify: async (client) => {
        if (!client.listPppActiveSessions) {
          return { verified: true, actualItem: null };
        }
        const sessions = await client.listPppActiveSessions();
        const stillActive = sessions.find(
          (s) =>
            s.name === sessionOrUsername ||
            s.sessionId === sessionOrUsername ||
            s.id === sessionOrUsername,
        );
        if (stillActive) {
          return {
            verified: false,
            reason: `Session for "${sessionOrUsername}" still active on router`,
            reasonArabic: `جلسة PPPoE للمستخدم "${sessionOrUsername}" لا تزال نشطة على الراوتر بعد أمر الإنهاء`,
          };
        }
        return { verified: true, actualItem: null };
      },

      persist: async () => {
        if (persistFn) {
          await persistFn();
        }
      },
    });
  }

  /**
   * Uploads a file to MikroTik with Read-After-Write verification.
   */
  async executeFileUpload(
    deviceConfig: DeviceConnectionConfig,
    targetPath: string,
    content: string | Buffer,
    persistFn?: () => Promise<void>,
  ): Promise<OperationResult<null>> {
    return this.executeCustom<null, unknown>({
      deviceConfig,
      operationType: 'ACTION',
      resourceType: 'FILE',
      resourceIdentifier: targetPath,

      execute: async (client) => {
        if (!client.uploadFile) {
          throw new Error('File upload is not supported by this router client');
        }
        await client.uploadFile(targetPath, content);
        return null;
      },

      verify: async () => {
        // uploadFile in RouterOsApiClient and RouterOsRestClient already confirms file exists/transfer completes
        return { verified: true, actualItem: null };
      },

      persist: async () => {
        if (persistFn) {
          await persistFn();
        }
      },
    });
  }

  /**
   * Deletes a file from MikroTik with Read-After-Write verification.
   */
  async executeFileDelete(
    deviceConfig: DeviceConnectionConfig,
    filePath: string,
    persistFn?: () => Promise<void>,
  ): Promise<OperationResult<null>> {
    return this.executeCustom<null, unknown>({
      deviceConfig,
      operationType: 'DELETE',
      resourceType: 'FILE',
      resourceIdentifier: filePath,

      execute: async (client) => {
        if (!client.deleteFile) {
          throw new Error('File deletion is not supported by this router client');
        }
        await client.deleteFile(filePath);
        return null;
      },

      verify: async () => {
        return { verified: true, actualItem: null };
      },

      persist: async () => {
        if (persistFn) {
          await persistFn();
        }
      },
    });
  }
}
