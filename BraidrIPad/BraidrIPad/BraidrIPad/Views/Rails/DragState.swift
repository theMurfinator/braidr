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

    /// Row frames captured by RailsGridView via preferences.
    var rowFrames: [Int: CGRect] = [:]
    var inboxFrame: CGRect = .zero

    func begin(scene: Scene, at point: CGPoint) {
        sceneId = scene.id
        sceneTitle = scene.title
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
        dropTarget = nil
        return target
    }
}
