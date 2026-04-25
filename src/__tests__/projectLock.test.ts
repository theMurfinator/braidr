import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { acquireLock, releaseLock, startHeartbeat, stopHeartbeat, STALE_MS } from '../renderer/services/projectLock';

interface LockData {
  deviceId: string;
  deviceName: string;
  timestamp: number;
}

let mockFileContent: string | null = null;
const mockRead = vi.fn(async (): Promise<LockData | null> => {
  return mockFileContent ? JSON.parse(mockFileContent) : null;
});
const mockWrite = vi.fn(async (data: LockData): Promise<void> => {
  mockFileContent = JSON.stringify(data);
});
const mockDelete = vi.fn(async (): Promise<void> => {
  mockFileContent = null;
});

beforeEach(() => {
  mockFileContent = null;
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  stopHeartbeat();
  vi.useRealTimers();
});

describe('acquireLock', () => {
  it('claims lock when no lock file exists', async () => {
    const result = await acquireLock('device-1', 'MacBook', mockRead, mockWrite);
    expect(result).toEqual({ acquired: true });
    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: 'device-1', deviceName: 'MacBook' })
    );
  });

  it('claims lock when existing lock is stale', async () => {
    mockFileContent = JSON.stringify({
      deviceId: 'device-2',
      deviceName: 'iPad',
      timestamp: Date.now() - STALE_MS - 1000,
    });
    const result = await acquireLock('device-1', 'MacBook', mockRead, mockWrite);
    expect(result).toEqual({ acquired: true });
  });

  it('claims lock when same device already holds it', async () => {
    mockFileContent = JSON.stringify({
      deviceId: 'device-1',
      deviceName: 'MacBook',
      timestamp: Date.now(),
    });
    const result = await acquireLock('device-1', 'MacBook', mockRead, mockWrite);
    expect(result).toEqual({ acquired: true });
  });

  it('returns heldBy when different device holds active lock', async () => {
    mockFileContent = JSON.stringify({
      deviceId: 'device-2',
      deviceName: 'iPad',
      timestamp: Date.now(),
    });
    const result = await acquireLock('device-1', 'MacBook', mockRead, mockWrite);
    expect(result).toEqual({ acquired: false, heldBy: 'iPad' });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('force-acquires lock even when held by another device', async () => {
    mockFileContent = JSON.stringify({
      deviceId: 'device-2',
      deviceName: 'iPad',
      timestamp: Date.now(),
    });
    const result = await acquireLock('device-1', 'MacBook', mockRead, mockWrite, true);
    expect(result).toEqual({ acquired: true });
    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: 'device-1' })
    );
  });
});

describe('releaseLock', () => {
  it('deletes the lock file', async () => {
    mockFileContent = JSON.stringify({
      deviceId: 'device-1',
      deviceName: 'MacBook',
      timestamp: Date.now(),
    });
    await releaseLock(mockDelete);
    expect(mockDelete).toHaveBeenCalled();
  });
});

describe('heartbeat', () => {
  it('updates timestamp on interval', async () => {
    const onTakenOver = vi.fn();
    startHeartbeat('device-1', 'MacBook', mockRead, mockWrite, onTakenOver);
    expect(mockWrite).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockWrite).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockWrite).toHaveBeenCalledTimes(2);
    stopHeartbeat();
  });

  it('calls onTakenOver when lock changes to different device', async () => {
    const onTakenOver = vi.fn();
    startHeartbeat('device-1', 'MacBook', mockRead, mockWrite, onTakenOver);
    mockFileContent = JSON.stringify({
      deviceId: 'device-2',
      deviceName: 'iPad',
      timestamp: Date.now(),
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onTakenOver).toHaveBeenCalledWith('iPad');
    expect(mockWrite).not.toHaveBeenCalled();
    stopHeartbeat();
  });
});
