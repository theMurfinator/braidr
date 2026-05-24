import XCTest
@testable import BraidrMobile

final class ConnectorLinesTests: XCTestCase {
    func test_gridMetrics_columnX_correctForIndex() {
        let m = GridMetrics()
        XCTAssertEqual(m.columnX(index: 0), m.cellWidth / 2)
        XCTAssertEqual(m.columnX(index: 1), m.cellWidth + m.cellGap + m.cellWidth / 2)
    }

    func test_gridMetrics_rowBottomY_greaterThanRowTopY() {
        let m = GridMetrics()
        XCTAssertGreaterThan(m.rowBottomY(rowIndex: 0), m.rowTopY(rowIndex: 0))
    }

    func test_gridMetrics_rowTopY_row1_greaterThan_row0() {
        let m = GridMetrics()
        XCTAssertGreaterThan(m.rowTopY(rowIndex: 1), m.rowBottomY(rowIndex: 0))
    }
}
