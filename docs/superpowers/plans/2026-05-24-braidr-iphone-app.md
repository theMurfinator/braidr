# Braidr iPhone App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a universal SwiftUI iPhone/iPad app that opens a `.braidr` SQLite project file and provides a Rails view (multi-POV grid) and a clean prose Editor.

**Architecture:** SwiftUI (iOS 16+) with GRDB.swift for SQLite access. `ProjectViewModel` loads and owns all data from the `.braidr` file. `RailsView` computes the grid from that data and manages selection state. `EditorView` handles per-scene writing with 800ms debounce autosave. File access is persisted via security-scoped bookmarks stored in UserDefaults.

**Tech Stack:** Swift 5.9, SwiftUI iOS 16+, GRDB.swift 6.x (SPM), Lora font (bundled TTF), PDFKit, UIActivityViewController

---

## File Map

```
ios/BraidrMobile/
├── BraidrMobile.xcodeproj
└── BraidrMobile/
    ├── BraidrMobileApp.swift
    ├── Resources/
    │   ├── Lora-Regular.ttf
    │   ├── Lora-Medium.ttf
    │   ├── Lora-SemiBold.ttf
    │   └── Lora-Italic.ttf
    ├── Models/
    │   ├── AppModels.swift          # Scene, Character, PlotPoint, Chapter structs
    │   └── BraidrDB.swift           # GRDB wrapper — all SQL queries
    ├── ViewModels/
    │   ├── ProjectViewModel.swift   # File loading, bookmark, publishes all data
    │   └── EditorViewModel.swift    # Draft text, autosave debounce
    ├── Views/
    │   ├── ContentView.swift        # Root: file picker or RailsView
    │   ├── Rails/
    │   │   ├── RailsView.swift      # Topbar + scroll container + nav
    │   │   ├── SceneCardView.swift  # Individual scene card
    │   │   ├── ConnectorLinesView.swift  # Canvas: per-character vertical lines
    │   │   └── ExportBarView.swift  # Selection mode bottom bar
    │   └── Editor/
    │       ├── EditorView.swift     # Full-screen prose editor
    │       └── InfoSheetView.swift  # Slide-up ··· sheet
    └── Utils/
        ├── DocumentPicker.swift     # UIDocumentPickerViewController wrapper
        ├── ShareSheet.swift         # UIActivityViewController wrapper
        ├── ExportGenerator.swift    # Plain text / PDF generation
        └── ColorExtension.swift     # Color(hex:) utility
```

---

### Task 1: Xcode Project Setup

**Files:**
- Create: `ios/BraidrMobile/` (Xcode project)
- Create: `ios/BraidrMobile/BraidrMobile/Utils/ColorExtension.swift`

- [ ] **Step 1: Create the Xcode project**

  In Xcode: File → New → Project → App
  - Product Name: `BraidrMobile`
  - Team: your Apple developer account
  - Organization Identifier: `com.braidr`
  - Interface: SwiftUI
  - Language: Swift
  - Minimum Deployments: iOS 16.0
  - Save to: `/Users/brian/braidr/ios/`

- [ ] **Step 2: Add GRDB.swift via Swift Package Manager**

  In Xcode: File → Add Package Dependencies
  - URL: `https://github.com/groue/GRDB.swift.git`
  - Version: Up to Next Major from `6.0.0`
  - Add to target: BraidrMobile

- [ ] **Step 3: Download and bundle Lora fonts**

  Download from Google Fonts: https://fonts.google.com/specimen/Lora
  Extract and copy into Xcode project:
  - `Lora-Regular.ttf`
  - `Lora-Medium.ttf`
  - `Lora-SemiBold.ttf`
  - `Lora-Italic.ttf`

  In Xcode: Select all four files → check "Add to target: BraidrMobile"

- [ ] **Step 4: Register fonts in Info.plist**

  Add key `Fonts provided by application` (array) with values:
  - `Lora-Regular.ttf`
  - `Lora-Medium.ttf`
  - `Lora-SemiBold.ttf`
  - `Lora-Italic.ttf`

- [ ] **Step 5: Add iCloud entitlement**

  In Xcode: Target → Signing & Capabilities → + Capability → iCloud
  Check: iCloud Documents

- [ ] **Step 6: Create `ColorExtension.swift`**

```swift
import SwiftUI

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:  (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:  (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:  (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default: (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(.sRGB,
                  red: Double(r) / 255,
                  green: Double(g) / 255,
                  blue: Double(b) / 255,
                  opacity: Double(a) / 255)
    }
}
```

- [ ] **Step 7: Build to verify setup compiles**

  Cmd+B. Expected: Build Succeeded with no errors.

- [ ] **Step 8: Commit**

```bash
git add ios/
git commit -m "feat: scaffold BraidrMobile Xcode project with GRDB, Lora fonts"
```

---

### Task 2: App Models

**Files:**
- Create: `ios/BraidrMobile/BraidrMobile/Models/AppModels.swift`
- Create: `ios/BraidrMobile/BraidrMobileTests/AppModelsTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
// AppModelsTests.swift
import XCTest
import GRDB
@testable import BraidrMobile

final class AppModelsTests: XCTestCase {
    func test_braidrScene_decodesFromRow() throws {
        let db = try DatabaseQueue()
        try db.write { db in
            try db.execute(sql: """
                CREATE TABLE scenes (
                    id TEXT PRIMARY KEY, character_id TEXT, plot_point_id TEXT,
                    title TEXT, synopsis TEXT, scene_number INTEGER,
                    timeline_position INTEGER, word_count INTEGER, chapter_id TEXT
                )
            """)
            try db.execute(sql: """
                INSERT INTO scenes VALUES ('s1','c1',NULL,'Opening','',1,3,500,NULL)
            """)
        }
        let scene = try db.read { db in
            try BraidrScene.fetchOne(db, sql: "SELECT * FROM scenes")
        }
        XCTAssertEqual(scene?.id, "s1")
        XCTAssertEqual(scene?.title, "Opening")
        XCTAssertEqual(scene?.timelinePosition, 3)
        XCTAssertEqual(scene?.wordCount, 500)
    }

    func test_braidrCharacter_decodesFromRow() throws {
        let db = try DatabaseQueue()
        try db.write { db in
            try db.execute(sql: """
                CREATE TABLE characters (
                    id TEXT PRIMARY KEY, name TEXT, color TEXT,
                    display_order INTEGER, created_at INTEGER
                )
            """)
            try db.execute(sql: "INSERT INTO characters VALUES ('c1','Noah','#5b8fa8',0,0)")
        }
        let char = try db.read { db in
            try BraidrCharacter.fetchOne(db, sql: "SELECT * FROM characters")
        }
        XCTAssertEqual(char?.name, "Noah")
        XCTAssertEqual(char?.color, "#5b8fa8")
    }
}
```

- [ ] **Step 2: Run test — expect FAIL** (BraidrScene not defined)

- [ ] **Step 3: Create `AppModels.swift`**

```swift
import Foundation
import GRDB

struct BraidrCharacter: Identifiable, Hashable, Codable, FetchableRecord {
    let id: String
    let name: String
    let color: String?
    let displayOrder: Int

    enum CodingKeys: String, CodingKey {
        case id, name, color
        case displayOrder = "display_order"
    }
}

struct BraidrScene: Identifiable, Hashable, Codable, FetchableRecord {
    let id: String
    let characterId: String
    let plotPointId: String?
    let title: String
    let synopsis: String
    let sceneNumber: Int
    let timelinePosition: Int?
    let wordCount: Int?
    let chapterId: String?

    enum CodingKeys: String, CodingKey {
        case id, title, synopsis
        case characterId    = "character_id"
        case plotPointId    = "plot_point_id"
        case sceneNumber    = "scene_number"
        case timelinePosition = "timeline_position"
        case wordCount      = "word_count"
        case chapterId      = "chapter_id"
    }

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    static func == (lhs: Self, rhs: Self) -> Bool { lhs.id == rhs.id }
}

struct BraidrPlotPoint: Identifiable, Hashable, Codable, FetchableRecord {
    let id: String
    let characterId: String
    let title: String
    let displayOrder: Int

    enum CodingKeys: String, CodingKey {
        case id, title
        case characterId  = "character_id"
        case displayOrder = "display_order"
    }
}

struct BraidrChapter: Identifiable, Hashable, Codable, FetchableRecord {
    let id: String
    let title: String
    let ord: Int
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add ios/BraidrMobile/BraidrMobile/Models/AppModels.swift \
        ios/BraidrMobile/BraidrMobileTests/AppModelsTests.swift
git commit -m "feat: add Braidr data models with GRDB decoding"
```

---

### Task 3: BraidrDB Data Layer

**Files:**
- Create: `ios/BraidrMobile/BraidrMobile/Models/BraidrDB.swift`
- Create: `ios/BraidrMobile/BraidrMobileTests/BraidrDBTests.swift`

- [ ] **Step 1: Write failing tests**

```swift
// BraidrDBTests.swift
import XCTest
import GRDB
@testable import BraidrMobile

final class BraidrDBTests: XCTestCase {
    var db: BraidrDB!

    override func setUp() throws {
        // Write a temp SQLite file with the .braidr schema subset
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("test.braidr")
        let pool = try DatabasePool(path: url.path)
        try pool.write { db in
            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS characters (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT,
                    display_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS plot_points (
                    id TEXT PRIMARY KEY, character_id TEXT, title TEXT NOT NULL,
                    description TEXT, expected_scene_count INTEGER,
                    display_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS chapters (
                    id TEXT PRIMARY KEY, title TEXT NOT NULL, ord INTEGER NOT NULL, description TEXT
                );
                CREATE TABLE IF NOT EXISTS scenes (
                    id TEXT PRIMARY KEY, character_id TEXT NOT NULL,
                    plot_point_id TEXT, title TEXT NOT NULL DEFAULT '',
                    synopsis TEXT NOT NULL DEFAULT '', scene_number INTEGER NOT NULL DEFAULT 0,
                    timeline_position INTEGER, is_highlighted INTEGER NOT NULL DEFAULT 0,
                    word_count INTEGER, created_at INTEGER NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL DEFAULT 0,
                    chapter_id TEXT, scene_order INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS scene_drafts (
                    id TEXT PRIMARY KEY, scene_id TEXT NOT NULL UNIQUE,
                    content TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL DEFAULT 0
                );
            """)
            try db.execute(sql: "INSERT INTO characters VALUES ('c1','Noah','#5b8fa8',0,0)")
            try db.execute(sql: "INSERT INTO characters VALUES ('c2','Grace','#c4856a',1,0)")
            try db.execute(sql: "INSERT INTO chapters VALUES ('ch1','Part One',0,NULL)")
            try db.execute(sql: "INSERT INTO plot_points VALUES ('pp1','c1','Setup',NULL,NULL,0,0)")
            try db.execute(sql: """
                INSERT INTO scenes VALUES
                ('s1','c1','pp1','Chasing Miguel','',1,1,0,712,0,0,'ch1',0),
                ('s2','c2',NULL,'Arriving in Seville','',1,2,0,540,0,0,NULL,0),
                ('s3','c1','pp1','Meeting Cormac','',2,3,0,342,0,0,NULL,0)
            """)
            try db.execute(sql: "INSERT INTO scene_drafts VALUES ('d1','s1','The draft text.',0)")
        }
        db = try BraidrDB(url: url)
    }

    func test_fetchCharacters_returnsSortedByDisplayOrder() throws {
        let chars = try db.fetchCharacters()
        XCTAssertEqual(chars.count, 2)
        XCTAssertEqual(chars[0].name, "Noah")
        XCTAssertEqual(chars[1].name, "Grace")
    }

    func test_fetchScenesInTimeline_returnsOnlyPositionedScenes() throws {
        let scenes = try db.fetchScenesInTimeline()
        XCTAssertEqual(scenes.count, 3)
        XCTAssertEqual(scenes[0].timelinePosition, 1)
        XCTAssertEqual(scenes[2].timelinePosition, 3)
    }

    func test_fetchDraft_returnsContent() throws {
        let content = try db.fetchDraft(sceneId: "s1")
        XCTAssertEqual(content, "The draft text.")
    }

    func test_fetchDraft_returnsNilWhenMissing() throws {
        let content = try db.fetchDraft(sceneId: "s3")
        XCTAssertNil(content)
    }

    func test_saveDraft_persistsContent() throws {
        try db.saveDraft(sceneId: "s3", content: "New content.")
        let content = try db.fetchDraft(sceneId: "s3")
        XCTAssertEqual(content, "New content.")
    }

    func test_saveDraft_updatesExistingContent() throws {
        try db.saveDraft(sceneId: "s1", content: "Updated.")
        let content = try db.fetchDraft(sceneId: "s1")
        XCTAssertEqual(content, "Updated.")
    }
}
```

- [ ] **Step 2: Run tests — expect FAIL** (BraidrDB not defined)

- [ ] **Step 3: Create `BraidrDB.swift`**

```swift
import Foundation
import GRDB

final class BraidrDB {
    private let pool: DatabasePool

    init(url: URL) throws {
        pool = try DatabasePool(path: url.path)
    }

    func fetchCharacters() throws -> [BraidrCharacter] {
        try pool.read { db in
            try BraidrCharacter.fetchAll(db, sql: """
                SELECT id, name, color, display_order
                FROM characters ORDER BY display_order ASC
            """)
        }
    }

    func fetchScenesInTimeline() throws -> [BraidrScene] {
        try pool.read { db in
            try BraidrScene.fetchAll(db, sql: """
                SELECT id, character_id, plot_point_id, title, synopsis,
                       scene_number, timeline_position, word_count, chapter_id
                FROM scenes
                WHERE timeline_position IS NOT NULL
                ORDER BY timeline_position ASC
            """)
        }
    }

    func fetchPlotPoints() throws -> [BraidrPlotPoint] {
        try pool.read { db in
            try BraidrPlotPoint.fetchAll(db, sql: """
                SELECT id, character_id, title, display_order
                FROM plot_points ORDER BY display_order ASC
            """)
        }
    }

    func fetchChapters() throws -> [BraidrChapter] {
        try pool.read { db in
            try BraidrChapter.fetchAll(db, sql: """
                SELECT id, title, ord FROM chapters ORDER BY ord ASC
            """)
        }
    }

    func fetchDraft(sceneId: String) throws -> String? {
        try pool.read { db in
            let row = try Row.fetchOne(db, sql:
                "SELECT content FROM scene_drafts WHERE scene_id = ?",
                arguments: [sceneId])
            return row?["content"]
        }
    }

    func saveDraft(sceneId: String, content: String) throws {
        let now = Int(Date().timeIntervalSince1970 * 1000)
        try pool.write { db in
            try db.execute(sql: """
                INSERT INTO scene_drafts (id, scene_id, content, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(scene_id) DO UPDATE
                SET content = excluded.content, updated_at = excluded.updated_at
            """, arguments: [UUID().uuidString, sceneId, content, now])
        }
    }

    func updateScene(id: String, characterId: String? = nil,
                     plotPointId: String? = nil, chapterId: String? = nil) throws {
        var sets: [String] = []
        var args: [DatabaseValueConvertible?] = []
        if let v = characterId { sets.append("character_id = ?"); args.append(v) }
        if let v = plotPointId { sets.append("plot_point_id = ?"); args.append(v) }
        if let v = chapterId   { sets.append("chapter_id = ?");   args.append(v) }
        guard !sets.isEmpty else { return }
        args.append(id)
        try pool.write { db in
            try db.execute(
                sql: "UPDATE scenes SET \(sets.joined(separator: ", ")) WHERE id = ?",
                arguments: StatementArguments(args.map { $0 as DatabaseValueConvertible? })
            )
        }
    }
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add ios/BraidrMobile/BraidrMobile/Models/BraidrDB.swift \
        ios/BraidrMobile/BraidrMobileTests/BraidrDBTests.swift
git commit -m "feat: add BraidrDB GRDB data layer with full test coverage"
```

---

### Task 4: Document Picker + Utility Wrappers

**Files:**
- Create: `ios/BraidrMobile/BraidrMobile/Utils/DocumentPicker.swift`
- Create: `ios/BraidrMobile/BraidrMobile/Utils/ShareSheet.swift`

- [ ] **Step 1: Create `DocumentPicker.swift`**

```swift
import SwiftUI
import UniformTypeIdentifiers

struct DocumentPicker: UIViewControllerRepresentable {
    let onPick: (URL) -> Void

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let braidrType = UTType(filenameExtension: "braidr") ?? .data
        let picker = UIDocumentPickerViewController(
            forOpeningContentTypes: [braidrType],
            asCopy: false
        )
        picker.delegate = context.coordinator
        picker.allowsMultipleSelection = false
        return picker
    }

    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController,
                                 context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onPick: onPick) }

    class Coordinator: NSObject, UIDocumentPickerDelegate {
        let onPick: (URL) -> Void
        init(onPick: @escaping (URL) -> Void) { self.onPick = onPick }

        func documentPicker(_ controller: UIDocumentPickerViewController,
                            didPickDocumentsAt urls: [URL]) {
            guard let url = urls.first else { return }
            onPick(url)
        }
    }
}
```

- [ ] **Step 2: Create `ShareSheet.swift`**

```swift
import SwiftUI

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController,
                                 context: Context) {}
}
```

- [ ] **Step 3: Build — expect success**

- [ ] **Step 4: Commit**

```bash
git add ios/BraidrMobile/BraidrMobile/Utils/
git commit -m "feat: add DocumentPicker and ShareSheet UIKit wrappers"
```

---

### Task 5: ProjectViewModel

**Files:**
- Create: `ios/BraidrMobile/BraidrMobile/ViewModels/ProjectViewModel.swift`
- Create: `ios/BraidrMobile/BraidrMobileTests/ProjectViewModelTests.swift`

- [ ] **Step 1: Write failing test**

```swift
// ProjectViewModelTests.swift
import XCTest
@testable import BraidrMobile

@MainActor
final class ProjectViewModelTests: XCTestCase {
    func test_loadFromURL_populatesCharactersAndScenes() async throws {
        let url = try makeTestBraidrFile()
        let vm = ProjectViewModel()
        vm.loadFromURL(url)
        XCTAssertFalse(vm.characters.isEmpty)
        XCTAssertFalse(vm.scenes.isEmpty)
        XCTAssertNil(vm.errorMessage)
    }

    func test_loadFromURL_setsErrorOnBadFile() async throws {
        let badURL = URL(fileURLWithPath: "/nonexistent/file.braidr")
        let vm = ProjectViewModel()
        vm.loadFromURL(badURL)
        XCTAssertNotNil(vm.errorMessage)
    }

    // Helpers
    private func makeTestBraidrFile() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString + ".braidr")
        let db = try BraidrDB(url: url)
        // BraidrDB creates the pool; we seed via raw GRDB
        let pool = try DatabasePool(path: url.path)
        try pool.write { db in
            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT, display_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS plot_points (id TEXT PRIMARY KEY, character_id TEXT, title TEXT NOT NULL, description TEXT, expected_scene_count INTEGER, display_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS chapters (id TEXT PRIMARY KEY, title TEXT NOT NULL, ord INTEGER NOT NULL, description TEXT);
                CREATE TABLE IF NOT EXISTS scenes (id TEXT PRIMARY KEY, character_id TEXT NOT NULL, plot_point_id TEXT, title TEXT NOT NULL DEFAULT '', synopsis TEXT NOT NULL DEFAULT '', scene_number INTEGER NOT NULL DEFAULT 0, timeline_position INTEGER, is_highlighted INTEGER NOT NULL DEFAULT 0, word_count INTEGER, created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0, chapter_id TEXT, scene_order INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS scene_drafts (id TEXT PRIMARY KEY, scene_id TEXT NOT NULL UNIQUE, content TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL DEFAULT 0);
                INSERT INTO characters VALUES ('c1','Noah','#5b8fa8',0,0);
                INSERT INTO scenes VALUES ('s1','c1',NULL,'Scene One','',1,1,0,100,0,0,NULL,0);
            """)
        }
        return url
    }
}
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Create `ProjectViewModel.swift`**

```swift
import Foundation
import SwiftUI

@MainActor
final class ProjectViewModel: ObservableObject {
    @Published var db: BraidrDB?
    @Published var characters: [BraidrCharacter] = []
    @Published var scenes: [BraidrScene] = []
    @Published var plotPoints: [BraidrPlotPoint] = []
    @Published var chapters: [BraidrChapter] = []
    @Published var errorMessage: String?

    private let bookmarkKey = "braidrFileBookmark"
    private var accessedURL: URL?

    func loadFromURL(_ url: URL) {
        let accessing = url.startAccessingSecurityScopedResource()
        do {
            let newDB = try BraidrDB(url: url)
            self.db = newDB
            if accessing {
                try? saveBookmark(for: url)
                accessedURL = url
            }
            try reload()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
            if accessing { url.stopAccessingSecurityScopedResource() }
        }
    }

    func reload() throws {
        guard let db else { return }
        characters = try db.fetchCharacters()
        scenes    = try db.fetchScenesInTimeline()
        plotPoints = try db.fetchPlotPoints()
        chapters  = try db.fetchChapters()
    }

    func restoreFromBookmark() {
        guard let data = UserDefaults.standard.data(forKey: bookmarkKey) else { return }
        var isStale = false
        guard let url = try? URL(resolvingBookmarkData: data,
                                  options: .withSecurityScope,
                                  relativeTo: nil,
                                  bookmarkDataIsStale: &isStale) else { return }
        loadFromURL(url)
    }

    private func saveBookmark(for url: URL) throws {
        let data = try url.bookmarkData(options: .withSecurityScope,
                                         includingResourceValuesForKeys: nil,
                                         relativeTo: nil)
        UserDefaults.standard.set(data, forKey: bookmarkKey)
    }
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add ios/BraidrMobile/BraidrMobile/ViewModels/ProjectViewModel.swift \
        ios/BraidrMobile/BraidrMobileTests/ProjectViewModelTests.swift
git commit -m "feat: add ProjectViewModel with file loading and bookmark persistence"
```

---

### Task 6: Grid Metrics + ConnectorLinesView

**Files:**
- Create: `ios/BraidrMobile/BraidrMobile/Views/Rails/ConnectorLinesView.swift`
- Create: `ios/BraidrMobile/BraidrMobileTests/ConnectorLinesTests.swift`

- [ ] **Step 1: Write failing test**

```swift
// ConnectorLinesTests.swift
import XCTest
@testable import BraidrMobile

final class ConnectorLinesTests: XCTestCase {
    func test_gridMetrics_columnX_correctForIndex() {
        let m = GridMetrics()
        XCTAssertEqual(m.columnX(index: 0), m.cellWidth / 2)
        XCTAssertEqual(m.columnX(index: 1), m.cellWidth + m.cellGap + m.cellWidth / 2)
    }

    func test_gridMetrics_rowBottomY_greaterThanRowTopY() {
        let m = GridMetrics()
        XCTAssertGreaterThan(m.rowBottomY(rowIndex: 0), m.rowTopY(rowIndex: 0))
    }

    func test_gridMetrics_rowTopY_row1_greaterThan_row0() {
        let m = GridMetrics()
        XCTAssertGreaterThan(m.rowTopY(rowIndex: 1), m.rowBottomY(rowIndex: 0))
    }
}
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Create `ConnectorLinesView.swift`**

```swift
import SwiftUI

struct GridMetrics {
    let rowHeight: CGFloat = 70
    let cellWidth: CGFloat = 84
    let cellGap: CGFloat = 5
    let cardVerticalPadding: CGFloat = 6
    let headerHeight: CGFloat = 32

    func columnX(index: Int) -> CGFloat {
        CGFloat(index) * (cellWidth + cellGap) + cellWidth / 2
    }

    func rowTopY(rowIndex: Int) -> CGFloat {
        headerHeight + CGFloat(rowIndex) * rowHeight + cardVerticalPadding
    }

    func rowBottomY(rowIndex: Int) -> CGFloat {
        headerHeight + CGFloat(rowIndex) * rowHeight + rowHeight - cardVerticalPadding
    }
}

struct RailsRow: Identifiable {
    let id: Int                          // timeline_position
    var cells: [String: BraidrScene]     // characterId → scene
}

struct ConnectorLinesView: View {
    let rows: [RailsRow]
    let characters: [BraidrCharacter]
    let metrics: GridMetrics

    var body: some View {
        Canvas { context, _ in
            for (colIndex, character) in characters.enumerated() {
                let x = metrics.columnX(index: colIndex)
                guard let color = character.color else { continue }
                let lineColor = Color(hex: color).opacity(0.4)

                let rowIndices = rows.indices.filter { rows[$0].cells[character.id] != nil }

                for i in 0..<(rowIndices.count - 1) {
                    let fromIdx = rowIndices[i]
                    let toIdx   = rowIndices[i + 1]
                    let y1 = metrics.rowBottomY(rowIndex: fromIdx)
                    let y2 = metrics.rowTopY(rowIndex: toIdx)

                    var path = Path()
                    path.move(to: CGPoint(x: x, y: y1))
                    path.addLine(to: CGPoint(x: x, y: y2))
                    context.stroke(path, with: .color(lineColor), lineWidth: 1)

                    // Gap word count
                    let gapWords = (fromIdx+1..<toIdx)
                        .flatMap { rows[$0].cells.filter { $0.key != character.id }.values }
                        .compactMap(\.wordCount)
                        .reduce(0, +)

                    if gapWords > 0 {
                        let label = gapWords >= 1000
                            ? String(format: "%.1fk", Double(gapWords) / 1000)
                            : "\(gapWords)"
                        let midY = (y1 + y2) / 2
                        context.draw(
                            Text(label)
                                .font(.system(size: 7.5))
                                .foregroundColor(Color(hex: color).opacity(0.55)),
                            at: CGPoint(x: x + 5, y: midY),
                            anchor: .leading
                        )
                    }
                }
            }
        }
        .allowsHitTesting(false)
    }
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add ios/BraidrMobile/BraidrMobile/Views/Rails/ConnectorLinesView.swift \
        ios/BraidrMobile/BraidrMobileTests/ConnectorLinesTests.swift
git commit -m "feat: add GridMetrics and ConnectorLinesView with Canvas drawing"
```

---

### Task 7: SceneCardView

**Files:**
- Create: `ios/BraidrMobile/BraidrMobile/Views/Rails/SceneCardView.swift`

- [ ] **Step 1: Create `SceneCardView.swift`**

```swift
import SwiftUI

struct SceneCardView: View {
    let scene: BraidrScene
    let character: BraidrCharacter
    let isActive: Bool
    let isSelecting: Bool
    let isSelected: Bool
    let onTap: () -> Void
    let onLongPress: () -> Void

    private var accentColor: Color {
        Color(hex: character.color ?? "#888888")
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            HStack(spacing: 0) {
                // Left accent bar
                Rectangle()
                    .fill(accentColor)
                    .frame(width: 3)

                // Content
                VStack(alignment: .leading, spacing: 4) {
                    Text(scene.title.isEmpty ? "Untitled" : scene.title)
                        .font(.custom("Lora-Regular", size: 10.5))
                        .foregroundColor(.primary)
                        .lineLimit(2)
                    if let wc = scene.wordCount, wc > 0 {
                        Text("\(wc.formatted()) words")
                            .font(.system(size: 8))
                            .foregroundColor(Color(.systemGray3))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 8)
                .padding(.vertical, 7)
            }
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(
                        isActive ? accentColor : Color(.systemGray5),
                        lineWidth: isActive ? 1.5 : 0.5
                    )
            )
            .shadow(color: .black.opacity(0.06), radius: 2, x: 0, y: 1)

            // Selection checkbox
            if isSelecting {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 16))
                    .foregroundColor(isSelected ? accentColor : Color(.systemGray4))
                    .padding(5)
                    .background(Color(.systemBackground).opacity(0.8))
                    .clipShape(Circle())
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { onTap() }
        .onLongPressGesture(minimumDuration: 0.4) { onLongPress() }
    }
}
```

- [ ] **Step 2: Build — expect success**

- [ ] **Step 3: Commit**

```bash
git add ios/BraidrMobile/BraidrMobile/Views/Rails/SceneCardView.swift
git commit -m "feat: add SceneCardView with left accent bar and selection checkbox"
```

---

### Task 8: RailsView

**Files:**
- Create: `ios/BraidrMobile/BraidrMobile/Views/Rails/RailsView.swift`
- Create: `ios/BraidrMobile/BraidrMobile/Views/Rails/ExportBarView.swift`
- Create: `ios/BraidrMobile/BraidrMobile/Utils/ExportGenerator.swift`

- [ ] **Step 1: Create `ExportGenerator.swift`**

```swift
import Foundation

struct ExportGenerator {
    static func plainText(scenes: [BraidrScene], db: BraidrDB) -> String {
        scenes.map { scene in
            let body = (try? db.fetchDraft(sceneId: scene.id)) ?? scene.synopsis
            return "# \(scene.title)\n\n\(body)"
        }.joined(separator: "\n\n---\n\n")
    }
}
```

- [ ] **Step 2: Create `ExportBarView.swift`**

```swift
import SwiftUI

struct ExportBarView: View {
    let selectedScenes: [BraidrScene]
    let selectedWordCount: Int
    let db: BraidrDB
    let onCancel: () -> Void

    @State private var showShareSheet = false
    @State private var exportItems: [Any] = []

    var body: some View {
        VStack(spacing: 0) {
            Divider()
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(selectedWordCount.formatted()) words")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(Color(.systemGray3))
                        .textCase(.uppercase)
                    Text("\(selectedScenes.count) scene\(selectedScenes.count == 1 ? "" : "s") ready to export")
                        .font(.custom("Lora-Regular", size: 13))
                }
                Spacer()
                Button {
                    exportItems = [ExportGenerator.plainText(scenes: selectedScenes, db: db)]
                    showShareSheet = true
                } label: {
                    Label("Share", systemImage: "square.and.arrow.up")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .background(Color(hex: "#5b8fa8"))
                        .clipShape(Capsule())
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
            .padding(.bottom, 8)
            .background(Color(.systemBackground))
        }
        .sheet(isPresented: $showShareSheet) {
            ShareSheet(items: exportItems)
        }
    }
}
```

- [ ] **Step 3: Create `RailsView.swift`**

```swift
import SwiftUI

struct RailsView: View {
    @ObservedObject var projectVM: ProjectViewModel

    // Derived grid data
    private var rows: [RailsRow] {
        var posMap: [Int: [String: BraidrScene]] = [:]
        for scene in projectVM.scenes {
            guard let pos = scene.timelinePosition else { continue }
            posMap[pos, default: [:]][scene.characterId] = scene
        }
        return posMap.keys.sorted().map { RailsRow(id: $0, cells: posMap[$0]!) }
    }

    // Selection state
    @State private var isSelecting = false
    @State private var selectedIds: Set<String> = []
    @State private var selectedScene: BraidrScene?

    private let rowNumWidth: CGFloat = 28
    private let metrics = GridMetrics()

    var selectedScenes: [BraidrScene] {
        rows.flatMap { $0.cells.values.filter { selectedIds.contains($0.id) } }
            .sorted { ($0.timelinePosition ?? 0) < ($1.timelinePosition ?? 0) }
    }

    var selectedWordCount: Int {
        selectedScenes.compactMap(\.wordCount).reduce(0, +)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                topBar
                Divider()
                ZStack(alignment: .bottom) {
                    grid
                    if isSelecting && !selectedIds.isEmpty {
                        ExportBarView(
                            selectedScenes: selectedScenes,
                            selectedWordCount: selectedWordCount,
                            db: projectVM.db!,
                            onCancel: { exitSelection() }
                        )
                        .transition(.move(edge: .bottom))
                    }
                }
            }
            .navigationBarHidden(true)
            .navigationDestination(item: $selectedScene) { scene in
                EditorView(scene: scene, projectVM: projectVM)
            }
        }
    }

    // MARK: – Topbar

    private var topBar: some View {
        HStack {
            if isSelecting {
                Button("Cancel") { exitSelection() }
                    .foregroundColor(Color(hex: "#5b8fa8"))
                Spacer()
                Text("\(selectedIds.count) selected")
                    .font(.custom("Lora-SemiBold", size: 15))
                Spacer()
                Color.clear.frame(width: 60)
            } else {
                Text("The Crossing")   // TODO Task 9: read from project table
                    .font(.custom("Lora-SemiBold", size: 18))
                Spacer()
                Image(systemName: "ellipsis")
                    .foregroundColor(Color(.systemGray3))
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
        .padding(.top, 4)
        .animation(.easeInOut(duration: 0.2), value: isSelecting)
    }

    // MARK: – Grid

    private var grid: some View {
        ScrollView(.vertical) {
            HStack(alignment: .top, spacing: 0) {

                // Sticky row numbers (not inside horizontal scroll)
                VStack(spacing: 0) {
                    Color.clear.frame(height: metrics.headerHeight)
                    ForEach(Array(rows.enumerated()), id: \.element.id) { idx, _ in
                        Text("\(idx + 1)")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(Color(.systemGray3))
                            .frame(width: rowNumWidth, height: metrics.rowHeight, alignment: .trailing)
                            .padding(.trailing, 6)
                    }
                }
                .background(Color(.systemBackground))
                .overlay(alignment: .trailing) {
                    Rectangle()
                        .fill(Color(.systemGray5))
                        .frame(width: 0.5)
                }

                // Horizontally scrollable columns
                ScrollView(.horizontal, showsIndicators: false) {
                    ZStack(alignment: .topLeading) {
                        VStack(spacing: 0) {
                            // Column headers
                            HStack(spacing: metrics.cellGap) {
                                ForEach(projectVM.characters) { char in
                                    HStack(spacing: 5) {
                                        Circle()
                                            .fill(Color(hex: char.color ?? "#888"))
                                            .frame(width: 7, height: 7)
                                        Text(char.name.uppercased())
                                            .font(.system(size: 9.5, weight: .semibold))
                                            .foregroundColor(Color(.systemGray3))
                                            .tracking(1)
                                    }
                                    .frame(width: metrics.cellWidth, alignment: .leading)
                                    .padding(.horizontal, 6)
                                }
                            }
                            .frame(height: metrics.headerHeight, alignment: .center)
                            .overlay(alignment: .bottom) { Divider() }

                            // Rows
                            ForEach(Array(rows.enumerated()), id: \.element.id) { _, row in
                                HStack(spacing: metrics.cellGap) {
                                    ForEach(projectVM.characters) { char in
                                        Group {
                                            if let scene = row.cells[char.id] {
                                                SceneCardView(
                                                    scene: scene,
                                                    character: char,
                                                    isActive: selectedScene?.id == scene.id,
                                                    isSelecting: isSelecting,
                                                    isSelected: selectedIds.contains(scene.id),
                                                    onTap: {
                                                        if isSelecting {
                                                            toggleSelection(scene.id)
                                                        } else {
                                                            selectedScene = scene
                                                        }
                                                    },
                                                    onLongPress: {
                                                        withAnimation { enterSelection(initialId: scene.id) }
                                                    }
                                                )
                                            } else {
                                                Color.clear
                                            }
                                        }
                                        .frame(width: metrics.cellWidth, height: metrics.rowHeight - metrics.cardVerticalPadding * 2)
                                    }
                                }
                                .frame(height: metrics.rowHeight)
                                .padding(.vertical, metrics.cardVerticalPadding)
                                .overlay(alignment: .bottom) { Divider().opacity(0.5) }
                            }
                        }

                        // Connector lines overlay
                        ConnectorLinesView(
                            rows: rows,
                            characters: projectVM.characters,
                            metrics: metrics
                        )
                        .frame(
                            width: CGFloat(projectVM.characters.count) * (metrics.cellWidth + metrics.cellGap),
                            height: metrics.headerHeight + CGFloat(rows.count) * metrics.rowHeight
                        )
                    }
                }
                // Right-edge fade
                .overlay(alignment: .trailing) {
                    LinearGradient(
                        colors: [.clear, Color(.systemBackground)],
                        startPoint: .leading, endPoint: .trailing
                    )
                    .frame(width: 48)
                    .allowsHitTesting(false)
                }
            }
        }
    }

    // MARK: – Selection helpers

    private func enterSelection(initialId: String) {
        isSelecting = true
        selectedIds = [initialId]
    }

    private func toggleSelection(_ id: String) {
        if selectedIds.contains(id) { selectedIds.remove(id) }
        else { selectedIds.insert(id) }
    }

    private func exitSelection() {
        isSelecting = false
        selectedIds = []
    }
}
```

- [ ] **Step 4: Update `ContentView.swift`**

```swift
import SwiftUI

struct ContentView: View {
    @StateObject private var projectVM = ProjectViewModel()
    @State private var showFilePicker = false

    var body: some View {
        Group {
            if projectVM.db != nil {
                RailsView(projectVM: projectVM)
            } else {
                VStack(spacing: 28) {
                    Image("BraidrLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(height: 36)

                    Button("Open Project") { showFilePicker = true }
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(Color(hex: "#5b8fa8"))

                    if let msg = projectVM.errorMessage {
                        Text(msg)
                            .font(.system(size: 13))
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                }
                .sheet(isPresented: $showFilePicker) {
                    DocumentPicker { url in
                        projectVM.loadFromURL(url)
                        showFilePicker = false
                    }
                }
            }
        }
        .onAppear { projectVM.restoreFromBookmark() }
    }
}
```

Note: Add the Braidr logo PNG to the Xcode asset catalog as `BraidrLogo`. Copy from `/Users/brian/braidr/src/renderer/assets/braidr-logo.png`.

- [ ] **Step 5: Build and run in Simulator**

  Select iPhone 15 Pro simulator. Cmd+R.
  Expected: App launches, shows "Open Project" screen with Braidr logo.

- [ ] **Step 6: Test with a real `.braidr` file**

  - In Simulator, drag a `.braidr` file onto the simulator window (or use the Files app)
  - Tap "Open Project", navigate to the file, open it
  - Expected: Rails grid appears with character columns and scene cards

- [ ] **Step 7: Commit**

```bash
git add ios/BraidrMobile/BraidrMobile/Views/
git commit -m "feat: add RailsView with scrollable grid, connector lines, and selection mode"
```

---

### Task 9: EditorView + EditorViewModel

**Files:**
- Create: `ios/BraidrMobile/BraidrMobile/ViewModels/EditorViewModel.swift`
- Create: `ios/BraidrMobile/BraidrMobile/Views/Editor/EditorView.swift`

- [ ] **Step 1: Write failing test**

```swift
// EditorViewModelTests.swift
import XCTest
@testable import BraidrMobile

@MainActor
final class EditorViewModelTests: XCTestCase {
    func test_loadContent_populatesContentFromDraft() async throws {
        let db = try makeDB()
        let scene = BraidrScene(id: "s1", characterId: "c1", plotPointId: nil,
                                 title: "Test", synopsis: "", sceneNumber: 1,
                                 timelinePosition: 1, wordCount: nil, chapterId: nil)
        let vm = EditorViewModel(scene: scene, db: db)
        // Give async load a moment
        try await Task.sleep(for: .milliseconds(50))
        XCTAssertEqual(vm.content, "Hello world.")
    }

    private func makeDB() throws -> BraidrDB {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString + ".braidr")
        let db = try BraidrDB(url: url)
        let pool = try DatabasePool(path: url.path)
        try pool.write { db in
            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS scene_drafts (id TEXT PRIMARY KEY, scene_id TEXT NOT NULL UNIQUE, content TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL DEFAULT 0);
                INSERT INTO scene_drafts VALUES ('d1','s1','Hello world.',0);
            """)
        }
        return db
    }
}
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Create `EditorViewModel.swift`**

```swift
import Foundation

@MainActor
final class EditorViewModel: ObservableObject {
    @Published var content: String = ""

    let scene: BraidrScene
    private let db: BraidrDB
    private var saveTask: Task<Void, Never>?

    init(scene: BraidrScene, db: BraidrDB) {
        self.scene = scene
        self.db = db
        Task { await loadContent() }
    }

    private func loadContent() async {
        let text = try? db.fetchDraft(sceneId: scene.id)
        content = text ?? ""
    }

    func onContentChange(_ newValue: String) {
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(for: .milliseconds(800))
            guard !Task.isCancelled else { return }
            try? db.saveDraft(sceneId: scene.id, content: newValue)
        }
    }
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Create `EditorView.swift`**

```swift
import SwiftUI

struct EditorView: View {
    let scene: BraidrScene
    @ObservedObject var projectVM: ProjectViewModel
    @StateObject private var vm: EditorViewModel
    @State private var showInfoSheet = false
    @Environment(\.dismiss) private var dismiss

    init(scene: BraidrScene, projectVM: ProjectViewModel) {
        self.scene = scene
        self.projectVM = projectVM
        _vm = StateObject(wrappedValue: EditorViewModel(scene: scene, db: projectVM.db!))
    }

    private var character: BraidrCharacter? {
        projectVM.characters.first { $0.id == scene.characterId }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Topbar
            HStack(spacing: 12) {
                Button { dismiss() } label: {
                    Text("‹")
                        .font(.system(size: 22, weight: .light))
                        .foregroundColor(Color(hex: "#5b8fa8"))
                }
                VStack(alignment: .leading, spacing: 7) {
                    Text("\(character?.name ?? "Unknown") · Scene \(scene.sceneNumber)")
                        .font(.system(size: 9.5, weight: .semibold))
                        .foregroundColor(Color(.systemGray3))
                        .textCase(.uppercase)
                        .tracking(1)
                    Text(scene.title.isEmpty ? "Untitled" : scene.title)
                        .font(.custom("Lora-SemiBold", size: 19))
                        .foregroundColor(.primary)
                        .lineLimit(2)
                }
                Spacer()
                Button("···") { showInfoSheet = true }
                    .font(.system(size: 17, weight: .light))
                    .foregroundColor(Color(.systemGray3))
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 12)
            .padding(.top, 4)
            .overlay(alignment: .bottom) { Divider() }

            // Prose editor
            TextEditor(text: $vm.content)
                .font(.custom("Lora-Regular", size: 15.5))
                .lineSpacing(8)
                .scrollContentBackground(.hidden)
                .background(Color(.systemBackground))
                .padding(.horizontal, 14)
                .onChange(of: vm.content) { _, newValue in
                    vm.onContentChange(newValue)
                }
        }
        .navigationBarHidden(true)
        .sheet(isPresented: $showInfoSheet) {
            InfoSheetView(scene: scene, projectVM: projectVM)
                .presentationDetents([.fraction(0.65)])
                .presentationDragIndicator(.visible)
        }
    }
}
```

- [ ] **Step 6: Run in Simulator — tap a scene card**

  Expected: Editor opens with the scene title in the topbar and draft text in the body. Type something, dismiss, re-open — text persists.

- [ ] **Step 7: Commit**

```bash
git add ios/BraidrMobile/BraidrMobile/ViewModels/EditorViewModel.swift \
        ios/BraidrMobile/BraidrMobile/Views/Editor/EditorView.swift \
        ios/BraidrMobile/BraidrMobileTests/EditorViewModelTests.swift
git commit -m "feat: add EditorView and EditorViewModel with 800ms autosave"
```

---

### Task 10: InfoSheetView

**Files:**
- Create: `ios/BraidrMobile/BraidrMobile/Views/Editor/InfoSheetView.swift`

- [ ] **Step 1: Create `InfoSheetView.swift`**

```swift
import SwiftUI

struct InfoSheetView: View {
    let scene: BraidrScene
    @ObservedObject var projectVM: ProjectViewModel
    @State private var showCharacterPicker = false
    @State private var showPlotPointPicker = false
    @State private var showChapterPicker = false

    private var character: BraidrCharacter? {
        projectVM.characters.first { $0.id == scene.characterId }
    }
    private var plotPoint: BraidrPlotPoint? {
        projectVM.plotPoints.first { $0.id == scene.plotPointId }
    }
    private var chapter: BraidrChapter? {
        projectVM.chapters.first { $0.id == scene.chapterId }
    }
    private var plotPointsForCharacter: [BraidrPlotPoint] {
        projectVM.plotPoints.filter { $0.characterId == scene.characterId }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 16)
            infoRow("Character", value: character?.name ?? "—", tappable: true) {
                showCharacterPicker = true
            }
            infoRow("Plot point", value: plotPoint?.title ?? "—", tappable: true) {
                showPlotPointPicker = true
            }
            infoRow("Chapter", value: chapter?.title ?? "—", tappable: true) {
                showChapterPicker = true
            }
            infoRow("Words",
                    value: scene.wordCount.map { $0.formatted() } ?? "—",
                    tappable: false, action: nil)
        }
        .sheet(isPresented: $showCharacterPicker) {
            pickerSheet("Character", items: projectVM.characters, label: \.name) { selected in
                try? projectVM.db?.updateScene(id: scene.id, characterId: selected.id)
                try? projectVM.reload()
            }
        }
        .sheet(isPresented: $showPlotPointPicker) {
            pickerSheet("Plot point", items: plotPointsForCharacter, label: \.title) { selected in
                try? projectVM.db?.updateScene(id: scene.id, plotPointId: selected.id)
                try? projectVM.reload()
            }
        }
        .sheet(isPresented: $showChapterPicker) {
            pickerSheet("Chapter", items: projectVM.chapters, label: \.title) { selected in
                try? projectVM.db?.updateScene(id: scene.id, chapterId: selected.id)
                try? projectVM.reload()
            }
        }
    }

    @ViewBuilder
    private func infoRow(_ label: String, value: String,
                          tappable: Bool, action: (() -> Void)?) -> some View {
        Button(action: action ?? {}) {
            HStack {
                Text(label)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(Color(.systemGray3))
                    .textCase(.uppercase)
                    .tracking(1)
                    .frame(width: 90, alignment: .leading)
                Text(value)
                    .font(.custom("Lora-Regular", size: 14))
                    .foregroundColor(tappable ? Color(hex: "#5b8fa8") : Color(.systemGray2))
                Spacer()
                if tappable {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12))
                        .foregroundColor(Color(.systemGray4))
                }
            }
            .padding(.horizontal, 22)
            .padding(.vertical, 13)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!tappable)
        Divider()
    }

    @ViewBuilder
    private func pickerSheet<T: Identifiable>(
        _ title: String,
        items: [T],
        label: KeyPath<T, String>,
        onSelect: @escaping (T) -> Void
    ) -> some View {
        NavigationStack {
            List(items) { item in
                Button(item[keyPath: label]) {
                    onSelect(item)
                    showCharacterPicker = false
                    showPlotPointPicker = false
                    showChapterPicker = false
                }
                .foregroundColor(.primary)
                .font(.custom("Lora-Regular", size: 15))
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.fraction(0.45)])
    }
}
```

- [ ] **Step 2: Run in Simulator — open a scene, tap `···`**

  Expected: Sheet slides up showing Character, Plot point, Chapter (blue, tappable), Words (gray). Tapping a field opens a picker list. Selecting updates the scene and reloads.

- [ ] **Step 3: Commit**

```bash
git add ios/BraidrMobile/BraidrMobile/Views/Editor/InfoSheetView.swift
git commit -m "feat: add InfoSheetView with editable character/plot point/chapter pickers"
```

---

### Task 11: Read Project Name from DB

**Files:**
- Modify: `ios/BraidrMobile/BraidrMobile/Models/BraidrDB.swift`
- Modify: `ios/BraidrMobile/BraidrMobile/ViewModels/ProjectViewModel.swift`
- Modify: `ios/BraidrMobile/BraidrMobile/Views/Rails/RailsView.swift`

- [ ] **Step 1: Add `fetchProjectName` to `BraidrDB`**

```swift
// Add to BraidrDB.swift
func fetchProjectName() throws -> String? {
    try pool.read { db in
        let row = try Row.fetchOne(db, sql: "SELECT name FROM project LIMIT 1")
        return row?["name"]
    }
}
```

- [ ] **Step 2: Add `projectName` to `ProjectViewModel`**

```swift
// Add to ProjectViewModel published properties:
@Published var projectName: String = "Braidr"

// In reload(), add:
projectName = (try? db.fetchProjectName()) ?? "Braidr"
```

- [ ] **Step 3: Use `projectVM.projectName` in `RailsView` topbar**

```swift
// Replace hardcoded "The Crossing" in RailsView topbar with:
Text(projectVM.projectName)
    .font(.custom("Lora-SemiBold", size: 18))
```

- [ ] **Step 4: Build and verify project name shows correctly**

- [ ] **Step 5: Commit**

```bash
git add ios/BraidrMobile/BraidrMobile/
git commit -m "feat: read project name from .braidr project table"
```

---

### Task 12: Final Polish + App Icon

**Files:**
- Modify: `ios/BraidrMobile/BraidrMobile/BraidrMobileApp.swift`
- Add app icon to asset catalog

- [ ] **Step 1: Set accent color**

  In Xcode Assets.xcassets, add Color Set named `AccentColor`, set to `#5b8fa8`.

- [ ] **Step 2: Add app icon**

  In Assets.xcassets → AppIcon, add the Braidr icon image.
  Source: `/Users/brian/braidr/build/icon-1024.png` (1024×1024 required for App Store).

- [ ] **Step 3: Set `BraidrMobileApp.swift`**

```swift
import SwiftUI

@main
struct BraidrMobileApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
```

- [ ] **Step 4: Full end-to-end test on device or simulator**

  - Launch app → "Open Project" screen
  - Open a `.braidr` file → rails grid loads
  - Scroll horizontally → row numbers stay fixed
  - Scroll vertically → timeline progresses
  - Tap scene → editor opens with prose
  - Type text → dismiss → reopen → text persists
  - Tap `···` → info sheet slides up, fields tappable
  - Long-press scene → selection mode
  - Select 3 scenes → export bar appears
  - Tap Share → iOS share sheet opens with plain text

- [ ] **Step 5: Commit**

```bash
git add ios/BraidrMobile/
git commit -m "feat: final polish — app icon, accent color, end-to-end verified"
```

---

## Self-Review

**Spec coverage:**
- ✅ Rails grid (columns = characters, rows = timeline positions, one scene per slot)
- ✅ Row numbers sticky left
- ✅ Horizontal scroll with right-edge fade
- ✅ Per-character connector lines with gap word counts
- ✅ Scene cards (left accent bar, serif title, word count)
- ✅ Long-press selection mode with checkboxes
- ✅ Export bar + iOS share sheet (plain text)
- ✅ Editor (topbar, serif prose, autosave 800ms)
- ✅ Info sheet (Character, Plot point, Chapter editable; Words read-only)
- ✅ File picker + security-scoped bookmark persistence
- ✅ iCloud Drive file access
- ✅ Lora font throughout

**Not in V1 (per spec):** Creating scenes, deleting scenes, reordering, dark mode, Tags editing, DOCX export, PDF export.

**Type consistency:** `GridMetrics`, `RailsRow`, `BraidrScene`, `BraidrCharacter` defined in Tasks 6 and 2 respectively, used consistently in Tasks 7, 8, 9, 10.
