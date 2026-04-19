import SwiftUI

struct TimelineTab: View {
    @Bindable var viewModel: ProjectViewModel

    var body: some View {
        NavigationStack {
            let braided = viewModel.braidedScenes
            if braided.isEmpty {
                ContentUnavailableView(
                    "No Braided Scenes",
                    systemImage: "timeline.selection",
                    description: Text("Scenes need timeline positions to appear here. Edit timeline.json or use the desktop app to braid scenes.")
                )
                .navigationTitle("Timeline")
            } else {
                List {
                    ForEach(braided) { scene in
                        HStack(spacing: 12) {
                            Circle()
                                .fill(Color(hex: viewModel.characterColor(for: scene.characterId)))
                                .frame(width: 10, height: 10)

                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(viewModel.characterName(for: scene.characterId)) — Scene \(scene.sceneNumber)")
                                    .font(.subheadline.bold())
                                Text(scene.title)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }

                            Spacer()

                            if let pos = scene.timelinePosition {
                                Text("#\(pos)")
                                    .font(.caption2.monospacedDigit())
                                    .foregroundStyle(.tertiary)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                    .onMove { from, to in
                        viewModel.moveBraidedScene(from: from, to: to)
                    }
                }
                .navigationTitle("Timeline")
                .listStyle(.plain)
                .toolbar {
                    EditButton()
                }
            }
        }
    }
}
