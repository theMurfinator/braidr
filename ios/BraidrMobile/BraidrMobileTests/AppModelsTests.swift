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
