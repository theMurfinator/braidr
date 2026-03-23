# Braidr iPad — Native SwiftUI App Plan

## What this is

A standalone native iPad app built in SwiftUI. Separate Xcode project, separate codebase from the Electron desktop app. Shares only the file format — the same `.md`, `.json`, and `.html` files on disk.

## Why native

The Capacitor/WebView approach failed. iOS WebViews have fundamental issues with scrolling, safe areas, touch gestures, and CSS layout that require constant hacks. A native SwiftUI app gets all of this for free — scrolling just works, safe areas are automatic, drag-and-drop is built into `List`, and the app feels like a real iPad app.

## Architecture

### App shell

`WindowGroup` (not `DocumentGroup`) with a custom project picker. The user selects a project folder from iCloud Drive or Dropbox via `fileImporter(allowedContentTypes: [.folder])`. Access is persisted across launches with security-scoped bookmarks.

### Navigation

iOS 18 `TabView` with `.sidebarAdaptable` style. On iPad, this renders as top tabs that can expand into a sidebar. Four tabs:

| Tab | Purpose | Internal layout |
|-----|---------|----------------|
| **Outline** | POV view — character's scenes grouped by plot points | `NavigationSplitView`: character picker (sidebar) → scene list (content) → scene detail (detail) |
| **Editor** | Prose writing | `NavigationSplitView`: scene list (sidebar) → TipTap editor in WKWebView (detail) |
| **Timeline** | Braided/Rails view — all scenes in chronological order | Single scrollable list with character color indicators, drag-to-reorder |
| **Notes** | Research notes | `NavigationSplitView`: note tree (sidebar) → note editor in WKWebView (detail) |

### Data layer

```
Models/          — Swift structs matching TypeScript types (Codable)
Services/
  ProjectService.swift       — Protocol for all project I/O
  FileProjectService.swift   — Implementation: reads .md, .json, .html from disk
  OutlineParser.swift        — Parses character outline markdown format
  BookmarkManager.swift      — Persists folder access across launches
```

**ProjectService protocol:**
```swift
protocol ProjectService {
    func loadProject(from url: URL) throws -> Project
    func saveCharacterOutline(_ character: Character, scenes: [Scene], plotPoints: [PlotPoint]) throws
    func readDraft(projectURL: URL, sceneId: String) throws -> String
    func saveDraft(projectURL: URL, sceneId: String, content: String) throws
    func readTimeline(projectURL: URL) throws -> TimelineData
    func saveTimeline(projectURL: URL, data: TimelineData) throws
    func loadNotesIndex(projectURL: URL) throws -> NotesIndex
    func readNote(projectURL: URL, fileName: String) throws -> String
    func saveNote(projectURL: URL, fileName: String, content: String) throws
}
```

### File formats (from research of actual project files)

| File | Format | Swift parsing |
|------|--------|--------------|
| `*.md` (character outlines) | YAML frontmatter + custom markdown | Custom parser + Yams (SPM) for YAML |
| `timeline.json` | JSON | `Codable` with `JSONDecoder` |
| `drafts/*.md` | HTML (despite .md extension) | Read/write as `String` |
| `drafts/*.versions.json` | JSON array of `DraftVersion` | `Codable` |
| `scratchpad/*.md` | Plain text/HTML | Read/write as `String` |
| `comments/*.json` | JSON array of `SceneComment` | `Codable` |
| `notes/notes-index.json` | JSON | `Codable` |
| `notes/*.html` | HTML fragments | Read/write as `String`, display in WKWebView |

### Rich text editor

**WKWebView with TipTap** for both prose editing and notes. The approach:

1. Bundle a minimal TipTap HTML/JS/CSS package inside the app's Resources folder
2. Load it in a WKWebView using `loadFileURL(_:allowingReadAccessTo:)`
3. Swift → JS communication via `webView.evaluateJavaScript()`
4. JS → Swift communication via `WKScriptMessageHandler`
5. Content is HTML strings, same format the desktop app uses

This means the exact same TipTap editor, extensions (wikilinks, hashtags, tables, slash commands), and content format work on both platforms. The only Swift-native UI is the navigation, lists, and layout around the editor.

**Alternative (future):** If Apple's iOS 26 native `WebView` SwiftUI component ships, the WKWebView wrapper can be replaced with it. Or `stevengharris/MarkupEditor` (ProseMirror-based, same engine as TipTap) could provide a more native feel.

### Sync

Same approach as the spec: "Bring Your Own Sync." The app reads/writes files in a folder. iCloud Drive or Dropbox syncs that folder between devices. The Phase 1 storage migration (per-scene files instead of monolithic timeline.json) makes this safe.

## Swift models (mapping from TypeScript)

```swift
struct Character: Codable, Identifiable {
    let id: String
    var name: String
    var filePath: String
    var color: String?
}

struct Scene: Codable, Identifiable {
    let id: String
    var characterId: String
    var sceneNumber: Int
    var title: String
    var content: String
    var tags: [String]
    var timelinePosition: Int?
    var isHighlighted: Bool
    var notes: [String]
    var plotPointId: String?
    var wordCount: Int?
}

struct PlotPoint: Codable, Identifiable {
    let id: String
    var characterId: String
    var title: String
    var expectedSceneCount: Int?
    var description: String
    var order: Int
}

struct Tag: Codable, Identifiable {
    let id: String
    var name: String
    var category: TagCategory
}

enum TagCategory: String, Codable {
    case people, locations, arcs, things, time
}

struct TimelineData: Codable {
    var positions: [String: Int]
    var connections: [String: [String]]?
    var chapters: [BraidedChapter]?
    var characterColors: [String: String]?
    var wordCounts: [String: Int]?
    var tags: [Tag]?
    // ... other optional fields
}

struct BraidedChapter: Codable, Identifiable {
    let id: String
    var title: String
    var beforePosition: Int
}

struct NoteMetadata: Codable, Identifiable {
    let id: String
    var title: String
    var fileName: String
    var parentId: String?
    var order: Int
    var createdAt: Double
    var modifiedAt: Double
    var outgoingLinks: [String]
    var sceneLinks: [String]
    var tags: [String]?
}

struct NotesIndex: Codable {
    var notes: [NoteMetadata]
    var archivedNotes: [ArchivedNote]?
    var version: Int?
}

struct DraftVersion: Codable {
    var version: Int
    var content: String
    var savedAt: Double
}

struct SceneComment: Codable, Identifiable {
    let id: String
    var text: String
    var createdAt: Double
}
```

## Outline parser (character .md files)

The character outline format is custom — not standard markdown. The parser needs to handle:

1. **YAML frontmatter:** Extract `character: Name` between `---` delimiters. Use Yams library.
2. **Plot point headers:** `## Title (count)` — regex: `^## (.+?)(?:\s*\((\d+)\))?$`
3. **Plot point descriptions:** Lines after a `##` header and before the first numbered scene.
4. **Scene lines:** `N. Content text #tag1 #tag2 <!-- sid:XXXXX -->` — regex for number, content, tags, and scene ID.
5. **Highlighted scenes:** `==**text**==` wrapping.
6. **Sub-notes:** Lines starting with tab + `1.` (indented numbered items).

This mirrors the existing TypeScript parser at `src/renderer/services/parser.ts`.

## Xcode project structure

```
BraidrIPad/
  BraidrApp.swift                    # @main, WindowGroup + TabView
  Info.plist
  Assets.xcassets/

  Models/
    Character.swift
    Scene.swift
    PlotPoint.swift
    Tag.swift
    TimelineData.swift
    NoteMetadata.swift
    DraftVersion.swift
    Project.swift                    # Aggregates all loaded data

  Services/
    ProjectService.swift             # Protocol
    FileProjectService.swift         # File I/O implementation
    OutlineParser.swift              # .md file parser
    OutlineSerializer.swift          # .md file writer
    BookmarkManager.swift            # Security-scoped bookmark persistence

  ViewModels/
    ProjectViewModel.swift           # Loaded project state, @Observable
    EditorViewModel.swift            # TipTap WebView communication

  Views/
    ProjectPicker/
      ProjectPickerView.swift        # Welcome screen + folder picker
      RecentProjectRow.swift

    Outline/
      OutlineTab.swift               # NavigationSplitView wrapper
      CharacterListView.swift        # Sidebar: character pills/list
      SceneListView.swift            # Content: scenes grouped by plot point
      SceneRowView.swift             # Single scene in the list
      PlotPointHeaderView.swift      # Section header

    Editor/
      EditorTab.swift                # NavigationSplitView wrapper
      ScenePickerView.swift          # Sidebar: scene navigator
      TipTapEditorView.swift         # WKWebView hosting TipTap
      SceneMetadataView.swift        # Metadata panel (tags, word count, etc.)

    Timeline/
      TimelineTab.swift              # Braided scene order
      TimelineSceneRow.swift         # Scene with character color

    Notes/
      NotesTab.swift                 # NavigationSplitView wrapper
      NoteTreeView.swift             # Sidebar: hierarchical note list
      NoteEditorView.swift           # WKWebView hosting TipTap for notes

    Shared/
      TagPillView.swift              # Colored tag pill
      CharacterPillView.swift        # Character name with color dot

  Resources/
    Editor/                          # Bundled TipTap HTML/JS/CSS
      index.html
      tiptap-bundle.js
      editor.css

  Extensions/
    URL+Extensions.swift
    String+Extensions.swift
```

## SPM dependencies

| Package | Purpose |
|---------|---------|
| Yams (`jpsim/Yams`) | Parse YAML frontmatter in character outlines |

That's it. Everything else is standard Apple frameworks (SwiftUI, WebKit, UniformTypeIdentifiers).

## What to build first

1. **Models + Services:** Define all Swift structs. Write `OutlineParser` and `FileProjectService`. Verify they can read the demo project and the real novel project.
2. **Project picker:** Welcome screen with folder picker. Persist access with bookmarks.
3. **Outline tab:** Character list → scene list → scene detail. Read-only first, then add editing.
4. **Editor tab:** WKWebView with bundled TipTap. Load/save drafts. Scene picker sidebar.
5. **Timeline tab:** Braided scene list with drag-to-reorder.
6. **Notes tab:** Note tree + WKWebView note editor.

## What's NOT in v1

- Tasks view
- Graph view
- Word count dashboard / analytics
- Timeline canvas (date-based visualization)
- Scene connections / linking
- PDF export / compile
- Project creation (create on desktop, open on iPad)
- Custom metadata fields
- Tag management
