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

    @AppStorage("rails.fontFamily") private var fontFamily: String = ".AppleSystemUISerifSemibold"
    @AppStorage("rails.fontSize") private var fontSize: Double = 16
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
                    .accessibilityLabel("Drag handle for scene \(scene.title.strippingInlineTags())")
                    .accessibilityHint("Long press and drag to move this scene")
                Text("\(scene.sceneNumber)")
                    .font(.caption2.monospacedDigit().bold())
                    .foregroundStyle(Color(hex: characterColorHex))
                Spacer()
                ConnectionBadge(viewModel: viewModel, sceneId: scene.id)
            }
            TextField("Title", text: $title)
                .textFieldStyle(.plain)
                .font(resolveFont(name: fontFamily, size: fontSize, bold: scene.isHighlighted))
                .onChange(of: title) { _, new in onTitleChange(new) }

            TextField("#tags space-separated", text: $tagsText)
                .textFieldStyle(.plain)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .onChange(of: tagsText) { _, new in
                    let parts = new
                        .split(separator: " ")
                        .map { String($0).trimmingCharacters(in: CharacterSet(charactersIn: "#")) }
                        .filter { !$0.isEmpty }
                    onTagsChange(parts)
                }

            TextField("notes (one per line)", text: $notesText, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(3...)
                .onChange(of: notesText) { _, new in
                    let lines = new.split(separator: "\n").map(String.init).filter { !$0.isEmpty }
                    onNotesChange(lines)
                }

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
        .gesture(longPressDragGesture)
        .onTapGesture(perform: onTap)
        .task(id: scene.id) {
            title = scene.title
            tagsText = scene.tags.map { "#\($0)" }.joined(separator: " ")
            notesText = scene.notes.joined(separator: "\n")
        }
        .onChange(of: scene.title) { _, new in
            if new != title { title = new }
        }
        .onChange(of: scene.tags) { _, new in
            let rendered = new.map { "#\($0)" }.joined(separator: " ")
            if rendered != tagsText { tagsText = rendered }
        }
        .onChange(of: scene.notes) { _, new in
            let rendered = new.joined(separator: "\n")
            if rendered != notesText { notesText = rendered }
        }
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
