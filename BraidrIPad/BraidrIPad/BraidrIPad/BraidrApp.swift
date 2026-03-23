import SwiftUI

@main
struct BraidrApp: App {
    @State private var viewModel = ProjectViewModel()

    var body: some SwiftUI.Scene {
        WindowGroup {
            if viewModel.project != nil {
                MainTabView(viewModel: viewModel)
            } else {
                ProjectPickerView(viewModel: viewModel)
            }
        }
    }
}

struct MainTabView: View {
    @Bindable var viewModel: ProjectViewModel

    var body: some View {
        TabView {
            Tab("Outline", systemImage: "list.bullet.indent") {
                OutlineTab(viewModel: viewModel)
            }
            Tab("Timeline", systemImage: "timeline.selection") {
                TimelineTab(viewModel: viewModel)
            }
            Tab("Editor", systemImage: "doc.text") {
                EditorTab(viewModel: viewModel)
            }
            Tab("Notes", systemImage: "note.text") {
                NotesTab(viewModel: viewModel)
            }
        }
        .tabViewStyle(.sidebarAdaptable)
    }
}
