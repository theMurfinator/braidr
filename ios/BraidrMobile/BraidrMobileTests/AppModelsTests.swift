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
        XCTAssertEqual(scene?.characterId, "c1")      // verifies character_id mapping
        XCTAssertNil(scene?.plotPointId)               // verifies null optional
        XCTAssertEqual(scene?.sceneNumber, 1)          // verifies scene_number mapping
        XCTAssertEqual(scene?.timelinePosition, 3)     // verifies timeline_position mapping
        XCTAssertEqual(scene?.wordCount, 500)          // verifies word_count mapping
        XCTAssertNil(scene?.chapterId)                 // verifies null optional
    }

    func test_braidrCharacter_decodesFromRow() throws {
        let db = try DatabaseQueue()
        try db.write { db in
            try db.execute(sql: """
                CREATE TABLE characters (
                    id TEXT PRIMARY KEY, name TEXT, color TEXT, display_order INTEGER
                )
            """)
            try db.execute(sql: "INSERT INTO characters VALUES ('c1','Noah','#5b8fa8',2)")
        }
        let char = try db.read { db in
            try BraidrCharacter.fetchOne(db, sql: "SELECT * FROM characters")
        }
        XCTAssertEqual(char?.id, "c1")
        XCTAssertEqual(char?.name, "Noah")
        XCTAssertEqual(char?.color, "#5b8fa8")
        XCTAssertEqual(char?.displayOrder, 2)          // verifies display_order mapping
    }

    func test_braidrPlotPoint_decodesFromRow() throws {
        let db = try DatabaseQueue()
        try db.write { db in
            try db.execute(sql: """
                CREATE TABLE plot_points (
                    id TEXT PRIMARY KEY, character_id TEXT, title TEXT, display_order INTEGER
                )
            """)
            try db.execute(sql: "INSERT INTO plot_points VALUES ('pp1','c1','Setup',0)")
        }
        let pp = try db.read { db in
            try BraidrPlotPoint.fetchOne(db, sql: "SELECT * FROM plot_points")
        }
        XCTAssertEqual(pp?.id, "pp1")
        XCTAssertEqual(pp?.title, "Setup")
        XCTAssertEqual(pp?.characterId, "c1")          // verifies character_id mapping
        XCTAssertEqual(pp?.displayOrder, 0)            // verifies display_order mapping
    }

    func test_braidrChapter_decodesFromRow() throws {
        let db = try DatabaseQueue()
        try db.write { db in
            try db.execute(sql: """
                CREATE TABLE chapters (
                    id TEXT PRIMARY KEY, title TEXT, ord INTEGER
                )
            """)
            try db.execute(sql: "INSERT INTO chapters VALUES ('ch1','Part One',0)")
        }
        let ch = try db.read { db in
            try BraidrChapter.fetchOne(db, sql: "SELECT * FROM chapters")
        }
        XCTAssertEqual(ch?.id, "ch1")
        XCTAssertEqual(ch?.title, "Part One")
        XCTAssertEqual(ch?.ord, 0)
    }
}
