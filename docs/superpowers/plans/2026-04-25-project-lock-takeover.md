# Project Lock Takeover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent two devices from editing the same project simultaneously by using a heartbeat-based lock file with takeover support.

**Architecture:** A `.braidr/lock.json` file in each project directory holds the current editor's device ID, name, and timestamp. Both Electron and Capacitor data services implement `acquireProjectLock` / `releaseProjectLock`. A 30s heartbeat keeps the lock alive; stale locks (>60s) are claimed silently. Takeover overwrites the lock; the displaced device detects this on its next heartbeat and force-closes the project.

**Tech Stack:** TypeScript, Electron (Node.js fs), Capacitor (Filesystem + Preferences + Device plugins), React

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/renderer/services/projectLock.ts` | Shared lock logic: `acquireLock`, `releaseLock`, `startHeartbeat`, `stopHeartbeat`. Platform-agnostic — takes read/write/delete callbacks. |
| Modify | `src/renderer/services/dataService.ts` | Add `acquireProjectLock` / `releaseProjectLock` to `DataService` interface. Implement in `ElectronDataService` using IPC for file I/O. |
| Modify | `src/renderer/services/capacitorDataService.ts` | Implement `acquireProjectLock` / `releaseProjectLock` using Capacitor Filesystem + Preferences. |
| Modify | `src/shared/types.ts` | Add `LOCK_READ` and `LOCK_WRITE` and `LOCK_DELETE` IPC channels. |
| Modify | `src/main/preload.ts` | Duplicate new IPC channels; expose `lockRead`, `lockWrite`, `lockDelete` methods. |
| Modify | `src/main/main.ts` | Register 3 IPC handlers for lock file read/write/delete. |
| Modify | `src/renderer/assets.d.ts` | Add `lockRead`, `lockWrite`, `lockDelete` to `Window.electronAPI` type. |
| Modify | `src/renderer/App.tsx` | Call `acquireProjectLock` in `loadProjectFromPath`, show takeover dialog, call `releaseProjectLock` on close/quit. |
| Modify | `src/renderer/styles.css` | Add `.lock-takeover-*` styles for the takeover dialog. |
| Create | `src/__tests__/projectLock.test.ts` | Tests for the shared lock logic. |

---

### Task 1: Shared Lock Logic Module

**Files:**
- Create: `src/renderer/services/projectLock.ts`
- Create: `src/__tests__/projectLock.test.ts`

This module contains all lock logic, platform-agnostic. It takes callback functions for file I/O so both Electron and Capacitor can plug in their own implementations.

- [ ] **Step 1: Write the test file with core lock tests**

```typescript
// src/__tests__/projectLock.test.ts
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

    // Initial write
    expect(mockWrite).toHaveBeenCalledTimes(0);

    // Advance 30s
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockWrite).toHaveBeenCalledTimes(1);

    // Advance another 30s
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockWrite).toHaveBeenCalledTimes(2);

    stopHeartbeat();
  });

  it('calls onTakenOver when lock changes to different device', async () => {
    const onTakenOver = vi.fn();
    startHeartbeat('device-1', 'MacBook', mockRead, mockWrite, onTakenOver);

    // Simulate another device taking over
    mockFileContent = JSON.stringify({
      deviceId: 'device-2',
      deviceName: 'iPad',
      timestamp: Date.now(),
    });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(onTakenOver).toHaveBeenCalledWith('iPad');
    expect(mockWrite).not.toHaveBeenCalled(); // should NOT overwrite the new lock

    stopHeartbeat();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/projectLock.test.ts`
Expected: FAIL — module `../renderer/services/projectLock` not found.

- [ ] **Step 3: Write the projectLock module**

```typescript
// src/renderer/services/projectLock.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/projectLock.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/services/projectLock.ts src/__tests__/projectLock.test.ts
git commit -m "feat(lock): add shared project lock logic with heartbeat"
```

---

### Task 2: Electron IPC for Lock File I/O

**Files:**
- Modify: `src/shared/types.ts` (add 3 IPC channel constants)
- Modify: `src/main/preload.ts` (duplicate channels + expose 3 methods)
- Modify: `src/main/main.ts` (register 3 IPC handlers)
- Modify: `src/renderer/assets.d.ts` (add 3 type declarations)

- [ ] **Step 1: Add IPC channels to `src/shared/types.ts`**

Add these 3 entries inside the `IPC_CHANNELS` constant, after the `BRANCHES_SAVE_POSITIONS` line:

```typescript
  // Lock
  LOCK_READ: 'lock:read',
  LOCK_WRITE: 'lock:write',
  LOCK_DELETE: 'lock:delete',
```

- [ ] **Step 2: Add IPC channels + methods to `src/main/preload.ts`**

Add these 3 entries to the `IPC_CHANNELS` constant (after `BRANCHES_SAVE_POSITIONS`):

```typescript
  LOCK_READ: 'lock:read',
  LOCK_WRITE: 'lock:write',
  LOCK_DELETE: 'lock:delete',
```

Add these 3 methods to the `contextBridge.exposeInMainWorld('electronAPI', { ... })` block:

```typescript
  // Lock
  lockRead: (projectPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.LOCK_READ, projectPath),
  lockWrite: (projectPath: string, data: { deviceId: string; deviceName: string; timestamp: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.LOCK_WRITE, projectPath, data),
  lockDelete: (projectPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.LOCK_DELETE, projectPath),
```

- [ ] **Step 3: Register IPC handlers in `src/main/main.ts`**

Add these handlers near the other IPC handler registrations (after the branches block):

```typescript
// ── Lock ──────────────────────────────────────────────────────────────────
ipcMain.handle(IPC_CHANNELS.LOCK_READ, async (_event, projectPath: string) => {
  try {
    const lockPath = path.join(projectPath, '.braidr', 'lock.json');
    if (!fs.existsSync(lockPath)) {
      return { success: true, data: null };
    }
    const content = fs.readFileSync(lockPath, 'utf-8');
    return { success: true, data: JSON.parse(content) };
  } catch (err: any) {
    return { success: true, data: null };
  }
});

ipcMain.handle(IPC_CHANNELS.LOCK_WRITE, async (_event, projectPath: string, data: { deviceId: string; deviceName: string; timestamp: number }) => {
  try {
    const braidrDir = path.join(projectPath, '.braidr');
    if (!fs.existsSync(braidrDir)) {
      fs.mkdirSync(braidrDir, { recursive: true });
    }
    const lockPath = path.join(braidrDir, 'lock.json');
    const tmpPath = lockPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, lockPath);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle(IPC_CHANNELS.LOCK_DELETE, async (_event, projectPath: string) => {
  try {
    const lockPath = path.join(projectPath, '.braidr', 'lock.json');
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
    return { success: true };
  } catch (err: any) {
    return { success: true };
  }
});
```

- [ ] **Step 4: Add type declarations to `src/renderer/assets.d.ts`**

Add inside the `electronAPI` interface, after the branches block:

```typescript
    // Lock
    lockRead: (projectPath: string) => Promise<any>;
    lockWrite: (projectPath: string, data: { deviceId: string; deviceName: string; timestamp: number }) => Promise<any>;
    lockDelete: (projectPath: string) => Promise<any>;
```

- [ ] **Step 5: Verify the build compiles**

Run: `npx tsc --noEmit 2>&1 | grep -c 'error TS'`
Expected: Same count as before (pre-existing errors only, no new errors).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/preload.ts src/main/main.ts src/renderer/assets.d.ts
git commit -m "feat(lock): add Electron IPC handlers for lock file read/write/delete"
```

---

### Task 3: Device ID Generation + Storage (Electron)

**Files:**
- Modify: `src/main/main.ts` (add `getDeviceId` helper + `GET_DEVICE_INFO` IPC handler)
- Modify: `src/shared/types.ts` (add `GET_DEVICE_INFO` channel)
- Modify: `src/main/preload.ts` (add channel + `getDeviceInfo` method)
- Modify: `src/renderer/assets.d.ts` (add `getDeviceInfo` type)

- [ ] **Step 1: Add IPC channel to `src/shared/types.ts`**

Add inside `IPC_CHANNELS`, after `LOCK_DELETE`:

```typescript
  GET_DEVICE_INFO: 'get-device-info',
```

- [ ] **Step 2: Add channel + method to `src/main/preload.ts`**

Add to `IPC_CHANNELS`:

```typescript
  GET_DEVICE_INFO: 'get-device-info',
```

Add to `contextBridge.exposeInMainWorld`:

```typescript
  getDeviceInfo: () => ipcRenderer.invoke(IPC_CHANNELS.GET_DEVICE_INFO),
```

- [ ] **Step 3: Implement in `src/main/main.ts`**

Add a helper function near the top (after `getConfigPath`):

```typescript
const getDeviceConfigPath = () => path.join(app.getPath('userData'), 'device.json');

function getDeviceInfo(): { deviceId: string; deviceName: string } {
  const configPath = getDeviceConfigPath();
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      // Corrupted — regenerate below
    }
  }
  const info = {
    deviceId: Math.random().toString(16).substring(2, 10),
    deviceName: os.hostname(),
  };
  fs.writeFileSync(configPath, JSON.stringify(info, null, 2), 'utf-8');
  return info;
}
```

Add IPC handler (near the lock handlers):

```typescript
ipcMain.handle(IPC_CHANNELS.GET_DEVICE_INFO, async () => {
  return { success: true, data: getDeviceInfo() };
});
```

Ensure `os` is imported at the top of main.ts. Check if it's already imported:

```typescript
import * as os from 'os';
```

- [ ] **Step 4: Add type to `src/renderer/assets.d.ts`**

Add inside `electronAPI`:

```typescript
    getDeviceInfo: () => Promise<any>;
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -c 'error TS'`
Expected: Same count as before.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/preload.ts src/main/main.ts src/renderer/assets.d.ts
git commit -m "feat(lock): add device ID generation and storage for Electron"
```

---

### Task 4: ElectronDataService Lock Methods

**Files:**
- Modify: `src/renderer/services/dataService.ts` (add to interface + implement in ElectronDataService)

- [ ] **Step 1: Add methods to the `DataService` interface**

Add after the `compareBranches` method in the interface:

```typescript
  // Lock
  acquireProjectLock(projectPath: string, force?: boolean): Promise<{ acquired: boolean; heldBy?: string }>;
  releaseProjectLock(projectPath: string): Promise<void>;
  startLockHeartbeat(projectPath: string, onTakenOver: (byDeviceName: string) => void): void;
  stopLockHeartbeat(): void;
```

- [ ] **Step 2: Add imports at the top of the file**

Add to the imports:

```typescript
import { acquireLock, releaseLock, startHeartbeat, stopHeartbeat, LockData } from './projectLock';
```

- [ ] **Step 3: Implement in `ElectronDataService`**

Add a `deviceInfo` private field and implement the 4 methods at the end of the class (before the closing brace):

```typescript
  private deviceInfo: { deviceId: string; deviceName: string } | null = null;

  private async getDeviceInfo(): Promise<{ deviceId: string; deviceName: string }> {
    if (this.deviceInfo) return this.deviceInfo;
    const result = await window.electronAPI.getDeviceInfo();
    if (!result.success) throw new Error('Failed to get device info');
    this.deviceInfo = result.data;
    return result.data;
  }

  private readLock(projectPath: string): () => Promise<LockData | null> {
    return async () => {
      const result = await window.electronAPI.lockRead(projectPath);
      return result.success ? result.data : null;
    };
  }

  private writeLock(projectPath: string): (data: LockData) => Promise<void> {
    return async (data: LockData) => {
      const result = await window.electronAPI.lockWrite(projectPath, data);
      if (!result.success) throw new Error(result.error || 'Failed to write lock');
    };
  }

  private deleteLock(projectPath: string): () => Promise<void> {
    return async () => {
      await window.electronAPI.lockDelete(projectPath);
    };
  }

  async acquireProjectLock(projectPath: string, force?: boolean): Promise<{ acquired: boolean; heldBy?: string }> {
    const { deviceId, deviceName } = await this.getDeviceInfo();
    return acquireLock(deviceId, deviceName, this.readLock(projectPath), this.writeLock(projectPath), force);
  }

  async releaseProjectLock(projectPath: string): Promise<void> {
    stopHeartbeat();
    await releaseLock(this.deleteLock(projectPath));
  }

  startLockHeartbeat(projectPath: string, onTakenOver: (byDeviceName: string) => void): void {
    this.getDeviceInfo().then(({ deviceId, deviceName }) => {
      startHeartbeat(deviceId, deviceName, this.readLock(projectPath), this.writeLock(projectPath), onTakenOver);
    });
  }

  stopLockHeartbeat(): void {
    stopHeartbeat();
  }
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -c 'error TS'`
Expected: Will likely show errors because `CapacitorDataService` doesn't implement the new methods yet. That's expected — Task 5 fixes this.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/services/dataService.ts
git commit -m "feat(lock): implement acquireProjectLock/releaseProjectLock in ElectronDataService"
```

---

### Task 5: CapacitorDataService Lock Methods

**Files:**
- Modify: `src/renderer/services/capacitorDataService.ts`

- [ ] **Step 1: Add import for the shared lock module**

Add to the imports at the top:

```typescript
import { acquireLock, releaseLock, startHeartbeat, stopHeartbeat, LockData } from './projectLock';
```

- [ ] **Step 2: Add a helper for device info using Capacitor Preferences**

Add a module-level helper after the existing `generateId()` function:

```typescript
async function getCapacitorDeviceInfo(): Promise<{ deviceId: string; deviceName: string }> {
  const { value } = await Preferences.get({ key: 'deviceInfo' });
  if (value) {
    try { return JSON.parse(value); } catch { /* regenerate */ }
  }
  let deviceName = 'iPad';
  try {
    const { Device } = await import('@capacitor/device');
    const info = await Device.getInfo();
    deviceName = info.name || info.model || 'iPad';
  } catch { /* fallback to 'iPad' */ }
  const info = {
    deviceId: Math.random().toString(16).substring(2, 10),
    deviceName,
  };
  await Preferences.set({ key: 'deviceInfo', value: JSON.stringify(info) });
  return info;
}
```

- [ ] **Step 3: Implement the 4 lock methods in `CapacitorDataService`**

Add at the end of the class (before the closing brace):

```typescript
  async acquireProjectLock(projectPath: string, force?: boolean): Promise<{ acquired: boolean; heldBy?: string }> {
    const { deviceId, deviceName } = await getCapacitorDeviceInfo();
    const read = async (): Promise<LockData | null> => {
      const content = await readTextFile(`${projectPath}/.braidr/lock.json`);
      if (!content) return null;
      try { return JSON.parse(content); } catch { return null; }
    };
    const write = async (data: LockData): Promise<void> => {
      await writeTextFile(`${projectPath}/.braidr/lock.json`, JSON.stringify(data, null, 2));
    };
    return acquireLock(deviceId, deviceName, read, write, force);
  }

  async releaseProjectLock(projectPath: string): Promise<void> {
    stopHeartbeat();
    await releaseLock(async () => {
      try {
        await Filesystem.deleteFile(fsOptions(`${projectPath}/.braidr/lock.json`));
      } catch { /* already gone */ }
    });
  }

  startLockHeartbeat(projectPath: string, onTakenOver: (byDeviceName: string) => void): void {
    getCapacitorDeviceInfo().then(({ deviceId, deviceName }) => {
      const read = async (): Promise<LockData | null> => {
        const content = await readTextFile(`${projectPath}/.braidr/lock.json`);
        if (!content) return null;
        try { return JSON.parse(content); } catch { return null; }
      };
      const write = async (data: LockData): Promise<void> => {
        await writeTextFile(`${projectPath}/.braidr/lock.json`, JSON.stringify(data, null, 2));
      };
      startHeartbeat(deviceId, deviceName, read, write, onTakenOver);
    });
  }

  stopLockHeartbeat(): void {
    stopHeartbeat();
  }
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -c 'error TS'`
Expected: Same count as before Tasks 2-4 (no new errors).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/services/capacitorDataService.ts
git commit -m "feat(lock): implement lock methods in CapacitorDataService"
```

---

### Task 6: App.tsx Integration — Acquire Lock, Takeover Dialog, Release Lock

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Add state variables for the takeover dialog**

In App.tsx, near the other modal state variables (around line 197 where `showCompareView` is), add:

```typescript
const [lockConflict, setLockConflict] = useState<{ projectPath: string; projectName?: string; heldBy: string } | null>(null);
const [takenOverBy, setTakenOverBy] = useState<string | null>(null);
```

- [ ] **Step 2: Add lock acquisition to `loadProjectFromPath`**

At the start of `loadProjectFromPath` (line ~1068, right after `loadInProgressRef.current = true;` and before `const data = await dataService.loadProject(folderPath);`), add:

```typescript
    // Acquire project lock
    try {
      const lockResult = await dataService.acquireProjectLock(folderPath);
      if (!lockResult.acquired) {
        loadInProgressRef.current = false;
        setLockConflict({ projectPath: folderPath, projectName: projectName, heldBy: lockResult.heldBy || 'another device' });
        return;
      }
    } catch (err) {
      console.warn('Lock acquisition failed, proceeding anyway:', err);
    }
```

- [ ] **Step 3: Start heartbeat after successful project load**

At the end of `loadProjectFromPath` (inside the `try` block, before the `finally`), add:

```typescript
    // Start lock heartbeat
    dataService.startLockHeartbeat(folderPath, (byDeviceName) => {
      // Force-close: save pending changes and return to project picker
      if (isDirtyRef.current && projectData) {
        editorViewRef.current?.flush();
        saveTimelineData(projectData.scenes, sceneConnections, braidedChapters).catch(() => {});
      }
      dataService.stopLockHeartbeat();
      setTakenOverBy(byDeviceName);
      setProjectData(null);
    });
```

- [ ] **Step 4: Release lock on project close**

Find the "Switch Project" button handler (around line 4827). It currently does:

```typescript
onClick={async () => {
  if (timerRunning) handleStopTimer();
  if (taskTimerRunning) handleStopTaskTimer();
  if (isDirtyRef.current) {
    editorViewRef.current?.flush();
    if (projectData) {
      await saveTimelineData(projectData.scenes, sceneConnections, braidedChapters);
    }
  }
  setProjectData(null);
  setShowSettingsMenu(false);
}}
```

Add lock release before `setProjectData(null)`:

```typescript
  if (projectData) {
    await dataService.releaseProjectLock(projectData.projectPath);
  }
```

- [ ] **Step 5: Release lock on app quit**

In the `onAppClosing` handler (around line 2455), add lock release before `api.safeToClose()`:

```typescript
        // Release project lock
        if (projectData) {
          try {
            await dataService.releaseProjectLock(projectData.projectPath);
          } catch { /* best-effort */ }
        }
```

- [ ] **Step 6: Add takeover confirmation dialog JSX**

Near the end of the JSX (near where CompareView and MergeDialog are rendered, around line 5090), add:

```tsx
      {/* Lock Takeover Dialog */}
      {lockConflict && (
        <div className="lock-takeover-overlay" onClick={() => setLockConflict(null)}>
          <div className="lock-takeover-dialog" onClick={e => e.stopPropagation()}>
            <h3>Project already open</h3>
            <p>
              This project is currently being edited on <strong>{lockConflict.heldBy}</strong>.
            </p>
            <p>Taking over will close the project on that device.</p>
            <div className="lock-takeover-actions">
              <button onClick={() => setLockConflict(null)}>Cancel</button>
              <button
                className="lock-takeover-confirm"
                onClick={async () => {
                  const { projectPath, projectName } = lockConflict;
                  setLockConflict(null);
                  await dataService.acquireProjectLock(projectPath, true);
                  await loadProjectFromPath(projectPath, projectName);
                }}
              >
                Take Over
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Taken Over Toast */}
      {takenOverBy && (
        <div className="lock-taken-over-toast" onClick={() => setTakenOverBy(null)}>
          Editing moved to {takenOverBy}. Project closed.
        </div>
      )}
```

- [ ] **Step 7: Add the auto-dismiss effect for the toast**

Add a useEffect near the other effects:

```typescript
  useEffect(() => {
    if (!takenOverBy) return;
    const timer = setTimeout(() => setTakenOverBy(null), 5000);
    return () => clearTimeout(timer);
  }, [takenOverBy]);
```

- [ ] **Step 8: Add CSS styles to `src/renderer/styles.css`**

Add at the end of the file:

```css
/* Lock Takeover Dialog */
.lock-takeover-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.lock-takeover-dialog {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  max-width: 400px;
  width: 90%;
}

.lock-takeover-dialog h3 {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
}

.lock-takeover-dialog p {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.lock-takeover-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.lock-takeover-actions button {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}

.lock-takeover-confirm {
  background: var(--accent) !important;
  border-color: var(--accent) !important;
  color: #fff !important;
  font-weight: 600;
}

.lock-takeover-confirm:hover {
  background: var(--accent-hover) !important;
}

/* Taken Over Toast */
.lock-taken-over-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 20px;
  font-size: 13px;
  color: var(--text-primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 10000;
  cursor: pointer;
  animation: lock-toast-in 0.3s ease;
}

@keyframes lock-toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
```

- [ ] **Step 9: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -c 'error TS'`
Expected: Same count as before.

- [ ] **Step 10: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/App.tsx src/renderer/styles.css
git commit -m "feat(lock): integrate lock takeover dialog and heartbeat in App.tsx"
```

---

### Task 7: Manual Testing Checklist

Test in the running Electron app.

- [ ] **Step 1: Open a project — verify lock file created**

1. Start the dev server: `npm run dev`
2. Open any project
3. Check that `{projectPath}/.braidr/lock.json` exists and contains `deviceId`, `deviceName`, `timestamp`

- [ ] **Step 2: Verify heartbeat updates timestamp**

1. Wait 30+ seconds with the project open
2. Re-read `lock.json` — timestamp should have been updated

- [ ] **Step 3: Switch project — verify lock file deleted**

1. Click "Switch Project" (home button)
2. Check that `lock.json` no longer exists in the previous project

- [ ] **Step 4: Simulate takeover dialog**

1. Open a project
2. Manually edit `lock.json` to change `deviceId` to something else and set `timestamp` to `Date.now()` (use terminal: `echo '{"deviceId":"other","deviceName":"iPad","timestamp":'$(date +%s)000'}' > path/.braidr/lock.json`)
3. Close and re-open the same project
4. Should see "Project already open" dialog with "iPad" as the device name
5. Click "Cancel" — should return to project picker
6. Re-open the project, click "Take Over" — should proceed to open

- [ ] **Step 5: Simulate being taken over**

1. Open a project
2. Wait for a heartbeat cycle (~30s)
3. Manually overwrite `lock.json` with a different `deviceId` and fresh `timestamp`
4. Wait for next heartbeat (~30s)
5. Should see toast "Editing moved to [device]. Project closed." and return to project picker

- [ ] **Step 6: Verify stale lock is claimed silently**

1. Open a project, then quit the app (Cmd+Q)
2. Manually set `lock.json` timestamp to 2 minutes ago
3. Re-open the app, open the same project
4. Should open without showing takeover dialog (stale lock)

- [ ] **Step 7: Commit any fixes needed**

```bash
git add -A
git commit -m "fix(lock): adjustments from manual testing"
```
