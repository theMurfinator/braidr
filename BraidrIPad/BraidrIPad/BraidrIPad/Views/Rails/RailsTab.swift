import SwiftUI

struct RailsTab: View {
    @Bindable var viewModel: ProjectViewModel
    @AppStorage("rails.inboxOpen") private var inboxOpen: Bool = false

    var body: some View {
        NavigationStack {
            HStack(spacing: 0) {
                if inboxOpen {
                    RailsInboxDrawer(viewModel: viewModel)
                        .transition(.move(edge: .leading))
                }
                RailsGridView(viewModel: viewModel)
            }
            .animation(.default, value: inboxOpen)
            .navigationTitle("Rails")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        inboxOpen.toggle()
                    } label: {
                        Image(systemName: inboxOpen ? "tray.full.fill" : "tray.full")
                    }
                }
            }
        }
    }
}
