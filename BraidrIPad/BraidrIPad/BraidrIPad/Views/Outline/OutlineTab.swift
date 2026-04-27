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

    @AppStorage("outline.fontFamily") private var fontFamily: String = ".AppleSystemUISerifSemibold"
    @AppStorage("outline.fontSize") private var fontSize: Double = 16
    @AppStorage("outline.showTags") private var showTags: Bool = true
    @State private var showFontMenu = false

    var body: some View {
        let pps = viewModel.plotPoints(for: characterId)
        let allScenes = viewModel.scenes(for: characterId)
        let characterName = viewModel.characterName(for: characterId)
        let colorHex = viewModel.characterColor(for: characterId)

        List {
            let orphans = allScenes.filter { $0.plotPointId == nil }
            if !orphans.isEmpty {
                Section("Unassigned") {
                    ForEach(orphans) { scene in
                        SceneRowView(scene: scene, colorHex: colorHex, fontFamily: fontFamily, fontSize: fontSize, showTags: showTags)
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
                        SceneRowView(scene: scene, colorHex: colorHex, fontFamily: fontFamily, fontSize: fontSize, showTags: showTags)
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
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showFontMenu = true
                } label: {
                    Image(systemName: "textformat")
                }
            }
        }
        .popover(isPresented: $showFontMenu) {
            FontSettingsPopover(
                fontFamily: $fontFamily,
                fontSize: $fontSize,
                showTagToggle: true,
                showTags: $showTags
            )
            .frame(minWidth: 320, minHeight: 400)
        }
    }
}

// MARK: - Scene row

struct SceneRowView: View {
    let scene: Scene
    var colorHex: String = "#888888"
    var fontFamily: String = ".AppleSystemUISerifSemibold"
    var fontSize: Double = 16
    var showTags: Bool = true

    var body: some View {
        HStack(spacing: 0) {
            if scene.isHighlighted {
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color(hex: colorHex))
                    .frame(width: 4)
                    .padding(.trailing, 8)
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text("\(scene.sceneNumber).")
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(.secondary)
                    Text(scene.title)
                        .font(resolveFont(name: fontFamily, size: fontSize, bold: scene.isHighlighted))
                    Spacer()
                    if let wc = scene.wordCount, wc > 0 {
                        Text(Self.formatWordCount(wc))
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                }

                if showTags && !scene.tags.isEmpty {
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
        }
        .padding(.vertical, 2)
    }

    private static func formatWordCount(_ count: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        let formatted = formatter.string(from: NSNumber(value: count)) ?? "\(count)"
        return "\(formatted)w"
    }
}
