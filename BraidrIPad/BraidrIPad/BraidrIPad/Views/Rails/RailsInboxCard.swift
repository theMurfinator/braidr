import SwiftUI
import UIKit

struct RailsInboxCard: View {
    let scene: Scene
    let characterName: String
    let characterColorHex: String
    let dragState: DragState
    var onDropRequested: (RailsDropTarget) -> Void = { _ in }

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(Color(hex: characterColorHex))
                .frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(characterName) · \(scene.sceneNumber)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(scene.title.strippingInlineTags())
                    .font(.footnote)
                    .lineLimit(2)
            }
            Spacer()
            Image(systemName: "line.3.horizontal")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .padding(4)
                .accessibilityLabel("Drag handle for \(characterName) scene \(scene.sceneNumber)")
                .accessibilityHint("Drag into the grid to place this scene")
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(Color(hex: characterColorHex).opacity(0.05))
        )
        .contentShape(Rectangle())
        .gesture(longPressDragGesture)
    }

    private var longPressDragGesture: some Gesture {
        LongPressGesture(minimumDuration: 0.35, maximumDistance: 10)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .global))
            .onChanged { value in
                switch value {
                case .second(true, let drag?):
                    if dragState.sceneId == nil {
                        dragState.begin(scene: scene, at: drag.location, characterColorHex: characterColorHex)
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    } else {
                        dragState.update(to: drag.location)
                    }
                default:
                    break
                }
            }
            .onEnded { value in
                switch value {
                case .second(true, _):
                    let target = dragState.end()
                    handleDrop(target: target)
                default:
                    break
                }
            }
    }

    private func handleDrop(target: RailsDropTarget?) {
        guard let target else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        onDropRequested(target)
    }
}
