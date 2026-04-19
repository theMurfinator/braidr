import SwiftUI

struct RailsSceneCard: View {
    let scene: Scene
    let characterColorHex: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "line.3.horizontal")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                Text("\(scene.sceneNumber)")
                    .font(.caption2.monospacedDigit().bold())
                    .foregroundStyle(Color(hex: characterColorHex))
                Spacer()
            }
            Text(scene.title)
                .font(scene.isHighlighted ? .body.bold() : .body)
                .lineLimit(3)
            if !scene.tags.isEmpty {
                Text(scene.tags.prefix(3).map { "#\($0)" }.joined(separator: " "))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            if !scene.notes.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(scene.notes.prefix(2), id: \.self) { note in
                        Text("• \(note)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    if scene.notes.count > 2 {
                        Text("+ \(scene.notes.count - 2) more")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color(hex: characterColorHex).opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(hex: characterColorHex).opacity(0.35), lineWidth: 1)
        )
        .padding(4)
    }
}
