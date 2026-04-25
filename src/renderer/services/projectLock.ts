export interface LockData {
  deviceId: string;
  deviceName: string;
  timestamp: number;
}

export const STALE_MS = 60_000;
const HEARTBEAT_MS = 30_000;

type ReadLock = () => Promise<LockData | null>;
type WriteLock = (data: LockData) => Promise<void>;
type DeleteLock = () => Promise<void>;

export async function acquireLock(
  deviceId: string,
  deviceName: string,
  read: ReadLock,
  write: WriteLock,
  force?: boolean,
): Promise<{ acquired: boolean; heldBy?: string }> {
  const existing = await read();

  if (existing && !force) {
    const age = Date.now() - existing.timestamp;
    const isStale = age > STALE_MS;
    const isSameDevice = existing.deviceId === deviceId;

    if (!isStale && !isSameDevice) {
      return { acquired: false, heldBy: existing.deviceName };
    }
  }

  await write({ deviceId, deviceName, timestamp: Date.now() });
  return { acquired: true };
}

export async function releaseLock(deleteFn: DeleteLock): Promise<void> {
  try {
    await deleteFn();
  } catch {
    // Lock file may already be gone — that's fine
  }
}

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export function startHeartbeat(
  deviceId: string,
  deviceName: string,
  read: ReadLock,
  write: WriteLock,
  onTakenOver: (byDeviceName: string) => void,
): void {
  stopHeartbeat();
  heartbeatTimer = setInterval(async () => {
    try {
      const current = await read();
      if (current && current.deviceId !== deviceId) {
        onTakenOver(current.deviceName);
        stopHeartbeat();
        return;
      }
      await write({ deviceId, deviceName, timestamp: Date.now() });
    } catch {
      // File I/O failure — skip this beat
    }
  }, HEARTBEAT_MS);
}

export function stopHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
