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
        TabView(selection: $viewModel.selectedTab) {
            Tab("Outline", systemImage: "list.bullet.indent", value: "outline") {
                OutlineTab(viewModel: viewModel)
            }
            Tab("Rails", systemImage: "square.grid.3x3", value: "rails") {
                RailsTab(viewModel: viewModel)
            }
            Tab("Editor", systemImage: "doc.text", value: "editor") {
                EditorTab(viewModel: viewModel)
            }
            Tab("Notes", systemImage: "note.text", value: "notes") {
                NotesTab(viewModel: viewModel)
            }
        }
        .tabViewStyle(.sidebarAdaptable)
    }
}
