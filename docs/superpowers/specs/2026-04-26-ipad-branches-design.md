# iPad Branch Operations

Port the draft branch operations from Electron (Node.js `fs`) to Capacitor (Filesystem API) so branches work on the iPad companion app.

## Reference Implementation

`src/main/branches.ts` contains the Node.js implementation. The Capacitor version mirrors the same logic using the async helpers already in `capacitorDataService.ts`:

- `readTextFile(path)` — reads UTF-8 file, returns `null` if missing
- `writeTextFile(path, content)` — writes UTF-8 file, creates parent dirs
- `listDir(path)` — lists entries in a directory, returns `[]` if missing
- `Filesystem.deleteFile(fsOptions(path))` — deletes a file
- `Filesystem.copy({ from, to })` — copies a file

## Branch Storage Layout

Same as desktop — all relative to the project path:

```
branches/
  index.json              # { branches: BranchInfo[], activeBranch: string | null }
  my-branch/
    character-a.md
    character-b.md
    positions.json
```

## Methods to Implement

Replace the 6 stubs in `CapacitorDataService` (lines 693-715) with real implementations.

### `listBranches(projectPath)`

Read `branches/index.json`. Return `{ branches: [], activeBranch: null }` if missing.

### `createBranch(projectPath, name, description?)`

1. Read the current index to find the active branch (source).
2. List `.md` files from the source directory (project root if main, `branches/{activeBranch}/` if on a branch). Filter to `.md` files, exclude `CLAUDE*` and `README*`.
3. Read positions from the source (main = `timeline.json` `.positions`, branch = `branches/{name}/positions.json`).
4. For each `.md` file, read from source and write to `branches/{name}/{file}`.
5. Write `positions.json` to `branches/{name}/`.
6. Add the new `BranchInfo` to the index, set `activeBranch` to the new name, write index.
7. Return the updated index.

### `switchBranch(projectPath, name)`

Read index, set `activeBranch` to `name` (or `null` for main), write index, return it.

### `deleteBranch(projectPath, name)`

1. List all files in `branches/{name}/`, delete each one, then delete the directory itself. Capacitor doesn't have `rmSync` — delete files individually, then `Filesystem.rmdir`.
2. Remove from index, reset to main if the deleted branch was active.
3. Write index, return it.

### `compareBranches(projectPath, leftBranch, rightBranch)`

1. Parse scenes from left and right directories (same `parseScenesFromDir` logic — list `.md` files, read each, extract numbered lines with `<!-- sid:xxx -->` comments).
2. Read positions for both sides.
3. Build a `BranchSceneDiff[]` comparing titles and positions.
4. Return `BranchCompareData`.

The scene parsing logic (regex for frontmatter character name, numbered scene lines, sid comments) should be extracted into a shared helper or duplicated in the Capacitor service since `src/main/branches.ts` is Node.js-only.

### `mergeBranch(projectPath, branchName, sceneIds)`

1. Parse scenes from the branch directory.
2. Read branch positions.
3. For each selected scene ID, find the matching line in the branch's `.md` file.
4. Read the corresponding main `.md` file, replace the line with the matching `sid` comment, write back.
5. Read `timeline.json`, update positions for the selected scene IDs, write back.

## Key Differences from Node.js Implementation

| Node.js (`branches.ts`) | Capacitor |
|---|---|
| `fs.readFileSync` | `readTextFile` (async, returns `null` on missing) |
| `fs.writeFileSync` | `writeTextFile` (async, creates dirs) |
| `fs.readdirSync` | `listDir` (async, returns `[]` on missing) |
| `fs.copyFileSync` | Read source + write dest (Capacitor `copy` has cross-directory issues with bookmarked URLs) |
| `fs.rmSync(dir, { recursive })` | Delete each file individually, then `Filesystem.rmdir` |
| `fs.existsSync` | `readTextFile` returns `null`, `listDir` returns `[]` |
| `fs.mkdirSync` | `writeTextFile` with `recursive: true` auto-creates dirs |
| `path.join` | String concatenation with `/` (Capacitor paths are URL-style) |
| Synchronous | All async/await |

## Scope

- All changes in `src/renderer/services/capacitorDataService.ts`
- No new files needed
- No IPC changes (Capacitor doesn't use IPC)
- Scene parsing helpers can be inline private methods or module-level functions in the same file
- The `loadProject` method in CapacitorDataService already handles branch-aware loading (reads from branch folder when active) — verify this works with the new implementations
