import Foundation

struct Scene: Codable, Identifiable, Hashable {
    var id: String
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

    /// Key used in timeline positions and draft content maps
    var sceneKey: String {
        "\(characterId):\(sceneNumber)"
    }
}
