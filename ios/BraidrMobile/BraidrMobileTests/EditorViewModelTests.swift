import XCTest
import GRDB
@testable import BraidrMobile

@MainActor
final class EditorViewModelTests: XCTestCase {
    func test_loadContent_populatesContentFromDraft() async throws {
        let db = try makeDB()
        let scene = BraidrScene(id: "s1", characterId: "c1", plotPointId: nil,
                                title: "Test", synopsis: "",
                                sceneNumber: 1, timelinePosition: 1,
                                wordCount: nil, chapterId: nil)
        let vm = EditorViewModel(scene: scene, db: db)
        // Give async load a moment
        try await Task.sleep(for: .milliseconds(50))
        XCTAssertEqual(vm.content, "Hello world.")
    }

    private func makeDB() throws -> BraidrDB {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString + ".braidr")
        let pool = try DatabasePool(path: url.path)
        try pool.write { db in
            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS scene_drafts (
                    id TEXT PRIMARY KEY,
                    scene_id TEXT NOT NULL UNIQUE,
                    content TEXT NOT NULL DEFAULT '',
                    updated_at INTEGER NOT NULL DEFAULT 0
                );
                INSERT INTO scene_drafts VALUES ('d1','s1','Hello world.',0);
            """)
        }
        return try BraidrDB(url: url)
    }
}
