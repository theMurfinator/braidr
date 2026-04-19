import SwiftUI

struct RailsGridView: View {
    @Bindable var viewModel: ProjectViewModel

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

    var body: some View {
        GeometryReader { geo in
            let available = geo.size.width - Self.rowNumberWidth
            let fitColumn = available / CGFloat(columnCount)
            let columnWidth = max(Self.minColumn, fitColumn)

            ScrollView([.horizontal, .vertical]) {
                VStack(spacing: 0) {
                    header(columnWidth: columnWidth)
                    ForEach(1...rowCount, id: \.self) { rowIdx in
                        row(rowIndex: rowIdx, columnWidth: columnWidth)
                    }
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
            Text("\(rowIndex)")
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(width: Self.rowNumberWidth, height: Self.rowHeight)
                .background(.bar)
            ForEach(viewModel.characters) { ch in
                ZStack {
                    Color.clear
                    if let scn = scene(at: rowIndex, characterId: ch.id) {
                        RailsSceneCard(
                            scene: scn,
                            characterColorHex: viewModel.characterColor(for: ch.id)
                        )
                    }
                }
                .frame(width: columnWidth, height: Self.rowHeight)
                .border(Color.gray.opacity(0.12))
            }
        }
    }

    private func scene(at rowIndex: Int, characterId: String) -> Scene? {
        viewModel.scenes.first { $0.characterId == characterId && $0.timelinePosition == rowIndex }
    }
}
