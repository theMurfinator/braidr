import SwiftUI

struct RailsView: View {
    @ObservedObject var projectVM: ProjectViewModel

    private var rows: [RailsRow] {
        var posMap: [Int: [String: BraidrScene]] = [:]
        for scene in projectVM.scenes {
            guard let pos = scene.timelinePosition else { continue }
            posMap[pos, default: [:]][scene.characterId] = scene
        }
        return posMap.keys.sorted().map { RailsRow(id: $0, cells: posMap[$0]!) }
    }

    @State private var isSelecting = false
    @State private var selectedIds: Set<String> = []
    @State private var selectedScene: BraidrScene?

    private let rowNumWidth: CGFloat = 28
    private let metrics = GridMetrics()

    var selectedScenes: [BraidrScene] {
        rows.flatMap { $0.cells.values.filter { selectedIds.contains($0.id) } }
            .sorted { ($0.timelinePosition ?? 0) < ($1.timelinePosition ?? 0) }
    }

    var selectedWordCount: Int {
        selectedScenes.compactMap(\.wordCount).reduce(0, +)
    }

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                topBar
                Divider()
                ZStack(alignment: .bottom) {
                    grid
                    if isSelecting && !selectedIds.isEmpty {
                        ExportBarView(
                            selectedScenes: selectedScenes,
                            selectedWordCount: selectedWordCount,
                            db: projectVM.db!,
                            onCancel: { exitSelection() }
                        )
                        .transition(.move(edge: .bottom))
                    }
                }

                // Hidden navigation link for programmatic push
                NavigationLink(
                    destination: selectedScene.map { EditorView(scene: $0, projectVM: projectVM) },
                    isActive: Binding(
                        get: { selectedScene != nil },
                        set: { if !$0 { selectedScene = nil } }
                    )
                ) { EmptyView() }
                .hidden()
            }
            .navigationBarHidden(true)
        }
        .navigationViewStyle(.stack)
    }

    // MARK: - Topbar

    private var topBar: some View {
        HStack {
            if isSelecting {
                Button("Cancel") { exitSelection() }
                    .foregroundColor(Color(hex: "#5b8fa8"))
                Spacer()
                Text("\(selectedIds.count) selected")
                    .font(.custom("Lora-SemiBold", size: 15))
                Spacer()
                Color.clear.frame(width: 60)
            } else {
                Text(projectVM.projectName)
                    .font(.custom("Lora-SemiBold", size: 18))
                Spacer()
                Image(systemName: "ellipsis")
                    .foregroundColor(Color(.systemGray3))
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
        .padding(.top, 4)
        .animation(.easeInOut(duration: 0.2), value: isSelecting)
    }

    // MARK: - Grid

    private var grid: some View {
        ScrollView(.vertical) {
            HStack(alignment: .top, spacing: 0) {

                // Sticky row numbers -- fixed, not inside horizontal scroll
                VStack(spacing: 0) {
                    Color.clear.frame(height: metrics.headerHeight)
                    ForEach(Array(rows.enumerated()), id: \.element.id) { idx, _ in
                        Text("\(idx + 1)")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(Color(.systemGray3))
                            .frame(width: rowNumWidth, height: metrics.rowHeight, alignment: .trailing)
                            .padding(.trailing, 6)
                    }
                }
                .background(Color(.systemBackground))
                .overlay(alignment: .trailing) {
                    Rectangle()
                        .fill(Color(.systemGray5))
                        .frame(width: 0.5)
                }

                // Horizontally scrollable columns
                ScrollView(.horizontal, showsIndicators: false) {
                    ZStack(alignment: .topLeading) {
                        VStack(spacing: 0) {
                            // Column headers
                            HStack(spacing: metrics.cellGap) {
                                ForEach(projectVM.characters) { char in
                                    HStack(spacing: 5) {
                                        Circle()
                                            .fill(Color(hex: char.color ?? "#888"))
                                            .frame(width: 7, height: 7)
                                        Text(char.name.uppercased())
                                            .font(.system(size: 9.5, weight: .semibold))
                                            .foregroundColor(Color(.systemGray3))
                                            .tracking(1)
                                    }
                                    .frame(width: metrics.cellWidth, alignment: .leading)
                                    .padding(.horizontal, 6)
                                }
                            }
                            .frame(height: metrics.headerHeight, alignment: .center)
                            .overlay(alignment: .bottom) { Divider() }

                            // Rows
                            ForEach(Array(rows.enumerated()), id: \.element.id) { _, row in
                                HStack(spacing: metrics.cellGap) {
                                    ForEach(projectVM.characters) { char in
                                        Group {
                                            if let scene = row.cells[char.id] {
                                                SceneCardView(
                                                    scene: scene,
                                                    character: char,
                                                    isActive: selectedScene?.id == scene.id,
                                                    isSelecting: isSelecting,
                                                    isSelected: selectedIds.contains(scene.id),
                                                    onTap: {
                                                        if isSelecting {
                                                            toggleSelection(scene.id)
                                                        } else {
                                                            selectedScene = scene
                                                        }
                                                    },
                                                    onLongPress: {
                                                        withAnimation { enterSelection(initialId: scene.id) }
                                                    }
                                                )
                                            } else {
                                                Color.clear
                                            }
                                        }
                                        .frame(width: metrics.cellWidth,
                                               height: metrics.rowHeight - metrics.cardVerticalPadding * 2)
                                    }
                                }
                                .frame(height: metrics.rowHeight)
                                .padding(.vertical, metrics.cardVerticalPadding)
                                .overlay(alignment: .bottom) { Divider().opacity(0.5) }
                            }
                        }

                        // Connector lines overlay
                        ConnectorLinesView(
                            rows: rows,
                            characters: projectVM.characters,
                            metrics: metrics
                        )
                        .frame(
                            width: CGFloat(projectVM.characters.count) * (metrics.cellWidth + metrics.cellGap),
                            height: metrics.headerHeight + CGFloat(rows.count) * metrics.rowHeight
                        )
                    }
                }
                // Right-edge fade gradient
                .overlay(alignment: .trailing) {
                    LinearGradient(
                        colors: [.clear, Color(.systemBackground)],
                        startPoint: .leading, endPoint: .trailing
                    )
                    .frame(width: 48)
                    .allowsHitTesting(false)
                }
            }
        }
    }

    // MARK: - Selection helpers

    private func enterSelection(initialId: String) {
        isSelecting = true
        selectedIds = [initialId]
    }

    private func toggleSelection(_ id: String) {
        if selectedIds.contains(id) { selectedIds.remove(id) }
        else { selectedIds.insert(id) }
    }

    private func exitSelection() {
        isSelecting = false
        selectedIds = []
    }
}
