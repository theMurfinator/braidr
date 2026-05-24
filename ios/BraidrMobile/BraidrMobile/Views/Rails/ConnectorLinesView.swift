import SwiftUI

struct GridMetrics {
    let rowHeight: CGFloat = 70
    let cellWidth: CGFloat = 84
    let cellGap: CGFloat = 5
    let cardVerticalPadding: CGFloat = 6
    let headerHeight: CGFloat = 32

    func columnX(index: Int) -> CGFloat {
        CGFloat(index) * (cellWidth + cellGap) + cellWidth / 2
    }

    func rowTopY(rowIndex: Int) -> CGFloat {
        headerHeight + CGFloat(rowIndex) * rowHeight + cardVerticalPadding
    }

    func rowBottomY(rowIndex: Int) -> CGFloat {
        headerHeight + CGFloat(rowIndex) * rowHeight + rowHeight - cardVerticalPadding
    }
}

struct RailsRow: Identifiable {
    let id: Int                       // timeline_position
    var cells: [String: BraidrScene]  // characterId -> scene
}

struct ConnectorLinesView: View {
    let rows: [RailsRow]
    let characters: [BraidrCharacter]
    let metrics: GridMetrics

    var body: some View {
        Canvas { context, _ in
            for (colIndex, character) in characters.enumerated() {
                let x = metrics.columnX(index: colIndex)
                guard let color = character.color else { continue }
                let lineColor = Color(hex: color).opacity(0.4)

                let rowIndices = rows.indices.filter { rows[$0].cells[character.id] != nil }

                for i in 0..<(rowIndices.count - 1) {
                    let fromIdx = rowIndices[i]
                    let toIdx   = rowIndices[i + 1]
                    let y1 = metrics.rowBottomY(rowIndex: fromIdx)
                    let y2 = metrics.rowTopY(rowIndex: toIdx)

                    var path = Path()
                    path.move(to: CGPoint(x: x, y: y1))
                    path.addLine(to: CGPoint(x: x, y: y2))
                    context.stroke(path, with: .color(lineColor), lineWidth: 1)

                    // Gap word count: sum words of scenes from OTHER characters in the gap rows
                    let gapWords = (fromIdx + 1..<toIdx)
                        .compactMap { rowIdx -> Int? in
                            rows[rowIdx].cells.values
                                .filter { $0.characterId != character.id }
                                .compactMap(\.wordCount)
                                .reduce(0, +)
                        }
                        .reduce(0, +)

                    if gapWords > 0 {
                        let label = gapWords >= 1000
                            ? String(format: "%.1fk", Double(gapWords) / 1000)
                            : "\(gapWords)"
                        let midY = (y1 + y2) / 2
                        context.draw(
                            Text(label)
                                .font(.system(size: 7.5))
                                .foregroundColor(Color(hex: color).opacity(0.55)),
                            at: CGPoint(x: x + 5, y: midY),
                            anchor: .leading
                        )
                    }
                }
            }
        }
        .allowsHitTesting(false)
    }
}
