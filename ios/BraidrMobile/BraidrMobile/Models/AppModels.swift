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
