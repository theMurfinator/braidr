import SwiftUI

struct InfoSheetView: View {
    let scene: BraidrScene
    @ObservedObject var projectVM: ProjectViewModel
    @State private var showCharacterPicker = false
    @State private var showPlotPointPicker = false
    @State private var showChapterPicker = false

    private var character: BraidrCharacter? {
        projectVM.characters.first { $0.id == scene.characterId }
    }
    private var plotPoint: BraidrPlotPoint? {
        projectVM.plotPoints.first { $0.id == scene.plotPointId }
    }
    private var chapter: BraidrChapter? {
        projectVM.chapters.first { $0.id == scene.chapterId }
    }
    private var plotPointsForCharacter: [BraidrPlotPoint] {
        projectVM.plotPoints.filter { $0.characterId == scene.characterId }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 16)
            infoRow("Character", value: character?.name ?? "—", tappable: true) {
                showCharacterPicker = true
            }
            Divider()
            infoRow("Plot point", value: plotPoint?.title ?? "—", tappable: true) {
                showPlotPointPicker = true
            }
            Divider()
            infoRow("Chapter", value: chapter?.title ?? "—", tappable: true) {
                showChapterPicker = true
            }
            Divider()
            infoRow("Words",
                    value: scene.wordCount.map { $0.formatted() } ?? "—",
                    tappable: false, action: nil)
            Divider()
        }
        .sheet(isPresented: $showCharacterPicker) {
            pickerSheet("Character", items: projectVM.characters, label: \.name) { selected in
                try? projectVM.db?.updateScene(id: scene.id, characterId: selected.id)
                try? projectVM.reload()
                showCharacterPicker = false
            }
        }
        .sheet(isPresented: $showPlotPointPicker) {
            pickerSheet("Plot point", items: plotPointsForCharacter, label: \.title) { selected in
                try? projectVM.db?.updateScene(id: scene.id, plotPointId: selected.id)
                try? projectVM.reload()
                showPlotPointPicker = false
            }
        }
        .sheet(isPresented: $showChapterPicker) {
            pickerSheet("Chapter", items: projectVM.chapters, label: \.title) { selected in
                try? projectVM.db?.updateScene(id: scene.id, chapterId: selected.id)
                try? projectVM.reload()
                showChapterPicker = false
            }
        }
    }

    @ViewBuilder
    private func infoRow(_ label: String, value: String,
                          tappable: Bool, action: (() -> Void)?) -> some View {
        Button(action: action ?? {}) {
            HStack {
                Text(label)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(Color(.systemGray3))
                    .textCase(.uppercase)
                    .tracking(1)
                    .frame(width: 90, alignment: .leading)
                Text(value)
                    .font(.custom("Lora-Regular", size: 14))
                    .foregroundColor(tappable ? Color(hex: "#5b8fa8") : Color(.systemGray2))
                Spacer()
                if tappable {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12))
                        .foregroundColor(Color(.systemGray4))
                }
            }
            .padding(.horizontal, 22)
            .padding(.vertical, 13)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!tappable)
    }

    @ViewBuilder
    private func pickerSheet<T: Identifiable>(
        _ title: String,
        items: [T],
        label: KeyPath<T, String>,
        onSelect: @escaping (T) -> Void
    ) -> some View {
        NavigationStack {
            List(items) { item in
                Button(item[keyPath: label]) {
                    onSelect(item)
                }
                .foregroundColor(.primary)
                .font(.custom("Lora-Regular", size: 15))
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.fraction(0.45)])
    }
}
