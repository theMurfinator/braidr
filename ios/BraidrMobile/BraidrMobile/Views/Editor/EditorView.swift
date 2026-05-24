import SwiftUI

struct EditorView: View {
    let scene: BraidrScene
    @ObservedObject var projectVM: ProjectViewModel
    @StateObject private var vm: EditorViewModel
    @State private var showInfoSheet = false
    @Environment(\.dismiss) private var dismiss

    init(scene: BraidrScene, projectVM: ProjectViewModel) {
        self.scene = scene
        self.projectVM = projectVM
        _vm = StateObject(wrappedValue: EditorViewModel(scene: scene, db: projectVM.db!))
    }

    private var character: BraidrCharacter? {
        projectVM.characters.first { $0.id == scene.characterId }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Topbar
            HStack(spacing: 12) {
                Button { dismiss() } label: {
                    Text("‹")
                        .font(.system(size: 22, weight: .light))
                        .foregroundColor(Color(hex: "#5b8fa8"))
                }
                VStack(alignment: .leading, spacing: 7) {
                    Text("\(character?.name ?? "Unknown") · Scene \(scene.sceneNumber)")
                        .font(.system(size: 9.5, weight: .semibold))
                        .foregroundColor(Color(.systemGray3))
                        .textCase(.uppercase)
                        .tracking(1)
                    Text(scene.title.isEmpty ? "Untitled" : scene.title)
                        .font(.custom("Lora-SemiBold", size: 19))
                        .foregroundColor(.primary)
                        .lineLimit(2)
                }
                Spacer()
                Button("···") { showInfoSheet = true }
                    .font(.system(size: 17, weight: .light))
                    .foregroundColor(Color(.systemGray3))
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 12)
            .padding(.top, 4)
            .overlay(alignment: .bottom) { Divider() }

            // Prose editor
            TextEditor(text: $vm.content)
                .font(.custom("Lora-Regular", size: 15.5))
                .lineSpacing(8)
                .scrollContentBackground(.hidden)
                .background(Color(.systemBackground))
                .padding(.horizontal, 14)
                .onChange(of: vm.content) { newValue in
                    vm.onContentChange(newValue)
                }
        }
        .navigationBarHidden(true)
        .sheet(isPresented: $showInfoSheet) {
            InfoSheetView(scene: scene, projectVM: projectVM)
                .presentationDetents([.fraction(0.65)])
                .presentationDragIndicator(.visible)
        }
    }
}
