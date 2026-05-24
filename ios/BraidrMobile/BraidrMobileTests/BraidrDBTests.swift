import XCTest
import GRDB
@testable import BraidrMobile

final class BraidrDBTests: XCTestCase {
    var db: BraidrDB!

    override func setUpWithError() throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString + ".braidr")
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
