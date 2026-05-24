import Foundation

struct ExportGenerator {
    static func plainText(scenes: [BraidrScene], db: BraidrDB) -> String {
        scenes.map { scene in
            let body = (try? db.fetchDraft(sceneId: scene.id)) ?? scene.synopsis
            return "# \(scene.title)\n\n\(body)"
        }.joined(separator: "\n\n---\n\n")
    }
}
