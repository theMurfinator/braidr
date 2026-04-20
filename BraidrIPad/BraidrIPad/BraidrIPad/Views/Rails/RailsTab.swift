import SwiftUI

private struct SceneSheetId: Identifiable { let id: String }

struct RailsTab: View {
    @Bindable var viewModel: ProjectViewModel
    @AppStorage("rails.inboxOpen") private var inboxOpen: Bool = false
    @State private var dragState = DragState()

    var body: some View {
        NavigationStack {
            ZStack {
                HStack(spacing: 0) {
                    if inboxOpen {
                        RailsInboxDrawer(viewModel: viewModel, dragState: dragState)
                            .transition(.move(edge: .leading))
                    }
                    RailsGridView(viewModel: viewModel, dragState: dragState)
                }
                .animation(.default, value: inboxOpen)

                if dragState.sceneId != nil {
                    ghost
                        .position(dragState.ghostPosition)
                        .allowsHitTesting(false)
                }
            }
            .navigationTitle("Rails")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        inboxOpen.toggle()
                    } label: {
                        Image(systemName: inboxOpen ? "tray.full.fill" : "tray.full")
                    }
                    .accessibilityLabel(inboxOpen ? "Close inbox" : "Open inbox")
                }
            }
            .sheet(item: Binding(
                get: { viewModel.selectedSceneForSheet.map { SceneSheetId(id: $0) } },
                set: { viewModel.selectedSceneForSheet = $0?.id }
            )) { wrapper in
                SceneDetailSheet(viewModel: viewModel, sceneId: wrapper.id)
            }
        }
    }

    private var ghost: some View {
        Text(dragState.sceneTitle.prefix(30))
            .font(.footnote.bold())
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule().fill(Color.accentColor)
            )
            .shadow(radius: 6)
    }
}
