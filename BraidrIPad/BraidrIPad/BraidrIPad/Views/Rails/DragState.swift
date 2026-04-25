import SwiftUI
import Observation

enum RailsDropTarget: Equatable {
    case row(Int)   // timeline position (1-indexed)
    case inbox
}

@Observable
final class DragState {
    var sceneId: String?
    var sceneTitle: String = ""
    var ghostPosition: CGPoint = .zero
    var dropTarget: RailsDropTarget?
    var ghostScene: Scene?
    var ghostCharacterColorHex: String = "#888888"

    /// Row frames captured by RailsGridView via preferences.
    var rowFrames: [Int: CGRect] = [:]
    var inboxFrame: CGRect = .zero

    func begin(scene: Scene, at point: CGPoint, characterColorHex: String = "#888888") {
        sceneId = scene.id
        sceneTitle = scene.title
        ghostScene = scene
        ghostCharacterColorHex = characterColorHex
        ghostPosition = point
        dropTarget = nil
    }

    func update(to point: CGPoint) {
        ghostPosition = point
        if inboxFrame.contains(point) {
            dropTarget = .inbox
            return
        }
        for (idx, frame) in rowFrames where frame.contains(point) {
            dropTarget = .row(idx)
            return
        }
        dropTarget = nil
    }

    func end() -> RailsDropTarget? {
        let target = dropTarget
        sceneId = nil
        sceneTitle = ""
        ghostScene = nil
        ghostCharacterColorHex = "#888888"
        dropTarget = nil
        return target
    }
}
