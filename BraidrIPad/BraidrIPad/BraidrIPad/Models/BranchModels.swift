import Foundation

struct BranchInfo: Codable {
    var name: String
    var description: String?
    var createdAt: String
    var createdFrom: String
}

struct BranchIndex: Codable {
    var branches: [BranchInfo]
    var activeBranch: String?

    static let empty = BranchIndex(branches: [], activeBranch: nil)
}

struct BranchSceneDiff: Identifiable {
    var id: String { sceneId }
    var sceneId: String
    var characterId: String
    var characterName: String
    var sceneNumber: Int
    var leftTitle: String
    var rightTitle: String
    var leftPosition: Int?
    var rightPosition: Int?
    var changed: Bool
}

struct BranchCompareData {
    var leftName: String
    var rightName: String
    var scenes: [BranchSceneDiff]
}
