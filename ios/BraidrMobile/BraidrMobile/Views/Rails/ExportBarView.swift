import SwiftUI

struct ExportBarView: View {
    let selectedScenes: [BraidrScene]
    let selectedWordCount: Int
    let db: BraidrDB
    let onCancel: () -> Void

    @State private var showShareSheet = false
    @State private var exportItems: [Any] = []

    var body: some View {
        VStack(spacing: 0) {
            Divider()
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(selectedWordCount.formatted()) words")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(Color(.systemGray3))
                        .textCase(.uppercase)
                    Text("\(selectedScenes.count) scene\(selectedScenes.count == 1 ? "" : "s") ready to export")
                        .font(.custom("Lora-Regular", size: 13))
                }
                Spacer()
                Button {
                    exportItems = [ExportGenerator.plainText(scenes: selectedScenes, db: db)]
                    showShareSheet = true
                } label: {
                    Label("Share", systemImage: "square.and.arrow.up")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .background(Color(hex: "#5b8fa8"))
                        .clipShape(Capsule())
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
            .padding(.bottom, 8)
            .background(Color(.systemBackground))
        }
        .sheet(isPresented: $showShareSheet) {
            ShareSheet(items: exportItems)
        }
    }
}
