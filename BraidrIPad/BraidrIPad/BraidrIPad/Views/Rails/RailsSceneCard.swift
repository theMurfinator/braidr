import SwiftUI
import UIKit

struct RailsSceneCard: View {
    let scene: Scene
    let characterColorHex: String
    let dragState: DragState
    let viewModel: ProjectViewModel
    var onTitleChange: (String) -> Void = { _ in }
    var onTagsChange: ([String]) -> Void = { _ in }
    var onNotesChange: ([String]) -> Void = { _ in }
    var onTap: () -> Void = {}
    var onDropRequested: (RailsDropTarget) -> Void = { _ in }

    @State private var title: String = ""
    @State private var tagsText: String = ""
    @State private var notesText: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "line.3.horizontal")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .padding(4)
                    .contentShape(Rectangle())
                    .gesture(dragGesture)
                    .accessibilityLabel("Drag handle for scene \(scene.title.strippingInlineTags())")
                    .accessibilityHint("Long press and drag to move this scene")
                Text("\(scene.sceneNumber)")
                    .font(.caption2.monospacedDigit().bold())
                    .foregroundStyle(Color(hex: characterColorHex))
                Spacer()
                ConnectionBadge(viewModel: viewModel, sceneId: scene.id)
            }
            TextField("Title", text: $title, onCommit: { onTitleChange(title) })
                .textFieldStyle(.plain)
                .font(scene.isHighlighted ? .body.bold() : .body)

            TextField("#tags space-separated", text: $tagsText, onCommit: {
                let parts = tagsText
                    .split(separator: " ")
                    .map { String($0).trimmingCharacters(in: CharacterSet(charactersIn: "#")) }
                    .filter { !$0.isEmpty }
                onTagsChange(parts)
            })
            .textFieldStyle(.plain)
            .font(.caption2)
            .foregroundStyle(.secondary)

            TextField("notes (one per line)", text: $notesText, axis: .vertical)
                .onSubmit {
                    let lines = notesText.split(separator: "\n").map(String.init)
                    onNotesChange(lines)
                }
                .textFieldStyle(.plain)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(3...)

            Spacer(minLength: 0)
        }
        .padding(8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color(hex: characterColorHex).opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(hex: characterColorHex).opacity(0.35), lineWidth: 1)
        )
        .padding(4)
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
        .onAppear {
            title = scene.title
            tagsText = scene.tags.map { "#\($0)" }.joined(separator: " ")
            notesText = scene.notes.joined(separator: "\n")
        }
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
