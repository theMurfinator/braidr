import SwiftUI

struct RailsInboxCard: View {
    let scene: Scene
    let characterName: String
    let characterColorHex: String

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(Color(hex: characterColorHex))
                .frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(characterName) · \(scene.sceneNumber)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(scene.title.strippingInlineTags())
                    .font(.footnote)
                    .lineLimit(2)
            }
            Spacer()
            Image(systemName: "line.3.horizontal")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(Color(hex: characterColorHex).opacity(0.05))
        )
    }
}
