import SwiftUI

struct EditorTab: View {
    @Bindable var viewModel: ProjectViewModel

    var body: some View {
        NavigationSplitView {
            List(selection: $viewModel.selectedSceneId) {
                ForEach(viewModel.characters) { character in
                    Section(character.name) {
                        ForEach(viewModel.scenes(for: character.id)) { scene in
                            NavigationLink(value: scene.id) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("\(scene.sceneNumber). \(scene.title)")
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
}
