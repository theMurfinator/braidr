import Foundation

enum TagCategory: String, Codable, CaseIterable {
    case people
    case locations
    case arcs
    case things
    case time
}

struct Tag: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var category: TagCategory
}
