import Foundation

struct PlotPoint: Codable, Identifiable, Hashable {
    var id: String
    var characterId: String
    var title: String
    var expectedSceneCount: Int?
    var description: String
    var order: Int
}
