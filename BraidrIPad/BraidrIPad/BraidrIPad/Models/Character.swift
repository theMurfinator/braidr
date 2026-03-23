import Foundation

struct Character: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var filePath: String
    var color: String?
}
