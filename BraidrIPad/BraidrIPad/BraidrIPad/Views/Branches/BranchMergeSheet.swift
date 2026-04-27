import SwiftUI

struct BranchMergeSheet: View {
    @Bindable var viewModel: ProjectViewModel
    let branchName: String
    @Environment(\.dismiss) private var dismiss
    @State private var compareData: BranchCompareData?
    @State private var loading = true
    @State private var selectedIds: Set<String> = []

    private var changedIds: Set<String> {
        guard let data = compareData else { return [] }
        return Set(data.scenes.filter(\.changed).map(\.sceneId))
    }

    private var allChangedSelected: Bool {
        !changedIds.isEmpty && changedIds.isSubset(of: selectedIds)
    }

    private var grouped: [(character: String, scenes: [BranchSceneDiff])] {
        guard let data = compareData else { return [] }
        var map: [String: [BranchSceneDiff]] = [:]
        for scene in data.scenes {
            map[scene.characterName, default: []].append(scene)
        }
        return map.sorted { $0.key < $1.key }.map { (character: $0.key, scenes: $0.value) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView("Loading comparison...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let data = compareData {
                    mergeContent(data)
                } else {
                    ContentUnavailableView(
                        "No Data",
                        systemImage: "exclamationmark.triangle",
                        description: Text("Could not load branch comparison.")
                    )
                }
            }
            .navigationTitle("Merge \"\(branchName)\" → main")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Merge \(selectedIds.count)") {
                        Task {
                            await viewModel.mergeBranch(name: branchName, sceneIds: Array(selectedIds))
                            dismiss()
                        }
                    }
                    .disabled(selectedIds.isEmpty)
                }
            }
            .task {
                loading = true
                compareData = await viewModel.compareBranches(left: nil, right: branchName)
                if let data = compareData {
                    selectedIds = Set(data.scenes.filter(\.changed).map(\.sceneId))
                }
                loading = false
            }
        }
    }

    @ViewBuilder
    private func mergeContent(_ data: BranchCompareData) -> some View {
        VStack(spacing: 0) {
            HStack {
                Button(allChangedSelected ? "Deselect Changed" : "Select All Changed") {
                    if allChangedSelected {
                        selectedIds.removeAll()
                    } else {
                        selectedIds = changedIds
                    }
                }
                .font(.subheadline)

                Spacer()

                Text("\(selectedIds.count) scene\(selectedIds.count == 1 ? "" : "s") selected")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding()

            List {
                ForEach(grouped, id: \.character) { group in
                    Section(group.character) {
                        ForEach(group.scenes) { scene in
                            mergeSceneRow(scene)
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
        }
    }

    @ViewBuilder
    private func mergeSceneRow(_ scene: BranchSceneDiff) -> some View {
        let isChanged = scene.changed
        let isSelected = selectedIds.contains(scene.sceneId)
        let posChanged = scene.leftPosition != scene.rightPosition

        Button {
            if isChanged { toggleScene(scene.sceneId) }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(isChanged ? .accentColor : Color.secondary.opacity(0.3))

                Text("#\(scene.sceneNumber)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)

                if isChanged {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(scene.leftTitle)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .strikethrough()
                        Text(scene.rightTitle)
                            .font(.caption)
                    }
                } else {
                    Text(scene.leftTitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 0)

                if posChanged {
                    Text("\(scene.leftPosition.map(String.init) ?? "–") → \(scene.rightPosition.map(String.init) ?? "–")")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .disabled(!isChanged)
    }

    private func toggleScene(_ id: String) {
        if selectedIds.contains(id) {
            selectedIds.remove(id)
        } else {
            selectedIds.insert(id)
        }
    }
}
