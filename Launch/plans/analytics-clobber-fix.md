# PLAN: Analytics cross-project clobber — root-cause fix + data recovery

Status: DONE (2026-07-03) — code fix committed as e64f6eb on feature/braided-counts-notes-polish (not pushed, not merged); data repair executed, lost sessions recovered GRANULARLY from the rescue WAL via frame replay (~659 min across 2026-06-28..07-02, larger than the 3.08h launcher estimate); demo analytics reset to defaults. Repair script: Launch/plans/repair-analytics-20260703.mjs. Note: the plan's raw-byte WAL scan fails by construction (frame headers interrupt any blob over one 4096-byte page); the script's added frame-replay strategy is what worked.
Repo: /Users/brian/braidr (branch feature/braided-counts-notes-polish, HAS uncommitted changes)

## Diagnosis (established from live data; do not re-derive)

Analytics for each project live as ONE JSON blob in the project's SQLite `settings` table (key `analytics`), managed in the renderer via `analyticsRef` (App.tsx) and `src/renderer/utils/analyticsStore.ts`.

**Root cause:** on project switch, `analyticsRef.current` still holds the PREVIOUS project's blob while `projectData.projectPath` already points at the NEW project (loadAnalytics is async). Several code paths call `saveAnalytics(projectData.projectPath, analyticsRef.current)`, which writes project A's entire blob into project B's file, last writer wins. Proven: demo-project.braidr contains an exact stale copy of America America's analytics (goal, snapshots, sessions); today at ~11:36 the stale demo copy was written back over America America, destroying sceneSessions for 2026-06-27..07-02 (~3.08h). The launcher cache (recent-projects.json, written 11:32) still shows those hours; the DB now ends at 06-26.

**Secondary defect:** `repairManuscriptSnapshots` re-chains every day's baseline to the previous day's `latest`. Poison entries (`latest: 859` = the demo's braided total written into AA's history on earlier occurrences) are "healed" by carrying 44,837 forward, and today's braided-only total (39,959) then renders as 39,959 − 44,837 = **−4,878**. Any repair of the data must be accompanied by a code change or the re-chaining reproduces the corruption on next load.

Rescue copies of both DBs + WAL are at `/Users/brian/braidr/Launch/rescue-20260703/` (taken 11:49, before any repair).

## Order of work

Phase B (code fix + tests) FIRST, then Phase A (data repair), because repair output depends on the new `rebased` flag. Braidr the app must NOT be running during Phase A: check with `pgrep -if braidr` (ignore this CLI session's own processes; look for the Electron app). If the app is running when you reach Phase A, STOP and report.

## Phase B — Code fix (TDD: write the failing tests first)

Before starting: the working tree has uncommitted changes (App.tsx and mcp-server files). First commit the EXISTING App.tsx changes alone as `WIP: braided counts polish (pre-existing)` so the fix lands as its own commit. Leave mcp-server changes unstaged. Do not push.

### B1. analyticsStore.ts
- `DailyManuscript` gains optional `rebased?: boolean`.
- `repairManuscriptSnapshots`: when an entry has `rebased: true`, do NOT re-chain its baseline from prevLatest and do NOT treat its lower `latest` as a collapse; its `latest` becomes the new running total going forward.
- `recordManuscriptSnapshot`: preserve an existing entry's `rebased` flag when updating `latest` (currently rebuilds the object with only baseline/latest).
- New pure function `canPersistAnalytics(loadedForPath: string | null, targetPath: string | null): boolean` — true only when both are non-null and equal.

### B2. App.tsx
- Add `analyticsPathRef = useRef<string | null>(null)` next to `analyticsRef`.
- In the project-load effect (~line 964): synchronously set `analyticsRef.current = null` and `analyticsPathRef.current = null` BEFORE the async `loadAnalytics` call; on resolve, set both (`analyticsPathRef.current = projectData.projectPath`).
- Add a `persistAnalytics(updated: AnalyticsData)` helper that: checks `canPersistAnalytics(analyticsPathRef.current, projectData?.projectPath ?? null)`; if false, `console.error` with both paths and `track('analytics_write_blocked', {...})`, and does NOT write; if true, calls `saveAnalytics`. Replace EVERY direct `saveAnalytics(projectData.projectPath, ...)` call site (grep shows lines ~960, 990, 1016, 1041, 1063, 1076, 1087, 3118, 4156 — grep again, replace all).
- Session teardown ordering: find where the session tracker is created/destroyed (`createSessionTracker`; locate its definition). Ensure that when the project-load effect's CLEANUP runs on switch, any active session is ended and merged/persisted using the OLD closure's projectData/paths BEFORE the new effect nulls the refs. If tracker.destroy() already ends without persisting, add an explicit end+persist in the cleanup using closure-captured values. Read the tracker code before deciding; report what you found.

### B3. Main process guard (defense in depth), braidrIpc.ts (or wherever the saveAnalytics IPC handler lives; grep `saveAnalytics` in src/main)
- On save: stamp the blob with `_projectStamp` = the target project's absolute path before persisting.
- If the INCOMING blob already carries a `_projectStamp` that differs from the target path → reject the write (`{ success: false, error: 'analytics stamp mismatch' }`) and console.error. This makes cross-project blob transplants impossible even if the renderer regresses.
- On load: return the blob as stored (stamp included is fine; renderer ignores it). Ensure the renderer never strips it (it won't; it spreads).
- Careful: legitimate first save to a NEW project of a blob with no stamp must succeed; a blob loaded from project X and saved back to project X must succeed.

### B4. Tests (write FIRST, watch them fail, then implement)
Extend `src/__tests__/analytics-word-snapshot.test.ts` (follow its existing patterns):
1. repair: entry with `rebased: true` keeps its own baseline; days after it chain from ITS latest; no phantom negative delta across a basis drop.
2. repair: existing collapse-then-recover healing still works (regression).
3. recordManuscriptSnapshot preserves `rebased` on same-day update.
4. `canPersistAnalytics`: null loadedFor → false; mismatched paths → false; matching → true.
Run the full test suite (`npm test`) and ensure no existing tests break.

## Phase A — Data repair (app closed; use rescue copies as source, write to LIVE files)

Write a one-off Node script at `Launch/plans/repair-analytics-20260703.mjs` using better-sqlite3 from the repo's node_modules. Steps:

1. Verify app not running. Make timestamped `.pre-repair` copies of the LIVE AA db trio and demo db before writing anything.
2. **Recover lost sessions from the rescue WAL** (`Launch/rescue-20260703/America America.braidr-wal`): scan the raw bytes for JSON strings containing `"sceneSessions"` (they are full settings values). Extract candidate JSON blobs (balanced-brace scan around each match; tolerate failures). Parse; among blobs whose sceneSessions include dates in 2026-06-27..2026-07-02, pick the one with the LARGEST total sceneSessions count. Report which dates/durations it contains.
3. **Merge into live AA blob**: union sceneSessions by `id` (recovered ∪ current); union `sessions` arrays by date preferring the entry with larger duration; keep current blob for everything else (goals, milestones, streaks).
4. **Fix dailyManuscript in the merged blob**: for every entry whose `latest` is 859 (2026-06-25, 06-28, 06-30 and any others), set `{ baseline: 44837, latest: 44837 }`. Set `2026-07-03` to `{ baseline: 39959, latest: 39959, rebased: true }`. Leave all earlier entries untouched.
5. Write the merged blob back to LIVE AA `settings.analytics`.
6. **Demo project** (`/Users/brian/braidr-backup-20260528-065303/demo-project/demo-project.braidr`): replace its `settings.analytics` with a fresh default blob (empty sessions/sceneSessions/dailyManuscript, goals disabled, default milestones) — its current contents are a stolen AA copy.
7. Print before/after: AA sceneSessions minutes per day for 2026-06-20..07-03, AA dailyManuscript last 10 entries, demo analytics summary. Fallback: if step 2 finds nothing usable, restore the five lost days as aggregate manual sessions (`sceneKey: 'manual:recovered'`, wordsNet 0) with durations from recent-projects.json weeklyPerDayHours: Sat 0.9195725h, Sun 1.0400516666666666h, Mon 0.14733305555555556h, Tue 0.49405305555555556h, Wed 0.47780361111111114h (dates 2026-06-27..07-01), and say so in the report.

## Ship & report
- Commit the code fix (and tests) as its own commit on the current branch: `Fix analytics cross-project clobber: path-guarded persists, IPC stamp guard, rebase-aware repair`. Ending with: Co-Authored-By: Claude Sonnet <noreply@anthropic.com>. Do NOT push, do NOT merge (merging to main auto-releases; Brian decides when).
- Keep the repair script in place (it is the audit trail), and update this plan's Status to DONE with commit hash.
- Report: test results (paste output), every call site replaced, what the tracker teardown investigation found, repair before/after numbers, and recovered-vs-fallback for the lost hours.
- If ANYTHING is ambiguous or fails, STOP and report rather than improvise. Do not touch scenes/drafts/notes tables under any circumstances.
