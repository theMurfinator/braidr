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

// MARK: - Color hex extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r, g, b, a: Double
        switch hex.count {
        case 3: // RGB (12-bit)
            (r, g, b, a) = (
                Double((int >> 8) * 17) / 255,
                Double((int >> 4 & 0xF) * 17) / 255,
                Double((int & 0xF) * 17) / 255,
                1
            )
        case 6: // RGB (24-bit)
            (r, g, b, a) = (
                Double(int >> 16) / 255,
                Double(int >> 8 & 0xFF) / 255,
                Double(int & 0xFF) / 255,
                1
            )
        case 8: // ARGB (32-bit)
            (r, g, b, a) = (
                Double(int >> 16 & 0xFF) / 255,
                Double(int >> 8 & 0xFF) / 255,
                Double(int & 0xFF) / 255,
                Double(int >> 24) / 255
            )
        default:
            (r, g, b, a) = (0.5, 0.5, 0.5, 1)
        }
        self.init(.sRGB, red: r, green: g, blue: b, opacity: a)
    }
}
