import * as fs from 'fs';
import * as path from 'path';

export interface LockInfo {
  pid: number;
  startedAt: string;
  agentName?: string;
}

export class SingleInstanceLock {
  private lockFilePath: string;
  private isLocked = false;

  constructor(customDirectory?: string) {
    const baseDir =
      customDirectory ||
      (process.env.APPDATA ? path.join(process.env.APPDATA, 'SudaFiAgent') : process.cwd());

    if (!fs.existsSync(baseDir)) {
      try {
        fs.mkdirSync(baseDir, { recursive: true });
      } catch {
        // Fallback to current working directory if AppData is not writable
      }
    }

    this.lockFilePath = path.join(baseDir, '.agent.lock');
  }

  /**
   * Attempts to acquire the single-instance lock.
   * Returns true if lock was acquired, false if another active instance is running.
   */
  acquire(agentName?: string): { acquired: boolean; existingPid?: number } {
    if (this.isLocked) {
      return { acquired: true };
    }

    if (fs.existsSync(this.lockFilePath)) {
      try {
        const raw = fs.readFileSync(this.lockFilePath, 'utf8');
        const info: LockInfo = JSON.parse(raw);

        if (this.isProcessRunning(info.pid)) {
          return { acquired: false, existingPid: info.pid };
        }

        // Stale lock from previously terminated process
        this.forceRelease();
      } catch {
        // Corrupt lock file, overwrite it
        this.forceRelease();
      }
    }

    const payload: LockInfo = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      agentName,
    };

    try {
      fs.writeFileSync(this.lockFilePath, JSON.stringify(payload, null, 2), 'utf8');
      this.isLocked = true;
      this.registerExitHooks();
      return { acquired: true };
    } catch (err) {
      return { acquired: false };
    }
  }

  /**
   * Releases the lock file.
   */
  release(): void {
    if (!this.isLocked) return;
    this.forceRelease();
    this.isLocked = false;
  }

  /**
   * Checks if a process with given PID is currently alive.
   */
  isProcessRunning(pid: number): boolean {
    if (!pid || pid <= 0) return false;
    try {
      // Sending signal 0 checks for process existence without killing it
      process.kill(pid, 0);
      return true;
    } catch (err: any) {
      // ESRCH means process does not exist
      return err.code === 'EPERM'; // EPERM means process exists but we lack permission to signal it
    }
  }

  private forceRelease(): void {
    try {
      if (fs.existsSync(this.lockFilePath)) {
        fs.unlinkSync(this.lockFilePath);
      }
    } catch {
      // Ignore cleanup error
    }
  }

  private registerExitHooks(): void {
    const cleanup = () => {
      this.release();
    };

    process.once('exit', cleanup);
    process.once('SIGINT', () => {
      cleanup();
      process.exit(0);
    });
    process.once('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });
  }

  getLockPath(): string {
    return this.lockFilePath;
  }
}
