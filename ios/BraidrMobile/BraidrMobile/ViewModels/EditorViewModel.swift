import Foundation

@MainActor
final class EditorViewModel: ObservableObject {
    @Published var content: String = ""

    let scene: BraidrScene
    private let db: BraidrDB
    private var saveTask: Task<Void, Never>?

    init(scene: BraidrScene, db: BraidrDB) {
        self.scene = scene
        self.db = db
        Task { await loadContent() }
    }

    private func loadContent() async {
        let text = try? db.fetchDraft(sceneId: scene.id)
        content = text ?? ""
    }

    func onContentChange(_ newValue: String) {
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(for: .milliseconds(800))
            guard !Task.isCancelled else { return }
            try? db.saveDraft(sceneId: scene.id, content: newValue)
        }
    }
}
