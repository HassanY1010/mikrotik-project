import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SingleInstanceLock } from './single-instance-lock';

describe('SingleInstanceLock (Priority P1)', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sudafi-lock-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should acquire lock successfully when no other instance exists', () => {
    const lock = new SingleInstanceLock(testDir);
    const result = lock.acquire('test-agent-1');

    expect(result.acquired).toBe(true);
    expect(fs.existsSync(lock.getLockPath())).toBe(true);

    const content = JSON.parse(fs.readFileSync(lock.getLockPath(), 'utf8'));
    expect(content.pid).toBe(process.pid);
    expect(content.agentName).toBe('test-agent-1');

    lock.release();
    expect(fs.existsSync(lock.getLockPath())).toBe(false);
  });

  it('should reject acquisition if active process PID holds the lock', () => {
    const lock1 = new SingleInstanceLock(testDir);
    const res1 = lock1.acquire('agent-primary');
    expect(res1.acquired).toBe(true);

    // Second instance attempting to acquire the same lock path
    const lock2 = new SingleInstanceLock(testDir);
    const res2 = lock2.acquire('agent-duplicate');

    expect(res2.acquired).toBe(false);
    expect(res2.existingPid).toBe(process.pid);

    lock1.release();
  });

  it('should reclaim stale lock file if the recorded PID is dead', () => {
    const lockPath = path.join(testDir, '.agent.lock');
    // Write dead/non-existent PID (e.g., 99999999)
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: 99999999, startedAt: new Date().toISOString() }),
      'utf8',
    );

    const lock = new SingleInstanceLock(testDir);
    const result = lock.acquire('agent-reclaimer');

    expect(result.acquired).toBe(true);
    const content = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    expect(content.pid).toBe(process.pid);

    lock.release();
  });
});
