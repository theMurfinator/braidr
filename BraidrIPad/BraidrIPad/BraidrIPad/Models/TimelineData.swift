import Foundation

struct BraidedChapter: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    /// Chapter appears before this timeline position (1-indexed)
    var beforePosition: Int
}

struct FontSettings: Codable {
    var sectionTitle: String?
    var sectionTitleSize: Int?
    var sectionTitleBold: Bool?
    var sectionTitleColor: String?
    var sceneTitle: String?
    var sceneTitleSize: Int?
    var sceneTitleBold: Bool?
    var sceneTitleColor: String?
    var body: String?
    var bodySize: Int?
    var bodyBold: Bool?
    var bodyColor: String?
}

struct AllFontSettings: Codable {
    var global: FontSettings
    var screens: [String: FontSettings]?
}

struct ArchivedScene: Codable, Identifiable {
    var id: String
    var characterId: String
    var originalSceneNumber: Int
    var plotPointId: String?
    var content: String
    var tags: [String]
    var notes: [String]
    var isHighlighted: Bool
    var wordCount: Int?
    var archivedAt: Double // timestamp
}

struct MetadataFieldDef: Codable, Identifiable {
    var id: String
    var label: String
    var type: String // "text" | "dropdown" | "multiselect"
    var options: [String]?
    var optionColors: [String: String]?
    var order: Int
}

struct WorldEvent: Codable, Identifiable {
    var id: String
    var title: String
    var date: String
    var endDate: String?
    var description: String
    var tags: [String]
    var linkedSceneKeys: [String]
    var linkedNoteIds: [String]
    var createdAt: Double
    var updatedAt: Double
}

/// A value wrapper for heterogeneous JSON values in timeline data
enum AnyCodableValue: Codable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case array([AnyCodableValue])
    case dictionary([String: AnyCodableValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let val = try? container.decode(Bool.self) {
            self = .bool(val)
        } else if let val = try? container.decode(Int.self) {
            self = .int(val)
        } else if let val = try? container.decode(Double.self) {
            self = .double(val)
        } else if let val = try? container.decode(String.self) {
            self = .string(val)
        } else if let val = try? container.decode([AnyCodableValue].self) {
            self = .array(val)
        } else if let val = try? container.decode([String: AnyCodableValue].self) {
            self = .dictionary(val)
        } else {
            self = .null
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let val): try container.encode(val)
        case .int(let val): try container.encode(val)
        case .double(let val): try container.encode(val)
        case .bool(let val): try container.encode(val)
        case .array(let val): try container.encode(val)
        case .dictionary(let val): try container.encode(val)
        case .null: try container.encodeNil()
        }
    }
}

struct TimelineData: Codable {
    /// Maps scene ID to timeline position
    var positions: [String: Int]
    var connections: [String: [String]]?
    var chapters: [BraidedChapter]?
    var characterColors: [String: String]?
    var wordCounts: [String: Int]?
    var fontSettings: FontSettings?
    var allFontSettings: AllFontSettings?
    var archivedScenes: [ArchivedScene]?
    var draftContent: [String: String]?
    var metadataFieldDefs: [MetadataFieldDef]?
    var sceneMetadata: [String: [String: AnyCodableValue]]?
    var drafts: [String: [DraftVersion]]?
    var scratchpad: [String: String]?
    var sceneComments: [String: [SceneComment]]?
    var wordCountGoal: Int?
    var tags: [Tag]?
    var timelineDates: [String: String]?
    var timelineEndDates: [String: String]?
    var worldEvents: [WorldEvent]?

    init() {
        self.positions = [:]
    }
}
