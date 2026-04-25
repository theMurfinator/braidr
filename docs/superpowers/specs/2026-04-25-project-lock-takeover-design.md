# Project Lock Takeover

Cross-device lock system so only one device edits a project at a time. No backend — uses a lock file in the project directory, synced via iCloud/Dropbox.

## Lock File

**Location:** `{projectPath}/.braidr/lock.json`

```json
{
  "deviceId": "a8f3c912",
  "deviceName": "Brian's MacBook",
  "timestamp": 1714070400000
}
```

- `deviceId` — random 8-char hex, generated once per app install, stored in app settings (Electron: `electron-store`; Capacitor: `Preferences`).
- `deviceName` — human-readable label shown in the takeover dialog. Electron: `os.hostname()`; Capacitor: `Device.getInfo().name`.
- `timestamp` — `Date.now()`, updated every 30s by the heartbeat.

A lock is **stale** if `Date.now() - timestamp > 60000` (60 seconds — two missed heartbeats).

## Lifecycle

### On Project Open

Read `.braidr/lock.json`. Three cases:

1. **No lock file / stale lock** — claim silently (write your own lock).
2. **Active lock, same `deviceId`** — claim silently (reopening your own project).
3. **Active lock, different `deviceId`** — show takeover confirmation dialog.

### Heartbeat

`setInterval` every 30s:

1. Re-read lock file.
2. If `deviceId` still matches yours, update `timestamp` and write back.
3. If `deviceId` does NOT match (someone took over), trigger force-close.

### On Takeover Confirmed

Overwrite `lock.json` with your device info. The other device's next heartbeat sees a different `deviceId` and force-closes.

### On Project Close / App Quit

Delete `lock.json`. Stop the heartbeat interval.

If the app crashes, the heartbeat stops and the lock becomes stale after 60s — next open from any device claims it silently.

## Force-Close Behavior

When the heartbeat detects you've been taken over:

1. Save any pending changes (one final save attempt).
2. Show a brief toast: "Editing moved to [device name]. Project closed."
3. Close the project, return to the project picker.
4. Stop the heartbeat interval.

## UI: Takeover Dialog

Modal shown when opening a project with an active lock from another device:

> **Project already open**
>
> This project is currently being edited on **Brian's iPad**.
>
> Taking over will close the project on that device.
>
> [ Cancel ] [ Take Over ]

"Cancel" returns to the project picker without opening. "Take Over" overwrites the lock and proceeds with loading.

## Data Service Interface

Two new methods on `DataService`:

```typescript
acquireProjectLock(projectPath: string, force?: boolean): Promise<{ acquired: boolean; heldBy?: string }>;
releaseProjectLock(projectPath: string): Promise<void>;
```

- `acquireProjectLock` — checks lock, claims if stale/absent/same device. If active lock from another device and `force` is false, returns `{ acquired: false, heldBy: "Brian's iPad" }`. If `force` is true, overwrites regardless.
- `releaseProjectLock` — deletes lock file, stops heartbeat.

Both `ElectronDataService` and `CapacitorDataService` implement these methods. Heartbeat start/stop is internal to the data service — started when lock is acquired, stopped on release.

## Device ID Storage

- **Electron:** Stored in `electron-store` app config alongside recent projects. Generated on first launch if missing.
- **Capacitor:** Stored in `Preferences` (Capacitor key-value storage). Same generation logic.

## App.tsx Integration

In `loadProjectFromPath`:

1. Call `acquireProjectLock(projectPath)`.
2. If `acquired: true` — proceed with loading.
3. If `acquired: false` — show takeover dialog with `heldBy` device name.
4. On "Take Over" — call `acquireProjectLock(projectPath, true)`, then load.
5. On "Cancel" — return to project picker.

On project close or switching projects, call `releaseProjectLock`.

## Scope

- Electron (Mac) and Capacitor (iPad) both implement the lock system.
- No new IPC channels needed for Electron — lock file I/O happens in the data service layer (renderer for Capacitor, main process for Electron via existing file operations).
- No backend server, no network calls.
