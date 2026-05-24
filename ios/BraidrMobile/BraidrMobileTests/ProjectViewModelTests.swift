import XCTest
import GRDB
@testable import BraidrMobile

@MainActor
final class ProjectViewModelTests: XCTestCase {
    func test_loadFromURL_populatesCharactersAndScenes() throws {
        let url = try makeTestBraidrFile()
        let vm = ProjectViewModel()
        vm.loadFromURL(url)
        XCTAssertFalse(vm.characters.isEmpty)
        XCTAssertFalse(vm.scenes.isEmpty)
        XCTAssertNil(vm.errorMessage)
    }

    func test_loadFromURL_setsErrorOnBadFile() throws {
        let badURL = URL(fileURLWithPath: "/nonexistent/file.braidr")
        let vm = ProjectViewModel()
        vm.loadFromURL(badURL)
        XCTAssertNotNil(vm.errorMessage)
    }

    private func makeTestBraidrFile() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString + ".braidr")
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
