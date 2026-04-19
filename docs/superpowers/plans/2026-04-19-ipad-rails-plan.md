# iPad Rails View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the desktop `RailsView.tsx` (957-line React grid view) to a native SwiftUI tab inside `BraidrIPad/`, preserving full editing parity (minus drawn connection lines) so Brian can place, reorder, and edit scenes from the iPad during travel.

**Architecture:** Pure SwiftUI, no WKWebView. A 2-axis scroll grid (columns = characters, rows = timeline positions) with sticky headers, a collapsible left Inbox drawer, inline-editable scene cards, a tap-to-open detail sheet, custom-gesture drag-and-drop using a shared `@Observable DragState`, and a connection badge (popover list) in place of drawn lines. Data flows through the existing `ProjectViewModel` + `FileProjectService`, mutating `timelineData.positions` and writing `timeline.json` + per-character `.md` outlines.

**Tech Stack:** Swift 5, SwiftUI with iOS 26.2 deployment target, `@Observable` macro, existing `Project` / `Scene` / `TimelineData` models, existing `FileProjectService` actor, existing `ProjectViewModel`.

---

## Prerequisites

This plan assumes the iPad app already builds and runs on device (it does — see commits through `21b18c2` and the bundled font work `after`). The spec this plan implements is at `docs/superpowers/specs/2026-04-19-ipad-rails-design.md`. Read it before starting.

**Working environment:** The iPad app uses Xcode 16 file-system synchronized root groups — `.swift` files dropped into `BraidrIPad/BraidrIPad/BraidrIPad/Views/...` are auto-included in the target. No pbxproj edits needed.

**Verification commands:**
- Build: `xcodebuild -project /Users/brian/braidr/BraidrIPad/BraidrIPad/BraidrIPad.xcodeproj -scheme BraidrIPad -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M5)' -configuration Debug build`
- SourceKit noise about `Cannot find type X in scope` is spurious — trust the compiler (`** BUILD SUCCEEDED **` is authoritative).

---

## Task 0: Feature branch

**Files:** none

- [ ] **Step 1: Create and switch to the Rails feature branch**

```bash
cd /Users/brian/braidr
git checkout -b feature/ipad-rails
```

- [ ] **Step 2: Confirm branch and clean state**

```bash
git branch --show-current
git status
```

Expected: `feature/ipad-rails`, working tree clean.

---

# Phase 1 — Scroll scaffolding (the spike)

**Goal:** Prove the hardest unknown (2-axis scroll with sticky top row + sticky left column) before investing in cards.

## Task 1.1: Placeholder `RailsTab` in the tab bar

**Files:**
- Create: `BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/RailsTab.swift`
- Modify: `BraidrIPad/BraidrIPad/BraidrIPad/BraidrApp.swift`

- [ ] **Step 1: Create the Rails directory and placeholder view**

```bash
mkdir -p /Users/brian/braidr/BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails
```

Write `RailsTab.swift`:

```swift
import SwiftUI

struct RailsTab: View {
    @Bindable var viewModel: ProjectViewModel

    var body: some View {
        NavigationStack {
            RailsGridView(viewModel: viewModel)
                .navigationTitle("Rails")
        }
    }
}
```

- [ ] **Step 2: Swap `TimelineTab` for `RailsTab` in the tab bar**

In `BraidrApp.swift`, change the Timeline tab entry:

```swift
Tab("Rails", systemImage: "square.grid.3x3") {
    RailsTab(viewModel: viewModel)
}
```

(Replacing the `Tab("Timeline", systemImage: "timeline.selection") { TimelineTab(...) }` line.)

**Leave `TimelineTab.swift` on disk for now** — it's deleted in Phase 9 as the last step so we don't lose it mid-port.

- [ ] **Step 3: Build, expect failure on `RailsGridView`**

Run the build command. Expected: error about `RailsGridView` not found. That confirms the tab is wired up; next task creates the view.

## Task 1.2: `RailsGridView` scaffold with sticky headers and empty cells

**Files:**
- Create: `BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/RailsGridView.swift`

- [ ] **Step 1: Write the grid with sticky behavior**

```swift
import SwiftUI

struct RailsGridView: View {
    @Bindable var viewModel: ProjectViewModel

    // Number of rows = highest timeline position among placed scenes, min 1.
    private var rowCount: Int {
        let maxPos = viewModel.scenes.compactMap { $0.timelinePosition }.max() ?? 0
        return max(maxPos, 1)
    }

    private var columnCount: Int { max(viewModel.characters.count, 1) }

    // Column width: fits the viewport when possible, falls back to minColumn.
    private static let minColumn: CGFloat = 200
    private static let rowNumberWidth: CGFloat = 40
    private static let headerHeight: CGFloat = 44
    private static let rowHeight: CGFloat = 140

    var body: some View {
        GeometryReader { geo in
            let available = geo.size.width - Self.rowNumberWidth
            let fitColumn = available / CGFloat(columnCount)
            let columnWidth = max(Self.minColumn, fitColumn)

            ScrollView([.horizontal, .vertical]) {
                VStack(spacing: 0) {
                    header(columnWidth: columnWidth)
                    ForEach(1...rowCount, id: \.self) { rowIdx in
                        row(rowIndex: rowIdx, columnWidth: columnWidth)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func header(columnWidth: CGFloat) -> some View {
        HStack(spacing: 0) {
            Text("#")
                .font(.caption.bold())
                .frame(width: Self.rowNumberWidth, height: Self.headerHeight)
                .background(.bar)
            ForEach(viewModel.characters) { ch in
                HStack(spacing: 6) {
                    Circle()
                        .fill(Color(hex: viewModel.characterColor(for: ch.id)))
                        .frame(width: 8, height: 8)
                    Text(ch.name)
                        .font(.subheadline.bold())
                        .lineLimit(1)
                }
                .frame(width: columnWidth, height: Self.headerHeight, alignment: .leading)
                .padding(.horizontal, 8)
                .background(.bar)
            }
        }
    }

    @ViewBuilder
    private func row(rowIndex: Int, columnWidth: CGFloat) -> some View {
        HStack(spacing: 0) {
            Text("\(rowIndex)")
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(width: Self.rowNumberWidth, height: Self.rowHeight)
                .background(.bar)
            ForEach(viewModel.characters) { _ in
                Color.clear
                    .frame(width: columnWidth, height: Self.rowHeight)
                    .border(Color.gray.opacity(0.15))
            }
        }
    }
}
```

- [ ] **Step 2: Build**

Run the build command. Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Run on the iPad simulator (or device) and verify visually**

Launch the app, open a project, tap the new **Rails** tab. Expect:
- Top row shows `#` + each character name with color dot.
- Left column shows `1`, `2`, `3`, ... up to the highest scene position.
- Empty gray-bordered cells fill the grid.
- You can scroll both axes.

**Sticky-header caveat:** SwiftUI's two-axis `ScrollView` doesn't pin rows/columns natively in iOS 26. If the header/row-number column scrolls off, document the issue and move to Phase-1 Task 1.3. If they stay pinned (they should with the right frame layout), skip 1.3.

## Task 1.3: (conditional) Sticky overlay fallback

**Only do this task if sticky behavior failed in 1.2 Step 3.**

**Files:**
- Modify: `BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/RailsGridView.swift`

- [ ] **Step 1: Wrap grid in a `ZStack` with manually-offset sticky overlays**

Replace the `ScrollView` body with:

```swift
ScrollView([.horizontal, .vertical]) {
    ZStack(alignment: .topLeading) {
        VStack(spacing: 0) {
            Spacer().frame(height: Self.headerHeight) // leaves room for overlay header
            ForEach(1...rowCount, id: \.self) { rowIdx in
                row(rowIndex: rowIdx, columnWidth: columnWidth)
            }
        }
        header(columnWidth: columnWidth)
            .offset(y: scrollY) // bound to the scrollView offset via onGeometryChange
    }
}
```

Capture scroll offset with `GeometryReader` + `PreferenceKey` if needed. If this path also proves fragile, the spec's fallback is a hybrid WKWebView — see "Rollback" in the spec.

- [ ] **Step 2: Build and verify**

Run build + simulator. Confirm sticky behavior.

## Task 1.4: Commit Phase 1

- [ ] **Step 1: Stage and commit**

```bash
git add BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/RailsTab.swift \
         BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/RailsGridView.swift \
         BraidrIPad/BraidrIPad/BraidrIPad/BraidrApp.swift
git commit -m "feat(ipad): scaffold Rails tab with 2-axis scroll grid

Empty cells only — proves the sticky-header + two-axis scroll
layout works before cards are added. Swaps the TimelineTab entry
in the TabView; TimelineTab.swift is kept on disk until Phase 9
removes it."
```

---

# Phase 2 — Static scene cards

**Goal:** Render each scene as a read-only card in its (character, timelinePosition) cell.

## Task 2.1: `RailsSceneCard` read-only component

**Files:**
- Create: `BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/RailsSceneCard.swift`

- [ ] **Step 1: Write a read-only card view**

```swift
import SwiftUI

struct RailsSceneCard: View {
    let scene: Scene
    let characterColorHex: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "line.3.horizontal")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                Text("\(scene.sceneNumber)")
                    .font(.caption2.monospacedDigit().bold())
                    .foregroundStyle(Color(hex: characterColorHex))
                Spacer()
            }
            Text(scene.title)
                .font(scene.isHighlighted ? .body.bold() : .body)
                .lineLimit(3)
            if !scene.tags.isEmpty {
                Text(scene.tags.prefix(3).map { "#\($0)" }.joined(separator: " "))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            if !scene.notes.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(scene.notes.prefix(2), id: \.self) { note in
                        Text("• \(note)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    if scene.notes.count > 2 {
                        Text("+ \(scene.notes.count - 2) more")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color(hex: characterColorHex).opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(hex: characterColorHex).opacity(0.35), lineWidth: 1)
        )
        .padding(4)
    }
}
```

- [ ] **Step 2: Build**

Run build. Expect `** BUILD SUCCEEDED **`.

## Task 2.2: Wire cards into the grid cells

**Files:**
- Modify: `BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/RailsGridView.swift`

- [ ] **Step 1: Add a helper to find the scene at (character, row)**

Add this to `RailsGridView`:

```swift
private func scene(at rowIndex: Int, characterId: String) -> Scene? {
    viewModel.scenes.first { $0.characterId == characterId && $0.timelinePosition == rowIndex }
}
```

- [ ] **Step 2: Replace the empty `Color.clear` cell with a card when present**

In the `row(rowIndex:columnWidth:)` builder, change:

```swift
ForEach(viewModel.characters) { _ in
    Color.clear
        .frame(width: columnWidth, height: Self.rowHeight)
        .border(Color.gray.opacity(0.15))
}
```

to:

```swift
ForEach(viewModel.characters) { ch in
    ZStack {
        Color.clear
        if let scn = scene(at: rowIndex, characterId: ch.id) {
            RailsSceneCard(
                scene: scn,
                characterColorHex: viewModel.characterColor(for: ch.id)
            )
        }
    }
    .frame(width: columnWidth, height: Self.rowHeight)
    .border(Color.gray.opacity(0.12))
}
```

- [ ] **Step 3: Build and verify on simulator**

Run build + simulator. Expect: braided scenes now appear in the correct character column and row. Unbraided scenes (no `timelinePosition`) don't appear — that's correct; they belong in the Inbox (Phase 3).

## Task 2.3: Commit Phase 2

```bash
git add BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/
git commit -m "feat(ipad): render scene cards in Rails grid cells

Read-only RailsSceneCard with title, scene number, tags, notes
preview, and character-colored border/background. Unbraided
scenes (timelinePosition == nil) intentionally don't render
in the grid — they'll live in the Inbox drawer (Phase 3)."
```

---

# Phase 3 — Inbox drawer

**Goal:** Collapsible left drawer listing unbraided scenes with a per-character filter. Read-only; drag is Phase 5.

## Task 3.1: Add `inboxScenes` query to the view model

**Files:**
- Modify: `BraidrIPad/BraidrIPad/BraidrIPad/ViewModels/ProjectViewModel.swift`

- [ ] **Step 1: Add an inbox query**

After the existing `braidedScenes` var, add:

```swift
/// Scenes with no timelinePosition, optionally filtered to one character.
func inboxScenes(filter: String = "all") -> [Scene] {
    let unplaced = scenes.filter { $0.timelinePosition == nil }
    let filtered: [Scene]
    if filter == "all" {
        filtered = unplaced
    } else {
        filtered = unplaced.filter { $0.characterId == filter }
    }
    return filtered.sorted {
        if $0.characterId != $1.characterId { return $0.characterId < $1.characterId }
        return $0.sceneNumber < $1.sceneNumber
    }
}
```

- [ ] **Step 2: Build**

Run build. Expect success.

## Task 3.2: `RailsInboxCard` — the compact drawer card

**Files:**
- Create: `BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/RailsInboxCard.swift`

- [ ] **Step 1: Write it**

```swift
import SwiftUI

struct RailsInboxCard: View {
    let scene: Scene
    let characterName: String
    let characterColorHex: String

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(Color(hex: characterColorHex))
                .frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(characterName) · \(scene.sceneNumber)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(scene.title)
                    .font(.footnote)
                    .lineLimit(2)
            }
            Spacer()
            Image(systemName: "line.3.horizontal")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(Color(hex: characterColorHex).opacity(0.05))
        )
    }
}
```

## Task 3.3: `RailsInboxDrawer`

**Files:**
- Create: `BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/RailsInboxDrawer.swift`

- [ ] **Step 1: Write the drawer**

```swift
import SwiftUI

struct RailsInboxDrawer: View {
    @Bindable var viewModel: ProjectViewModel
    @State private var filter: String = "all"

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Inbox")
                .font(.headline)
                .padding(.horizontal, 12)
                .padding(.top, 12)
            filterBar
            ScrollView {
                LazyVStack(spacing: 6) {
                    ForEach(viewModel.inboxScenes(filter: filter)) { scene in
                        RailsInboxCard(
                            scene: scene,
                            characterName: viewModel.characterName(for: scene.characterId),
                            characterColorHex: viewModel.characterColor(for: scene.characterId)
                        )
                    }
                }
                .padding(.horizontal, 8)
            }
        }
        .frame(width: 260)
        .background(.regularMaterial)
    }

    @ViewBuilder
    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                pill(label: "All", value: "all")
                ForEach(viewModel.characters) { ch in
                    pill(label: ch.name, value: ch.id)
                }
            }
            .padding(.horizontal, 12)
        }
    }

    private func pill(label: String, value: String) -> some View {
        let selected = filter == value
        return Button {
            filter = value
        } label: {
            Text(label)
                .font(.caption.weight(selected ? .semibold : .regular))
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(
                    Capsule().fill(selected ? Color.accentColor.opacity(0.2) : Color.clear)
                )
                .overlay(Capsule().stroke(Color.secondary.opacity(0.3)))
        }
        .buttonStyle(.plain)
    }
}
```

## Task 3.4: Wire drawer into `RailsTab`

**Files:**
- Modify: `BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/RailsTab.swift`

- [ ] **Step 1: Add a toolbar toggle and the drawer HStack**

Replace `RailsTab` with:

```swift
import SwiftUI

struct RailsTab: View {
    @Bindable var viewModel: ProjectViewModel
    @AppStorage("rails.inboxOpen") private var inboxOpen: Bool = false

    var body: some View {
        NavigationStack {
            HStack(spacing: 0) {
                if inboxOpen {
                    RailsInboxDrawer(viewModel: viewModel)
                        .transition(.move(edge: .leading))
                }
                RailsGridView(viewModel: viewModel)
            }
            .animation(.default, value: inboxOpen)
            .navigationTitle("Rails")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        inboxOpen.toggle()
                    } label: {
                        Image(systemName: inboxOpen ? "tray.full.fill" : "tray.full")
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 2: Build and verify**

Run build + simulator. Tap the tray icon: drawer slides in from left, filter pills work, unbraided scenes listed. Toggle again: drawer collapses. Preference persists across launches.

## Task 3.5: Commit Phase 3

```bash
git add BraidrIPad/BraidrIPad/BraidrIPad/ViewModels/ProjectViewModel.swift \
         BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/
git commit -m "feat(ipad): Rails inbox drawer with character filter

Collapsible left drawer lists unbraided scenes, filterable by
character via pill bar. Default collapsed, toggle state persists
via @AppStorage. Cards are read-only at this phase; drag comes
in Phase 5."
```

---

# Phase 4 — Card inline editing + detail sheet

**Goal:** Cards become editable in place (title, tags, notes); tapping the body opens a modal sheet for full-detail edits.

## Task 4.1: Add scene-field mutators to the view model

**Files:**
- Modify: `BraidrIPad/BraidrIPad/BraidrIPad/ViewModels/ProjectViewModel.swift`

- [ ] **Step 1: Add `updateSceneField` methods**

Add below the existing mutation methods:

```swift
/// Update a scene's title in-place and persist the owning character .md file.
func updateSceneTitle(sceneId: String, title: String) {
    guard var proj = project else { return }
    guard let idx = proj.scenes.firstIndex(where: { $0.id == sceneId }) else { return }
    proj.scenes[idx].title = title
    proj.scenes[idx].content = title
    project = proj
    schedulePersistCharacterOutline(for: proj.scenes[idx].characterId)
}

/// Update a scene's tags.
func updateSceneTags(sceneId: String, tags: [String]) {
    guard var proj = project else { return }
    guard let idx = proj.scenes.firstIndex(where: { $0.id == sceneId }) else { return }
    proj.scenes[idx].tags = tags
    project = proj
    schedulePersistCharacterOutline(for: proj.scenes[idx].characterId)
}

/// Update a scene's sub-note list.
func updateSceneNotes(sceneId: String, notes: [String]) {
    guard var proj = project else { return }
    guard let idx = proj.scenes.firstIndex(where: { $0.id == sceneId }) else { return }
    proj.scenes[idx].notes = notes
    project = proj
    schedulePersistCharacterOutline(for: proj.scenes[idx].characterId)
}

private var pendingOutlineSaves: Set<String> = []

private func schedulePersistCharacterOutline(for characterId: String) {
    pendingOutlineSaves.insert(characterId)
    autoSaveTimer?.invalidate()
    autoSaveTimer = Timer.scheduledTimer(withTimeInterval: 0.8, repeats: false) { [weak self] _ in
        guard let self else { return }
        Task { await self.flushOutlineSaves() }
    }
}

private func flushOutlineSaves() async {
    guard let proj = project else { return }
    let toSave = pendingOutlineSaves
    pendingOutlineSaves.removeAll()
    for charId in toSave {
        guard let character = proj.characters.first(where: { $0.id == charId }) else { continue }
        let pps = proj.plotPoints(for: charId)
        let ss = proj.scenes(for: charId)
        try? await fileService.saveCharacterOutline(projectURL: proj.projectURL, character: character, plotPoints: pps, scenes: ss)
    }
}
```

Note: the existing `autoSaveTimer` is already used for draft autosave. Check the existing code and if there's a collision, use a second timer `outlineAutoSaveTimer`.

- [ ] **Step 2: Build**

Run build. Expect success.

## Task 4.2: Inline-editable card fields

**Files:**
- Modify: `BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/RailsSceneCard.swift`

- [ ] **Step 1: Convert the card to take a mutation callback and use TextFields**

Replace the file:

```swift
import SwiftUI

struct RailsSceneCard: View {
    let scene: Scene
    let characterColorHex: String
    var onTitleChange: (String) -> Void = { _ in }
    var onTagsChange: ([String]) -> Void = { _ in }
    var onNotesChange: ([String]) -> Void = { _ in }
    var onTap: () -> Void = {}

    @State private var title: String = ""
    @State private var tagsText: String = ""
    @State private var notesText: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "line.3.horizontal")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                Text("\(scene.sceneNumber)")
                    .font(.caption2.monospacedDigit().bold())
                    .foregroundStyle(Color(hex: characterColorHex))
                Spacer()
            }
            TextField("Title", text: $title, onCommit: { onTitleChange(title) })
                .textFieldStyle(.plain)
                .font(scene.isHighlighted ? .body.bold() : .body)

            TextField("#tags space-separated", text: $tagsText, onCommit: {
                let parts = tagsText
                    .split(separator: " ")
                    .map { String($0).trimmingCharacters(in: CharacterSet(charactersIn: "#")) }
                    .filter { !$0.isEmpty }
                onTagsChange(parts)
            })
            .textFieldStyle(.plain)
            .font(.caption2)
            .foregroundStyle(.secondary)

            TextField("notes (one per line)", text: $notesText, axis: .vertical, onCommit: {
                let lines = notesText.split(separator: "\n").map(String.init)
                onNotesChange(lines)
            })
            .textFieldStyle(.plain)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(3...)

            Spacer(minLength: 0)
        }
        .padding(8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color(hex: characterColorHex).opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(hex: characterColorHex).opacity(0.35), lineWidth: 1)
        )
        .padding(4)
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
        .onAppear {
            title = scene.title
            tagsText = scene.tags.map { "#\($0)" }.joined(separator: " ")
            notesText = scene.notes.joined(separator: "\n")
        }
    }
}
```

- [ ] **Step 2: Update callers in `RailsGridView` to wire the callbacks**

In the cell builder inside `RailsGridView.row(...)`, replace the `RailsSceneCard(...)` constructor with:

```swift
RailsSceneCard(
    scene: scn,
    characterColorHex: viewModel.characterColor(for: ch.id),
    onTitleChange: { viewModel.updateSceneTitle(sceneId: scn.id, title: $0) },
    onTagsChange: { viewModel.updateSceneTags(sceneId: scn.id, tags: $0) },
    onNotesChange: { viewModel.updateSceneNotes(sceneId: scn.id, notes: $0) },
    onTap: { viewModel.selectedSceneForSheet = scn.id }
)
```

`selectedSceneForSheet` is a new `@Observable` property — next step adds it.

- [ ] **Step 3: Add `selectedSceneForSheet` to the view model**

In `ProjectViewModel.swift`, near `selectedSceneId`, add:

```swift
/// ID of the scene whose detail sheet is open on the Rails tab.
var selectedSceneForSheet: String?
```

- [ ] **Step 4: Build**

Run build. Expect success. Noticeable behavior change: cards now show text fields, edits route through the view model.

## Task 4.3: `SceneDetailSheet`

**Files:**
- Create: `BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/SceneDetailSheet.swift`

- [ ] **Step 1: Write the sheet**

```swift
import SwiftUI

struct SceneDetailSheet: View {
    @Bindable var viewModel: ProjectViewModel
    let sceneId: String
    @Environment(\.dismiss) private var dismiss

    private var scene: Scene? {
        viewModel.scenes.first { $0.id == sceneId }
    }

    @State private var title: String = ""
    @State private var tagsText: String = ""
    @State private var notesLines: [String] = []

    var body: some View {
        NavigationStack {
            Form {
                Section("Title") {
                    TextField("Scene title", text: $title, axis: .vertical)
                        .lineLimit(2...)
                }
                Section("Tags") {
                    TextField("#tag1 #tag2", text: $tagsText)
                }
                Section("Notes") {
                    ForEach(notesLines.indices, id: \.self) { idx in
                        TextField("Note", text: $notesLines[idx], axis: .vertical)
                            .lineLimit(1...)
                    }
                    Button {
                        notesLines.append("")
                    } label: {
                        Label("Add note", systemImage: "plus.circle")
                    }
                }
                Section {
                    Button("Open in Editor") {
                        viewModel.selectedSceneId = sceneId
                        viewModel.selectedSceneForSheet = nil
                        dismiss()
                    }
                }
            }
            .navigationTitle("Edit Scene")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        viewModel.updateSceneTitle(sceneId: sceneId, title: title)
                        let parts = tagsText.split(separator: " ").map {
                            String($0).trimmingCharacters(in: CharacterSet(charactersIn: "#"))
                        }.filter { !$0.isEmpty }
                        viewModel.updateSceneTags(sceneId: sceneId, tags: parts)
                        viewModel.updateSceneNotes(sceneId: sceneId, notes: notesLines.filter { !$0.isEmpty })
                        dismiss()
                    }
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear(perform: load)
        }
    }

    private func load() {
        guard let scn = scene else { return }
        title = scn.title
        tagsText = scn.tags.map { "#\($0)" }.joined(separator: " ")
        notesLines = scn.notes
    }
}
```

## Task 4.4: Present the sheet from `RailsTab`

**Files:**
- Modify: `BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/RailsTab.swift`

- [ ] **Step 1: Add `.sheet` modifier bound to `selectedSceneForSheet`**

Replace the `.toolbar` modifier block with:

```swift
.toolbar {
    ToolbarItem(placement: .topBarLeading) {
        Button {
            inboxOpen.toggle()
        } label: {
            Image(systemName: inboxOpen ? "tray.full.fill" : "tray.full")
        }
    }
}
.sheet(item: Binding(
    get: { viewModel.selectedSceneForSheet.map { SceneSheetId(id: $0) } },
    set: { viewModel.selectedSceneForSheet = $0?.id }
)) { wrapper in
    SceneDetailSheet(viewModel: viewModel, sceneId: wrapper.id)
}
```

Add the wrapper near the top of `RailsTab.swift` (outside the struct):

```swift
private struct SceneSheetId: Identifiable { let id: String }
```

- [ ] **Step 2: Build and verify**

Run build + simulator. Tap a card body: the sheet appears with the scene's title, tags, and notes. Edit, tap Done: card updates and the character `.md` file on disk updates (verify by checking `git status` on the project folder).

## Task 4.5: Commit Phase 4

```bash
git add BraidrIPad/BraidrIPad/BraidrIPad/ViewModels/ProjectViewModel.swift \
         BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/
git commit -m "feat(ipad): inline-editable Rails cards + detail sheet

Title, tags, notes editable directly on the card. Tap the card
body to open SceneDetailSheet — Form-based editor with Open-in-
Editor action. Edits flow through new ProjectViewModel mutators
and trigger a debounced save of the owning character .md file."
```

---

# Phase 5 — Drag-and-drop

**Goal:** Drag cards from the drag-handle — inbox → grid, grid ↔ grid, grid → inbox.

## Task 5.1: `DragState` observable

**Files:**
- Create: `BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/DragState.swift`

- [ ] **Step 1: Write it**

```swift
import SwiftUI
import Observation

enum RailsDropTarget: Equatable {
    case row(Int)   // timeline position (1-indexed)
    case inbox
}

@Observable
final class DragState {
    var sceneId: String?
    var sceneTitle: String = ""
    var ghostPosition: CGPoint = .zero
    var dropTarget: RailsDropTarget?

    /// Row frames captured by RailsGridView via preferences.
    var rowFrames: [Int: CGRect] = [:]
    var inboxFrame: CGRect = .zero

    func begin(scene: Scene, at point: CGPoint) {
        sceneId = scene.id
        sceneTitle = scene.title
        ghostPosition = point
        dropTarget = nil
    }

    func update(to point: CGPoint) {
        ghostPosition = point
        if inboxFrame.contains(point) {
            dropTarget = .inbox
            return
        }
        for (idx, frame) in rowFrames where frame.contains(point) {
            dropTarget = .row(idx)
            return
        }
        dropTarget = nil
    }

    func end() -> RailsDropTarget? {
        let target = dropTarget
        sceneId = nil
        sceneTitle = ""
        dropTarget = nil
        return target
    }
}
```

## Task 5.2: View-model mutations for place / move / unbraid

**Files:**
- Modify: `BraidrIPad/BraidrIPad/BraidrIPad/ViewModels/ProjectViewModel.swift`

- [ ] **Step 1: Add three mutators**

```swift
/// Place an unbraided scene at timeline position `target`, shifting others down.
func placeSceneInBraid(sceneId: String, at target: Int) {
    guard var proj = project else { return }
    // Shift any placed scene at or above target up by 1.
    for i in proj.scenes.indices {
        if let pos = proj.scenes[i].timelinePosition, pos >= target {
            proj.scenes[i].timelinePosition = pos + 1
            proj.timelineData.positions[proj.scenes[i].id] = pos + 1
        }
    }
    if let idx = proj.scenes.firstIndex(where: { $0.id == sceneId }) {
        proj.scenes[idx].timelinePosition = target
        proj.timelineData.positions[sceneId] = target
    }
    renumberBraid(&proj)
    project = proj
    saveTimelineInBackground()
}

/// Remove a scene from the braid, leaving it in the inbox.
func unbraidScene(sceneId: String) {
    guard var proj = project else { return }
    if let idx = proj.scenes.firstIndex(where: { $0.id == sceneId }) {
        proj.scenes[idx].timelinePosition = nil
    }
    proj.timelineData.positions.removeValue(forKey: sceneId)
    renumberBraid(&proj)
    project = proj
    saveTimelineInBackground()
}

/// Move a placed scene from current position to target position.
func moveBraidedScene(sceneId: String, to target: Int) {
    guard var proj = project else { return }
    guard let idx = proj.scenes.firstIndex(where: { $0.id == sceneId }),
          let currentPos = proj.scenes[idx].timelinePosition else { return }
    // Remove from its current slot first.
    proj.scenes[idx].timelinePosition = nil
    proj.timelineData.positions.removeValue(forKey: sceneId)
    // Shift others up/down to open a slot at target.
    for i in proj.scenes.indices where i != idx {
        guard let pos = proj.scenes[i].timelinePosition else { continue }
        if currentPos < target {
            if pos > currentPos && pos <= target - 1 {
                proj.scenes[i].timelinePosition = pos - 1
                proj.timelineData.positions[proj.scenes[i].id] = pos - 1
            }
        } else if currentPos > target {
            if pos >= target && pos < currentPos {
                proj.scenes[i].timelinePosition = pos + 1
                proj.timelineData.positions[proj.scenes[i].id] = pos + 1
            }
        }
    }
    let finalPos = min(target, braidCount(in: proj) + 1)
    proj.scenes[idx].timelinePosition = finalPos
    proj.timelineData.positions[sceneId] = finalPos
    renumberBraid(&proj)
    project = proj
    saveTimelineInBackground()
}

// MARK: - Helpers
private func braidCount(in proj: Project) -> Int {
    proj.scenes.filter { $0.timelinePosition != nil }.count
}

/// Collapse any gaps so timeline positions are 1...N contiguous.
private func renumberBraid(_ proj: inout Project) {
    let sorted = proj.scenes.enumerated()
        .compactMap { ($0.offset, $0.element.timelinePosition) }
        .filter { $0.1 != nil }
        .sorted { ($0.1 ?? 0) < ($1.1 ?? 0) }
    for (newPos, (origIdx, _)) in sorted.enumerated() {
        proj.scenes[origIdx].timelinePosition = newPos + 1
        proj.timelineData.positions[proj.scenes[origIdx].id] = newPos + 1
    }
}
```

- [ ] **Step 2: Build**

Run build. Expect success.

## Task 5.3: `DragState` into the environment and ghost overlay

**Files:**
- Modify: `BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/RailsTab.swift`

- [ ] **Step 1: Own a `DragState` in `RailsTab` and overlay the ghost**

Replace `RailsTab.swift`:

```swift
import SwiftUI

private struct SceneSheetId: Identifiable { let id: String }

struct RailsTab: View {
    @Bindable var viewModel: ProjectViewModel
    @AppStorage("rails.inboxOpen") private var inboxOpen: Bool = false
    @State private var dragState = DragState()

    var body: some View {
        NavigationStack {
            ZStack {
                HStack(spacing: 0) {
                    if inboxOpen {
                        RailsInboxDrawer(viewModel: viewModel, dragState: dragState)
                            .transition(.move(edge: .leading))
                    }
                    RailsGridView(viewModel: viewModel, dragState: dragState)
                }
                .animation(.default, value: inboxOpen)

                if dragState.sceneId != nil {
                    ghost
                        .position(dragState.ghostPosition)
                        .allowsHitTesting(false)
                }
            }
            .navigationTitle("Rails")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        inboxOpen.toggle()
                    } label: {
                        Image(systemName: inboxOpen ? "tray.full.fill" : "tray.full")
                    }
                }
            }
            .sheet(item: Binding(
                get: { viewModel.selectedSceneForSheet.map { SceneSheetId(id: $0) } },
                set: { viewModel.selectedSceneForSheet = $0?.id }
            )) { wrapper in
                SceneDetailSheet(viewModel: viewModel, sceneId: wrapper.id)
            }
        }
    }

    private var ghost: some View {
        Text(dragState.sceneTitle.prefix(30))
            .font(.footnote.bold())
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule().fill(Color.accentColor)
            )
            .shadow(radius: 6)
    }
}
```

## Task 5.4: Drag gesture on the card's drag handle

**Files:**
- Modify: `BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/RailsSceneCard.swift`

- [ ] **Step 1: Accept a `DragState` and attach a DragGesture to the handle**

Add `let dragState: DragState` at the top of `RailsSceneCard` (after `characterColorHex`).

Replace the handle HStack:

```swift
HStack(spacing: 6) {
    Image(systemName: "line.3.horizontal")
        .font(.caption2)
        .foregroundStyle(.tertiary)
        .padding(4)
        .contentShape(Rectangle())
        .gesture(dragGesture)
    Text("\(scene.sceneNumber)")
        .font(.caption2.monospacedDigit().bold())
        .foregroundStyle(Color(hex: characterColorHex))
    Spacer()
}
```

And add the gesture property in the struct:

```swift
private var dragGesture: some Gesture {
    DragGesture(minimumDistance: 0, coordinateSpace: .global)
        .onChanged { value in
            if dragState.sceneId == nil {
                dragState.begin(scene: scene, at: value.location)
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            } else {
                dragState.update(to: value.location)
            }
        }
        .onEnded { _ in
            let target = dragState.end()
            handleDrop(target: target)
        }
}

var onDropRequested: (RailsDropTarget) -> Void = { _ in }

private func handleDrop(target: RailsDropTarget?) {
    guard let target else { return }
    onDropRequested(target)
}
```

- [ ] **Step 2: Wire `onDropRequested` at the grid call site**

In `RailsGridView.row(...)`, the `RailsSceneCard(...)` constructor now takes `dragState:` and `onDropRequested:`:

```swift
RailsSceneCard(
    scene: scn,
    characterColorHex: viewModel.characterColor(for: ch.id),
    dragState: dragState,
    onTitleChange: { viewModel.updateSceneTitle(sceneId: scn.id, title: $0) },
    onTagsChange: { viewModel.updateSceneTags(sceneId: scn.id, tags: $0) },
    onNotesChange: { viewModel.updateSceneNotes(sceneId: scn.id, notes: $0) },
    onTap: { viewModel.selectedSceneForSheet = scn.id },
    onDropRequested: { target in
        switch target {
        case .row(let idx):
            if scn.timelinePosition == nil {
                viewModel.placeSceneInBraid(sceneId: scn.id, at: idx)
            } else {
                viewModel.moveBraidedScene(sceneId: scn.id, to: idx)
            }
        case .inbox:
            viewModel.unbraidScene(sceneId: scn.id)
        }
    }
)
```

Also add `@Bindable var dragState: DragState` as a property on `RailsGridView`.

- [ ] **Step 3: Capture row frames via preferences**

In `RailsGridView.row(rowIndex:columnWidth:)`, wrap the HStack in a `.background(GeometryReader ...)` to capture the frame:

```swift
.background(
    GeometryReader { rowGeo in
        Color.clear.preference(
            key: RailsRowFrameKey.self,
            value: [rowIndex: rowGeo.frame(in: .global)]
        )
    }
)
```

Add at the bottom of `RailsGridView.swift`:

```swift
struct RailsRowFrameKey: PreferenceKey {
    static var defaultValue: [Int: CGRect] = [:]
    static func reduce(value: inout [Int: CGRect], nextValue: () -> [Int: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}
```

And attach to the outer `VStack`:

```swift
.onPreferenceChange(RailsRowFrameKey.self) { frames in
    dragState.rowFrames = frames
}
```

- [ ] **Step 4: Build**

Run build. Expect success.

## Task 5.5: Inbox card also drag-able; inbox drop target

**Files:**
- Modify: `BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/RailsInboxCard.swift`
- Modify: `BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/RailsInboxDrawer.swift`

- [ ] **Step 1: Give `RailsInboxCard` a drag gesture**

Add `let dragState: DragState` and `var onDropRequested: (RailsDropTarget) -> Void` properties, and the same `DragGesture` pattern as in `RailsSceneCard`. Attach it to the leading handle image (`Circle()` or add a `line.3.horizontal` handle).

- [ ] **Step 2: Capture the inbox drawer frame**

In `RailsInboxDrawer.swift`, add:

```swift
@Bindable var dragState: DragState
```

to the struct and wrap the outermost `VStack` in:

```swift
.background(
    GeometryReader { geo in
        Color.clear.onAppear { dragState.inboxFrame = geo.frame(in: .global) }
            .onChange(of: geo.frame(in: .global)) { _, new in dragState.inboxFrame = new }
    }
)
```

- [ ] **Step 3: Wire drop callback on inbox cards**

In the inbox's `ForEach`:

```swift
RailsInboxCard(
    scene: scene,
    characterName: viewModel.characterName(for: scene.characterId),
    characterColorHex: viewModel.characterColor(for: scene.characterId),
    dragState: dragState,
    onDropRequested: { target in
        if case .row(let idx) = target {
            viewModel.placeSceneInBraid(sceneId: scene.id, at: idx)
        }
        // Inbox -> inbox is a no-op.
    }
)
```

- [ ] **Step 4: Build and verify**

Run build + simulator. Test all three flows:
- Drag from an inbox card → drop on a row → scene appears in the grid at that row.
- Drag from a grid card → drop on a different row → scene moves.
- Drag from a grid card → drop on the inbox → scene returns to the inbox.

Verify `timeline.json` on disk updates each time (check via Mac Finder).

## Task 5.6: Vertical auto-scroll during drag

**Files:**
- Modify: `BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/RailsGridView.swift`

- [ ] **Step 1: Use a ScrollViewReader + timer while dragging**

Wrap the `ScrollView` in `ScrollViewReader { proxy in ... }` and add this effect on the grid view:

```swift
.onChange(of: dragState.ghostPosition) { _, pos in
    guard dragState.sceneId != nil else { return }
    // If near top/bottom edge, nudge scroll.
    let screenH = UIScreen.main.bounds.height
    if pos.y < 120 {
        // scroll up by one row
        // implementation depends on resolved row index visible at top
    } else if pos.y > screenH - 120 {
        // scroll down
    }
}
```

Concrete approach: maintain a `@State private var visibleTopRow: Int = 1` and, when near an edge, call `proxy.scrollTo(visibleTopRow ± 1, anchor: .top)` on a repeating timer until the edge condition clears.

- [ ] **Step 2: Build and test**

Drag a card near the top/bottom of the screen: the grid should scroll to reveal more rows. Horizontal auto-scroll is deferred to v2 per the spec.

## Task 5.7: Commit Phase 5

```bash
git add BraidrIPad/BraidrIPad/BraidrIPad/ViewModels/ProjectViewModel.swift \
         BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/
git commit -m "feat(ipad): Rails drag-and-drop — inbox, grid reorder, unbraid

Custom DragGesture on card drag handles drives a shared
DragState (@Observable). Ghost view follows finger. Row frames
captured via PreferenceKey, inbox frame via GeometryReader.
Drop commits to placeSceneInBraid / moveBraidedScene /
unbraidScene mutators on the view model. Vertical auto-scroll
near screen edges. Horizontal auto-scroll deferred to v2."
```

---

# Phase 6 — Insert-at-position

**Goal:** Tap a row number to insert a new scene at that row, choosing which character it belongs to.

## Task 6.1: `insertNewScene` mutator

**Files:**
- Modify: `BraidrIPad/BraidrIPad/BraidrIPad/ViewModels/ProjectViewModel.swift`

- [ ] **Step 1: Add the mutator**

```swift
/// Insert a new empty scene at timeline row `target` for `characterId`.
/// Returns the new scene's ID.
@discardableResult
func insertNewScene(at target: Int, characterId: String) -> String {
    guard var proj = project else { return "" }
    let newId = Self.generateSceneId()
    // Find max sceneNumber for this character to append the next one.
    let maxSceneNum = proj.scenes
        .filter { $0.characterId == characterId }
        .map { $0.sceneNumber }
        .max() ?? 0
    let newScene = Scene(
        id: newId,
        characterId: characterId,
        sceneNumber: maxSceneNum + 1,
        title: "Untitled",
        content: "Untitled",
        tags: [],
        timelinePosition: target,
        isHighlighted: false,
        notes: [],
        plotPointId: nil,
        wordCount: nil
    )
    // Shift other scenes at or after target.
    for i in proj.scenes.indices {
        if let pos = proj.scenes[i].timelinePosition, pos >= target {
            proj.scenes[i].timelinePosition = pos + 1
            proj.timelineData.positions[proj.scenes[i].id] = pos + 1
        }
    }
    proj.scenes.append(newScene)
    proj.timelineData.positions[newId] = target
    renumberBraid(&proj)
    project = proj
    saveTimelineInBackground()
    schedulePersistCharacterOutline(for: characterId)
    return newId
}

private static func generateSceneId() -> String {
    let chars = "abcdefghijklmnopqrstuvwxyz0123456789"
    return String((0..<9).map { _ in chars.randomElement()! })
}
```

- [ ] **Step 2: Build**

Run build. Expect success.

## Task 6.2: Tap row number → character picker

**Files:**
- Modify: `BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/RailsGridView.swift`

- [ ] **Step 1: Add local state and popover**

Add to `RailsGridView`:

```swift
@State private var insertAtRow: Int?
```

In the `row(rowIndex:columnWidth:)` builder, change the row-number `Text` block to:

```swift
Button {
    insertAtRow = rowIndex
} label: {
    Text("\(rowIndex)")
        .font(.caption.monospacedDigit())
        .foregroundStyle(.secondary)
        .frame(width: Self.rowNumberWidth, height: Self.rowHeight)
        .background(.bar)
}
.buttonStyle(.plain)
```

Attach at the grid's outer level:

```swift
.popover(item: Binding(
    get: { insertAtRow.map { RowIdWrapper(id: $0) } },
    set: { insertAtRow = $0?.id }
)) { wrapper in
    characterPicker(for: wrapper.id)
}
```

Helpers (add outside the struct):

```swift
private struct RowIdWrapper: Identifiable { let id: Int }
```

And inside the struct:

```swift
@ViewBuilder
private func characterPicker(for row: Int) -> some View {
    VStack(alignment: .leading, spacing: 8) {
        Text("Insert new scene at row \(row) for:")
            .font(.headline)
        ForEach(viewModel.characters) { ch in
            Button {
                viewModel.insertNewScene(at: row, characterId: ch.id)
                insertAtRow = nil
            } label: {
                HStack {
                    Circle()
                        .fill(Color(hex: viewModel.characterColor(for: ch.id)))
                        .frame(width: 10, height: 10)
                    Text(ch.name)
                    Spacer()
                }
                .padding(.vertical, 6)
            }
            .buttonStyle(.plain)
        }
    }
    .padding(16)
    .frame(minWidth: 220)
}
```

- [ ] **Step 2: Build and verify**

Run build + simulator. Tap a row number: popover lists characters. Tap a character: a new "Untitled" scene appears in that row for that character, and it's appended to that character's outline file (verify on disk).

## Task 6.3: Commit Phase 6

```bash
git add BraidrIPad/BraidrIPad/BraidrIPad/ViewModels/ProjectViewModel.swift \
         BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/RailsGridView.swift
git commit -m "feat(ipad): insert new scene at row via character picker

Tap any row number in the Rails grid to open a character
picker popover; selecting a character creates a new 'Untitled'
scene at that row for that character, shifting others down.
The new scene is also appended to the character's .md outline."
```

---

# Phase 7 — Connection badge + popover

**Goal:** Show a `🔗 n` badge on cards that have causal connections. Tap to see a list (no drawn lines in v1).

## Task 7.1: `connections(for:)` on the view model

**Files:**
- Modify: `BraidrIPad/BraidrIPad/BraidrIPad/ViewModels/ProjectViewModel.swift`

- [ ] **Step 1: Add the query**

```swift
/// Scenes connected (causally linked) to `sceneId` per timelineData.connections.
func connections(for sceneId: String) -> [Scene] {
    guard let map = project?.timelineData.connections else { return [] }
    let linkedIds = map[sceneId] ?? []
    return linkedIds.compactMap { id in
        project?.scenes.first { $0.id == id }
    }
}

func connectionCount(for sceneId: String) -> Int {
    project?.timelineData.connections?[sceneId]?.count ?? 0
}
```

- [ ] **Step 2: Build**

Run build. Expect success.

## Task 7.2: `ConnectionBadge` component

**Files:**
- Create: `BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/ConnectionBadge.swift`

- [ ] **Step 1: Write the badge**

```swift
import SwiftUI

struct ConnectionBadge: View {
    @Bindable var viewModel: ProjectViewModel
    let sceneId: String
    @State private var showPopover = false

    private var count: Int { viewModel.connectionCount(for: sceneId) }

    var body: some View {
        if count > 0 {
            Button {
                showPopover = true
            } label: {
                HStack(spacing: 3) {
                    Image(systemName: "link")
                        .font(.caption2)
                    Text("\(count)")
                        .font(.caption2.monospacedDigit())
                }
                .padding(.horizontal, 5)
                .padding(.vertical, 2)
                .background(Capsule().fill(Color.accentColor.opacity(0.15)))
                .foregroundStyle(.tint)
            }
            .buttonStyle(.plain)
            .popover(isPresented: $showPopover) {
                connectionList
                    .frame(minWidth: 240)
                    .padding(12)
            }
        }
    }

    @ViewBuilder
    private var connectionList: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Connections")
                .font(.headline)
            ForEach(viewModel.connections(for: sceneId)) { scn in
                Button {
                    viewModel.selectedSceneForSheet = scn.id
                    showPopover = false
                } label: {
                    HStack {
                        Circle()
                            .fill(Color(hex: viewModel.characterColor(for: scn.characterId)))
                            .frame(width: 8, height: 8)
                        Text("\(viewModel.characterName(for: scn.characterId)) · \(scn.sceneNumber)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(scn.title)
                            .font(.footnote)
                            .lineLimit(1)
                        Spacer()
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }
}
```

## Task 7.3: Place the badge on `RailsSceneCard`

**Files:**
- Modify: `BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/RailsSceneCard.swift`

- [ ] **Step 1: Add the badge to the top HStack**

Add a `let viewModel: ProjectViewModel` property to `RailsSceneCard`, and change the top HStack to:

```swift
HStack(spacing: 6) {
    Image(systemName: "line.3.horizontal")
        .font(.caption2)
        .foregroundStyle(.tertiary)
        .padding(4)
        .contentShape(Rectangle())
        .gesture(dragGesture)
    Text("\(scene.sceneNumber)")
        .font(.caption2.monospacedDigit().bold())
        .foregroundStyle(Color(hex: characterColorHex))
    Spacer()
    ConnectionBadge(viewModel: viewModel, sceneId: scene.id)
}
```

- [ ] **Step 2: Pass `viewModel` at the call site in `RailsGridView`**

Add `viewModel: viewModel` to the `RailsSceneCard(...)` initializer in the grid.

- [ ] **Step 3: Build and verify**

Run build + simulator. Scenes with connections in `timeline.json` show a `🔗 N` badge. Tap: popover lists linked scenes, each tappable to open their detail sheet.

## Task 7.4: Commit Phase 7

```bash
git add BraidrIPad/BraidrIPad/BraidrIPad/ViewModels/ProjectViewModel.swift \
         BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/
git commit -m "feat(ipad): connection badge + popover on Rails cards

Cards with causal connections in timelineData.connections show
a 🔗 N badge. Tapping opens a popover listing linked scenes,
each tappable to jump into that scene's detail sheet. Drawn
lines across columns remain out of scope for v1."
```

---

# Phase 8 — Polish

## Task 8.1: Haptics, animations, dark mode, accessibility

**Files:**
- Modify: various Rails views

- [ ] **Step 1: Haptics**

- Drag start: `UIImpactFeedbackGenerator(style: .medium)` (already in 5.4).
- Drop success: `UINotificationFeedbackGenerator().notificationOccurred(.success)` in `handleDrop`.
- Drop on invalid target: no haptic (silent).

- [ ] **Step 2: Animations**

- Card appearance on drop: wrap state changes in `withAnimation(.spring(response: 0.35, dampingFraction: 0.8))` where the view model mutates `project`.
- Inbox drawer already uses `.animation(.default, value: inboxOpen)`.

- [ ] **Step 3: Dark mode audit**

Launch the simulator, toggle dark mode via Control Center. Confirm the grid cells, cards, drawer, and sheets all read correctly. Fix any hard-coded light colors (replace `Color.white` / `Color.black` with semantic `Color.primary` / `.secondary` / `.bar`).

- [ ] **Step 4: Accessibility labels**

On each interactive element, add:

```swift
.accessibilityLabel("Drag handle for scene \(scene.title)")
.accessibilityHint("Long press and drag to move")
```

Minimum: drag handle, row-number button, inbox toggle, font button, connection badge.

- [ ] **Step 5: Build and smoke test**

Run + test each flow on device: place from inbox, move within grid, unbraid, tap-to-edit, insert new, connection popover. In both light and dark mode.

## Task 8.2: Commit Phase 8

```bash
git add BraidrIPad/BraidrIPad/BraidrIPad/Views/Rails/
git commit -m "polish(ipad): haptics, animations, a11y for Rails

Drop success haptic, spring animations on state changes,
accessibility labels/hints on all interactive elements.
Dark mode audit — all hard-coded colors replaced with
semantic SwiftUI colors."
```

---

# Phase 9 — Remove `TimelineTab`

## Task 9.1: Delete and clean up

**Files:**
- Delete: `BraidrIPad/BraidrIPad/BraidrIPad/Views/Timeline/TimelineTab.swift`
- Modify: `BraidrIPad/BraidrIPad/BraidrIPad/BraidrApp.swift` (already done in Phase 1)

- [ ] **Step 1: Delete the stopgap**

```bash
rm /Users/brian/braidr/BraidrIPad/BraidrIPad/BraidrIPad/Views/Timeline/TimelineTab.swift
rmdir /Users/brian/braidr/BraidrIPad/BraidrIPad/BraidrIPad/Views/Timeline 2>/dev/null || true
```

- [ ] **Step 2: Build to confirm nothing else referenced it**

```bash
xcodebuild -project /Users/brian/braidr/BraidrIPad/BraidrIPad/BraidrIPad.xcodeproj \
  -scheme BraidrIPad \
  -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M5)' \
  -configuration Debug build 2>&1 | grep -E "error:|BUILD "
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(ipad): remove TimelineTab stopgap

Rails tab (feature/ipad-rails) supersedes the 92-line flat-list
TimelineTab that shipped as a placeholder. BraidrApp.swift
already points at RailsTab since Phase 1."
```

---

# Phase 10 — Merge to main

## Task 10.1: Final verification + PR

- [ ] **Step 1: Run full smoke test on device**

Install on iPad Pro 12.9" (⌘R). Walk through:

1. Open a project.
2. Switch to Rails tab.
3. Toggle inbox, filter by character.
4. Drag an inbox scene → drop at row 3 (example).
5. Drag a grid scene → drop at row 7 (reorder).
6. Drag a grid scene → drop on inbox (unbraid).
7. Tap a row number → pick a character → new scene appears.
8. Tap a card body → sheet opens → edit + save.
9. Tap a connection badge → popover list → tap one → that scene's sheet opens.
10. Confirm auto-save: modify, wait 1 second, force-quit, reopen — changes persist.
11. Confirm iCloud sync: edits made on iPad appear on the Mac app.

- [ ] **Step 2: Merge feature branch**

If everything works:

```bash
git checkout main
git merge --no-ff feature/ipad-rails
git push origin main
```

Or open a PR:

```bash
gh pr create --title "iPad Rails view — full port" \
  --body "$(cat <<'EOF'
## Summary
- Native SwiftUI port of desktop RailsView (replaces the 92-line TimelineTab stopgap)
- Two-axis scroll grid with sticky headers; minmax(200pt, 1fr) columns
- Collapsible left Inbox drawer with character filter
- Inline-editable scene cards + tap-to-open detail sheet
- Custom DragGesture drag-and-drop (inbox ↔ grid, reorder)
- Insert-at-row via row-number tap + character picker
- Connection badge + popover (drawn lines deferred to v2)

## Test plan
- [ ] Project opens and grid renders with all characters
- [ ] Drag from inbox → row: scene placed
- [ ] Drag grid → row: scene moves
- [ ] Drag grid → inbox: scene unbraided
- [ ] Tap row number → character picker → new scene inserted
- [ ] Tap card → detail sheet edits round-trip
- [ ] Connection badge popover lists linked scenes
- [ ] Auto-save: force-quit, reopen, changes persist
- [ ] iCloud sync with desktop app

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

1. **Spec coverage:** Every numbered item in the spec's "In (v1)" list maps to a task. The Out (v2+) items are explicitly deferred here too.
2. **Placeholder scan:** No "TBD"/"TODO" in steps. Task 1.3 is conditional on Task 1.2 outcome but has concrete code either way.
3. **Type consistency:** `DragState`, `RailsDropTarget`, new `ProjectViewModel` methods (`placeSceneInBraid`, `moveBraidedScene`, `unbraidScene`, `insertNewScene`, `connections(for:)`, `connectionCount(for:)`) are defined in the task where first used and referenced consistently thereafter.
4. **Scope:** 10 phases (0–9 + merge). Each ends with a commit. Each commit independently compiles and runs. If you stop mid-plan, the branch is still usable.

## Known risks

- **2-axis sticky headers in SwiftUI** — Phase 1 is a genuine spike. If 1.2 doesn't pin rows/columns, Task 1.3 is the escape valve. If both fail, the spec's "Rollback" section details the hybrid WKWebView fallback.
- **Preference-based frame capture at 50+ cells** — may be expensive. If measurable lag shows during drag, collapse `rowFrames` to a single global array recalculated once per layout.
- **`Scene` name collision with SwiftUI.Scene** — SourceKit shows warnings about `any Scene` existential. The compiler resolves correctly for now, but Swift 6 will require either renaming our model (e.g., `BraidrScene`) or using `any Scene` explicitly. Noted but out of scope for this plan.
