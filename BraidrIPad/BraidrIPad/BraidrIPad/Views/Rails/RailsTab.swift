import SwiftUI

struct RailsTab: View {
    @Bindable var viewModel: ProjectViewModel

    var body: some View {
        NavigationStack {
            RailsGridView(viewModel: viewModel)
                .navigationTitle("Rails")
        }
    }
}
