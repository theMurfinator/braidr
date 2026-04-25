import SwiftUI

struct SceneDetailSheet: View {
    @Bindable var viewModel: ProjectViewModel
    let sceneId: String
    @Environment(\.dismiss) private var dismiss

    private var scene: Scene? {
        viewModel.scenes.first { $0.id == sceneId }
    }

    @State private var title: String = ""
    @State private var tagsText: String = ""
    @State private var notesLines: [String] = []

    var body: some View {
        NavigationStack {
            Form {
                Section("Title") {
                    TextField("Scene title", text: $title, axis: .vertical)
                        .lineLimit(2...)
                }
                Section("Tags") {
                    TextField("#tag1 #tag2", text: $tagsText)
                }
                Section("Notes") {
                    ForEach(notesLines.indices, id: \.self) { idx in
                        TextField("Note", text: $notesLines[idx], axis: .vertical)
                            .lineLimit(1...)
                    }
                    Button {
                        notesLines.append("")
                    } label: {
                        Label("Add note", systemImage: "plus.circle")
                    }
                }
                Section {
                    Button("Open in Editor") {
                        viewModel.selectedSceneId = sceneId
                        viewModel.selectedTab = "editor"
                        viewModel.selectedSceneForSheet = nil
                        dismiss()
                    }
                }
            }
            .navigationTitle("Edit Scene")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        viewModel.updateSceneTitle(sceneId: sceneId, title: title)
                        let parts = tagsText.split(separator: " ").map {
                            String($0).trimmingCharacters(in: CharacterSet(charactersIn: "#"))
                        }.filter { !$0.isEmpty }
                        viewModel.updateSceneTags(sceneId: sceneId, tags: parts)
                        viewModel.updateSceneNotes(sceneId: sceneId, notes: notesLines.filter { !$0.isEmpty })
                        dismiss()
                    }
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear(perform: load)
        }
    }

    private func load() {
        guard let scn = scene else { return }
        title = scn.title
        tagsText = scn.tags.map { "#\($0)" }.joined(separator: " ")
        notesLines = scn.notes
    }
}
