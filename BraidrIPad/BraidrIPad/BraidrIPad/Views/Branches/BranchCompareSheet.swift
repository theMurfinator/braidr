import SwiftUI

struct BranchCompareSheet: View {
    @Bindable var viewModel: ProjectViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var left: String = "__main__"
    @State private var right: String = "__main__"
    @State private var compareData: BranchCompareData?
    @State private var loading = false
    @State private var showMergeSheet = false

    private static let mainValue = "__main__"

    private var branchNames: [String] {
        viewModel.branchIndex.branches.map(\.name)
    }

    private var sameSelected: Bool { left == right }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                branchPickers
                    .padding()

                if sameSelected {
                    ContentUnavailableView(
                        "Select Two Branches",
                        systemImage: "arrow.left.arrow.right",
                        description: Text("Pick different branches to compare.")
                    )
                } else if loading {
                    ProgressView("Comparing...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let data = compareData {
                    comparisonContent(data)
                }

                Spacer(minLength: 0)
            }
            .navigationTitle("Compare Branches")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                if !sameSelected, right != Self.mainValue {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Merge") { showMergeSheet = true }
                    }
                }
            }
            .sheet(isPresented: $showMergeSheet) {
                let branchName = right == Self.mainValue ? left : right
                if branchName != Self.mainValue {
                    BranchMergeSheet(viewModel: viewModel, branchName: branchName)
                }
            }
            .task(id: "\(left)|\(right)") {
                await loadComparison()
            }
            .onAppear {
                if let first = branchNames.first {
                    right = first
                }
            }
        }
    }

    private var branchPickers: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Left")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Picker("Left", selection: $left) {
                    Text("main").tag(Self.mainValue)
                    ForEach(branchNames, id: \.self) { name in
                        Text(name).tag(name)
                    }
                }
                .pickerStyle(.menu)
            }

            Image(systemName: "arrow.left.arrow.right")
                .foregroundStyle(.secondary)
                .padding(.top, 16)

            VStack(alignment: .leading, spacing: 4) {
                Text("Right")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Picker("Right", selection: $right) {
                    Text("main").tag(Self.mainValue)
                    ForEach(branchNames, id: \.self) { name in
                        Text(name).tag(name)
                    }
                }
                .pickerStyle(.menu)
            }
        }
    }

    @ViewBuilder
    private func comparisonContent(_ data: BranchCompareData) -> some View {
        let changedCount = data.scenes.filter(\.changed).count

        Text("\(changedCount) of \(data.scenes.count) scene\(data.scenes.count == 1 ? "" : "s") differ")
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .padding(.horizontal)

        HStack(spacing: 0) {
            Text(data.leftName.isEmpty ? "main" : data.leftName)
                .font(.caption.bold())
                .frame(maxWidth: .infinity)
            Text(data.rightName.isEmpty ? "main" : data.rightName)
                .font(.caption.bold())
                .frame(maxWidth: .infinity)
        }
        .padding(.horizontal)
        .padding(.top, 8)

        ScrollView {
            HStack(alignment: .top, spacing: 1) {
                VStack(spacing: 4) {
                    ForEach(leftScenes(data)) { scene in
                        CompareSceneCard(scene: scene)
                    }
                }
                .frame(maxWidth: .infinity)

                VStack(spacing: 4) {
                    ForEach(rightScenes(data)) { scene in
                        CompareSceneCard(scene: scene)
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .padding(.horizontal)
            .padding(.top, 4)
        }
    }

    private func leftScenes(_ data: BranchCompareData) -> [CompareSceneItem] {
        buildColumn(data.scenes, side: .left)
    }

    private func rightScenes(_ data: BranchCompareData) -> [CompareSceneItem] {
        buildColumn(data.scenes, side: .right)
    }

    private enum Side { case left, right }

    private func buildColumn(_ scenes: [BranchSceneDiff], side: Side) -> [CompareSceneItem] {
        scenes
            .filter { (side == .left ? $0.leftPosition : $0.rightPosition) != nil }
            .sorted { (side == .left ? $0.leftPosition ?? 0 : $0.rightPosition ?? 0) < (side == .left ? $1.leftPosition ?? 0 : $1.rightPosition ?? 0) }
            .map { s in
                CompareSceneItem(
                    id: "\(s.sceneId)-\(side)",
                    characterName: s.characterName,
                    title: side == .left ? s.leftTitle : s.rightTitle,
                    position: (side == .left ? s.leftPosition : s.rightPosition) ?? 0,
                    colorHex: viewModel.characterColor(for: s.characterId),
                    changed: s.changed
                )
            }
    }

    private func loadComparison() async {
        guard !sameSelected else {
            compareData = nil
            return
        }
        loading = true
        compareData = nil
        let l: String? = left == Self.mainValue ? nil : left
        let r: String? = right == Self.mainValue ? nil : right
        compareData = await viewModel.compareBranches(left: l, right: r)
        loading = false
    }
}

// MARK: - Compare scene card

struct CompareSceneItem: Identifiable {
    let id: String
    let characterName: String
    let title: String
    let position: Int
    let colorHex: String
    let changed: Bool
}

private struct CompareSceneCard: View {
    let scene: CompareSceneItem

    var body: some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color(hex: scene.colorHex))
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 2) {
                Text(scene.characterName)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(scene.title)
                    .font(.caption)
                    .lineLimit(2)
            }

            Spacer(minLength: 0)

            Text("#\(scene.position)")
                .font(.caption2.monospacedDigit())
                .foregroundStyle(.tertiary)
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(scene.changed ? Color.orange.opacity(0.08) : Color(.secondarySystemGroupedBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(scene.changed ? Color.orange.opacity(0.3) : Color.clear, lineWidth: 1)
        )
    }
}
