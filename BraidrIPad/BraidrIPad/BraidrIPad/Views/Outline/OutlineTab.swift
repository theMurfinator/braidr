import SwiftUI

struct OutlineTab: View {
    @Bindable var viewModel: ProjectViewModel

    var body: some View {
        NavigationSplitView {
            List(selection: $viewModel.selectedCharacterId) {
                ForEach(viewModel.characters) { character in
                    NavigationLink(value: character.id) {
                        Label(character.name, systemImage: "person.fill")
                    }
                }
            }
            .navigationTitle("Characters")
            .listStyle(.sidebar)
        } detail: {
            if let charId = viewModel.selectedCharacterId {
                CharacterOutlineDetail(viewModel: viewModel, characterId: charId)
            } else {
                ContentUnavailableView(
                    "Select a Character",
                    systemImage: "person.2",
                    description: Text("Choose a character to view their outline.")
                )
            }
        }
    }
}

// MARK: - Character outline detail

private struct CharacterOutlineDetail: View {
    @Bindable var viewModel: ProjectViewModel
    let characterId: String

    var body: some View {
        let pps = viewModel.plotPoints(for: characterId)
        let allScenes = viewModel.scenes(for: characterId)
        let characterName = viewModel.characterName(for: characterId)

        List {
            // Orphan scenes (no plot point)
            let orphans = allScenes.filter { $0.plotPointId == nil }
            if !orphans.isEmpty {
                Section("Unassigned") {
                    ForEach(orphans) { scene in
                        SceneRowView(scene: scene)
                    }
                }
            }

            ForEach(pps) { pp in
                Section {
                    if !pp.description.isEmpty {
                        Text(pp.description)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    let ppScenes = allScenes.filter { $0.plotPointId == pp.id }
                    ForEach(ppScenes) { scene in
                        SceneRowView(scene: scene)
                    }
                } header: {
                    HStack {
                        Text(pp.title)
                        if let count = pp.expectedSceneCount {
                            Text("(\(count))")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle(characterName)
        .listStyle(.insetGrouped)
    }
}

// MARK: - Scene row

struct SceneRowView: View {
    let scene: Scene

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text("\(scene.sceneNumber).")
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
                Text(scene.title)
                    .font(scene.isHighlighted ? .body.bold() : .body)
                    .lineLimit(3)
            }

            if !scene.tags.isEmpty {
                Text(scene.tags.map { "#\($0)" }.joined(separator: " "))
                    .font(.caption2)
                    .foregroundStyle(.tint)
            }

            ForEach(scene.notes, id: \.self) { note in
                Text("• \(note)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.leading, 16)
            }
        }
        .padding(.vertical, 2)
    }
}
