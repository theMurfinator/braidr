import SwiftUI

struct EditorTab: View {
    @Bindable var viewModel: ProjectViewModel

    var body: some View {
        NavigationSplitView {
            List(selection: $viewModel.selectedSceneId) {
                Section("Braided") {
                    ForEach(editorOrderedPlaced) { scene in
                        sceneRow(for: scene)
                    }
                }
                if !editorOrderedUnplaced.isEmpty {
                    Section("Unplaced") {
                        ForEach(editorOrderedUnplaced) { scene in
                            sceneRow(for: scene)
                        }
                    }
                }
            }
            .navigationTitle("Scenes")
            .listStyle(.sidebar)
        } detail: {
            if let sceneId = viewModel.selectedSceneId {
                TipTapEditorView(
                    initialContent: viewModel.draftContent(for: sceneId),
                    onContentChanged: { html in
                        viewModel.updateDraft(for: sceneId, content: html)
                    }
                )
                .id(sceneId) // Force re-create when scene changes
                .navigationTitle(sceneTitleForId(sceneId))
                .ignoresSafeArea(edges: .bottom)
            } else {
                ContentUnavailableView(
                    "Select a Scene",
                    systemImage: "doc.text",
                    description: Text("Choose a scene from the sidebar to start writing.")
                )
            }
        }
    }

    private func sceneTitleForId(_ id: String) -> String {
        if let scene = viewModel.scenes.first(where: { $0.id == id }) {
            let name = viewModel.characterName(for: scene.characterId)
            return "\(name) — Scene \(scene.sceneNumber)"
        }
        return "Editor"
    }

    // Scenes with a timeline position, sorted by it — matches the desktop EditorView sidebar.
    private var editorOrderedPlaced: [Scene] {
        viewModel.scenes
            .filter { $0.timelinePosition != nil }
            .sorted { ($0.timelinePosition ?? 0) < ($1.timelinePosition ?? 0) }
    }

    // Scenes not yet braided — grouped below in a separate section.
    private var editorOrderedUnplaced: [Scene] {
        viewModel.scenes
            .filter { $0.timelinePosition == nil }
            .sorted {
                if $0.characterId != $1.characterId { return $0.characterId < $1.characterId }
                return $0.sceneNumber < $1.sceneNumber
            }
    }

    @ViewBuilder
    private func sceneRow(for scene: Scene) -> some View {
        NavigationLink(value: scene.id) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Circle()
                        .fill(Color(hex: viewModel.characterColor(for: scene.characterId)))
                        .frame(width: 8, height: 8)
                    Text("\(viewModel.characterName(for: scene.characterId)) · \(scene.sceneNumber)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Text(scene.title)
                    .lineLimit(2)
                    .font(scene.isHighlighted ? .body.bold() : .body)
                if !scene.tags.isEmpty {
                    Text(scene.tags.map { "#\($0)" }.joined(separator: " "))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}
