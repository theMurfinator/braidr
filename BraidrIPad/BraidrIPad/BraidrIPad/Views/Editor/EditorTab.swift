import SwiftUI

struct EditorTab: View {
    @Bindable var viewModel: ProjectViewModel
    @AppStorage("editor.fontFamily") private var fontFamily: String = "Lora, Georgia, serif"
    @AppStorage("editor.fontSize") private var fontSize: Double = 17
    @AppStorage("editor.lineHeight") private var lineHeight: Double = 1.6
    @State private var showFontMenu = false

    private static let fontOptions: [(label: String, css: String)] = [
        ("Lora",             "Lora, Georgia, serif"),
        ("Merriweather",     "Merriweather, Georgia, serif"),
        ("EB Garamond",      "'EB Garamond', Georgia, serif"),
        ("Georgia",          "Georgia, serif"),
        ("New York",         "'New York', Georgia, serif"),
        ("Palatino",         "Palatino, 'Palatino Linotype', Georgia, serif"),
        ("Times New Roman",  "'Times New Roman', Times, serif"),
        ("SF Pro",           "-apple-system, BlinkMacSystemFont, sans-serif"),
        ("Avenir Next",      "'Avenir Next', Avenir, sans-serif"),
    ]

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
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    BranchMenu(viewModel: viewModel)
                }
            }
        } detail: {
            if let sceneId = viewModel.selectedSceneId {
                TipTapEditorView(
                    initialContent: viewModel.draftContent(for: sceneId),
                    fontFamily: fontFamily,
                    fontSize: fontSize,
                    lineHeight: lineHeight,
                    onContentChanged: { html in
                        viewModel.updateDraft(for: sceneId, content: html)
                    }
                )
                .id(sceneId) // Force re-create when scene changes
                .navigationTitle(sceneTitleForId(sceneId))
                .ignoresSafeArea(edges: .bottom)
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
                    fontMenu
                        .frame(minWidth: 320, minHeight: 360)
                }
            } else {
                ContentUnavailableView(
                    "Select a Scene",
                    systemImage: "doc.text",
                    description: Text("Choose a scene from the sidebar to start writing.")
                )
            }
        }
    }

    @ViewBuilder
    private var fontMenu: some View {
        Form {
            Section("Font") {
                ForEach(Self.fontOptions, id: \.label) { option in
                    Button {
                        fontFamily = option.css
                    } label: {
                        HStack {
                            Text(option.label)
                                .foregroundStyle(.primary)
                            Spacer()
                            if fontFamily == option.css {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.tint)
                            }
                        }
                    }
                }
            }
            Section("Size") {
                HStack {
                    Text("\(Int(fontSize))pt")
                        .monospacedDigit()
                        .frame(width: 48, alignment: .leading)
                    Slider(value: $fontSize, in: 13...28, step: 1)
                }
            }
            Section("Line Height") {
                HStack {
                    Text(String(format: "%.1f", lineHeight))
                        .monospacedDigit()
                        .frame(width: 48, alignment: .leading)
                    Slider(value: $lineHeight, in: 1.2...2.2, step: 0.1)
                }
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
