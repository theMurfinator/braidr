// Phase 4g: all writes formerly here are now named mutations.
// This file is kept as a stub until the BRAIDR_SAVE_TIMELINE IPC handler
// is removed and the braidrSaveTimeline preload binding is cleaned up.

import type { BraidrDB } from './database';

export interface SaveTimelinePayload {
  // All fields removed in Phase 4g — writes go through named mutations.
  // The type is kept so the IPC handler compiles; its argument is now ignored.
  [key: string]: unknown;
}

export function applySaveTimeline(_db: BraidrDB, _payload: SaveTimelinePayload): void {
  // No-op: all settings/tag writes are now mutations wired at the point of change.
}
