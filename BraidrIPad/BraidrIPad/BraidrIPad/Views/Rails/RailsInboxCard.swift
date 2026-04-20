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
                .contentShape(Rectangle())
                .gesture(dragGesture)
                .accessibilityLabel("Drag handle for \(characterName) scene \(scene.sceneNumber)")
                .accessibilityHint("Drag into the grid to place this scene")
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(Color(hex: characterColorHex).opacity(0.05))
        )
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .global)
            .onChanged { value in
                if dragState.sceneId == nil {
                    dragState.begin(scene: scene, at: value.location)
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                } else {
                    dragState.update(to: value.location)
                }
            }
            .onEnded { _ in
                let target = dragState.end()
                handleDrop(target: target)
            }
    }

    private func handleDrop(target: RailsDropTarget?) {
        guard let target else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        onDropRequested(target)
    }
}
