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
            var statArgs = StatementArguments()
            for arg in args { statArgs += [arg] }
            try db.execute(
                sql: "UPDATE scenes SET \(sets.joined(separator: ", ")) WHERE id = ?",
                arguments: statArgs
            )
        }
    }
}
