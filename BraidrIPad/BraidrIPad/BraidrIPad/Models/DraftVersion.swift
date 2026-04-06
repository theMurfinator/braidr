import Foundation

struct DraftVersion: Codable, Identifiable {
    var id: String { "\(version)" }
    var version: Int
    var content: String
    var savedAt: Double // timestamp
}

struct SceneComment: Codable, Identifiable {
    var id: String
    var text: String
    var createdAt: Double // timestamp
}
