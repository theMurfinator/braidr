import SwiftUI

struct RailsGridView: View {
    @Bindable var viewModel: ProjectViewModel
    @Bindable var dragState: DragState

    // Number of rows = highest timeline position among placed scenes, min 1.
    private var rowCount: Int {
        let maxPos = viewModel.scenes.compactMap { $0.timelinePosition }.max() ?? 0
        return max(maxPos, 1)
    }

    private var columnCount: Int { max(viewModel.characters.count, 1) }

    // Column width: fits the viewport when possible, falls back to minColumn.
    private static let minColumn: CGFloat = 200
    private static let rowNumberWidth: CGFloat = 40
    private static let headerHeight: CGFloat = 44
    private static let rowHeight: CGFloat = 140

    @State private var scrollTarget: Int = 1
    @State private var autoScrollTimer: Timer?
    @State private var insertAtRow: Int?

    var body: some View {
        GeometryReader { geo in
            let available = geo.size.width - Self.rowNumberWidth
            let fitColumn = available / CGFloat(columnCount)
            let columnWidth = max(Self.minColumn, fitColumn)

            ScrollViewReader { proxy in
                ScrollView([.horizontal, .vertical]) {
                    VStack(spacing: 0) {
                        header(columnWidth: columnWidth)
                        ForEach(1...rowCount, id: \.self) { rowIdx in
                            row(rowIndex: rowIdx, columnWidth: columnWidth)
                                .id(rowIdx)
                        }
                    }
                    .onPreferenceChange(RailsRowFrameKey.self) { frames in
                        dragState.rowFrames = frames
                    }
                }
                .onChange(of: dragState.ghostPosition) { _, pos in
                    guard dragState.sceneId != nil else {
                        stopAutoScroll()
                        return
                    }
                    let screenH = UIScreen.main.bounds.height
                    if pos.y < 120 {
                        startAutoScroll(direction: -1, proxy: proxy)
                    } else if pos.y > screenH - 120 {
                        startAutoScroll(direction: 1, proxy: proxy)
                    } else {
                        stopAutoScroll()
                    }
                }
                .onChange(of: dragState.sceneId) { _, newValue in
                    if newValue == nil { stopAutoScroll() }
                }
                .popover(item: Binding(
                    get: { insertAtRow.map { RowIdWrapper(id: $0) } },
                    set: { insertAtRow = $0?.id }
                )) { wrapper in
                    characterPicker(for: wrapper.id)
                }
            }
        }
    }

    @ViewBuilder
    private func header(columnWidth: CGFloat) -> some View {
        HStack(spacing: 0) {
            Text("#")
                .font(.caption.bold())
                .frame(width: Self.rowNumberWidth, height: Self.headerHeight)
                .background(.bar)
            ForEach(viewModel.characters) { ch in
                HStack(spacing: 6) {
                    Circle()
                        .fill(Color(hex: viewModel.characterColor(for: ch.id)))
                        .frame(width: 8, height: 8)
                    Text(ch.name)
                        .font(.subheadline.bold())
                        .lineLimit(1)
                }
                .frame(width: columnWidth, height: Self.headerHeight, alignment: .leading)
                .padding(.horizontal, 8)
                .background(.bar)
            }
        }
    }

    @ViewBuilder
    private func row(rowIndex: Int, columnWidth: CGFloat) -> some View {
        HStack(spacing: 0) {
            Button {
                insertAtRow = rowIndex
            } label: {
                Text("\(rowIndex)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .frame(width: Self.rowNumberWidth, height: Self.rowHeight)
                    .background(.bar)
            }
            .buttonStyle(.plain)
            ForEach(viewModel.characters) { ch in
                ZStack {
                    Color.clear
                    if let scn = scene(at: rowIndex, characterId: ch.id) {
                        RailsSceneCard(
                            scene: scn,
                            characterColorHex: viewModel.characterColor(for: ch.id),
                            dragState: dragState,
                            viewModel: viewModel,
                            onTitleChange: { viewModel.updateSceneTitle(sceneId: scn.id, title: $0) },
                            onTagsChange: { viewModel.updateSceneTags(sceneId: scn.id, tags: $0) },
                            onNotesChange: { viewModel.updateSceneNotes(sceneId: scn.id, notes: $0) },
                            onTap: { viewModel.selectedSceneForSheet = scn.id },
                            onDropRequested: { target in
                                switch target {
                                case .row(let idx):
                                    if scn.timelinePosition == nil {
                                        viewModel.placeSceneInBraid(sceneId: scn.id, at: idx)
                                    } else {
                                        viewModel.moveBraidedScene(sceneId: scn.id, to: idx)
                                    }
                                case .inbox:
                                    viewModel.unbraidScene(sceneId: scn.id)
                                }
                            }
                        )
                    }
                }
                .frame(width: columnWidth, height: Self.rowHeight)
                .border(Color.gray.opacity(0.12))
            }
        }
        .background(
            GeometryReader { rowGeo in
                Color.clear.preference(
                    key: RailsRowFrameKey.self,
                    value: [rowIndex: rowGeo.frame(in: .global)]
                )
            }
        )
    }

    private func scene(at rowIndex: Int, characterId: String) -> Scene? {
        viewModel.scenes.first { $0.characterId == characterId && $0.timelinePosition == rowIndex }
    }

    // MARK: - Character picker

    @ViewBuilder
    private func characterPicker(for row: Int) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Insert new scene at row \(row) for:")
                .font(.headline)
            ForEach(viewModel.characters) { ch in
                Button {
                    viewModel.insertNewScene(at: row, characterId: ch.id)
                    insertAtRow = nil
                } label: {
                    HStack {
                        Circle()
                            .fill(Color(hex: viewModel.characterColor(for: ch.id)))
                            .frame(width: 10, height: 10)
                        Text(ch.name)
                        Spacer()
                    }
                    .padding(.vertical, 6)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .frame(minWidth: 220)
    }

    // MARK: - Auto-scroll

    private func startAutoScroll(direction: Int, proxy: ScrollViewProxy) {
        guard autoScrollTimer == nil else { return }
        autoScrollTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
            let next = max(1, min(rowCount, scrollTarget + direction))
            guard next != scrollTarget else { return }
            scrollTarget = next
            withAnimation(.linear(duration: 0.1)) {
                proxy.scrollTo(scrollTarget, anchor: .top)
            }
        }
    }

    private func stopAutoScroll() {
        autoScrollTimer?.invalidate()
        autoScrollTimer = nil
    }
}

struct RailsRowFrameKey: PreferenceKey {
    static var defaultValue: [Int: CGRect] = [:]
    static func reduce(value: inout [Int: CGRect], nextValue: () -> [Int: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}

private struct RowIdWrapper: Identifiable { let id: Int }
