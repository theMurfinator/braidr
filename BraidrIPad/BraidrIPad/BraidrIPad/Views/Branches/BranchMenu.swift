import SwiftUI

struct BranchMenu: View {
    @Bindable var viewModel: ProjectViewModel
    @State private var showCreateSheet = false
    @State private var showCompareSheet = false
    @State private var showMergeSheet = false
    @State private var confirmDeleteName: String?

    var body: some View {
        Menu {
            Section {
                Button {
                    Task { await viewModel.switchBranch(name: nil) }
                } label: {
                    if viewModel.activeBranch == nil {
                        Label("main", systemImage: "checkmark")
                    } else {
                        Text("main")
                    }
                }

                ForEach(viewModel.branchIndex.branches, id: \.name) { branch in
                    Button {
                        Task { await viewModel.switchBranch(name: branch.name) }
                    } label: {
                        if viewModel.activeBranch == branch.name {
                            Label(branch.name, systemImage: "checkmark")
                        } else {
                            Text(branch.name)
                        }
                    }
                }
            }

            Section {
                Button {
                    showCreateSheet = true
                } label: {
                    Label("New Branch", systemImage: "plus")
                }

                if !viewModel.branchIndex.branches.isEmpty {
                    Button {
                        showCompareSheet = true
                    } label: {
                        Label("Compare", systemImage: "arrow.left.arrow.right")
                    }
                }

                if let active = viewModel.activeBranch {
                    Button {
                        showMergeSheet = true
                    } label: {
                        Label("Merge to Main", systemImage: "arrow.triangle.merge")
                    }

                    Button(role: .destructive) {
                        confirmDeleteName = active
                    } label: {
                        Label("Delete \"\(active)\"", systemImage: "trash")
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "arrow.triangle.branch")
                Text(viewModel.activeBranch ?? "main")
                    .font(.caption)
            }
        }
        .sheet(isPresented: $showCreateSheet) {
            CreateBranchSheet(viewModel: viewModel)
        }
        .sheet(isPresented: $showCompareSheet) {
            BranchCompareSheet(viewModel: viewModel)
        }
        .sheet(isPresented: $showMergeSheet) {
            if let name = viewModel.activeBranch {
                BranchMergeSheet(viewModel: viewModel, branchName: name)
            }
        }
        .alert("Delete Branch", isPresented: Binding(
            get: { confirmDeleteName != nil },
            set: { if !$0 { confirmDeleteName = nil } }
        )) {
            Button("Cancel", role: .cancel) { confirmDeleteName = nil }
            Button("Delete", role: .destructive) {
                if let name = confirmDeleteName {
                    Task { await viewModel.deleteBranch(name: name) }
                }
                confirmDeleteName = nil
            }
        } message: {
            if let name = confirmDeleteName {
                Text("Delete \"\(name)\"? This cannot be undone.")
            }
        }
    }
}
