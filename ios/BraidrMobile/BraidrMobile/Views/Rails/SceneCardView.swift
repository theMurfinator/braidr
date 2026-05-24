import SwiftUI

struct SceneCardView: View {
    let scene: BraidrScene
    let character: BraidrCharacter
    let isActive: Bool
    let isSelecting: Bool
    let isSelected: Bool
    let onTap: () -> Void
    let onLongPress: () -> Void

    private var accentColor: Color {
        Color(hex: character.color ?? "#888888")
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            HStack(spacing: 0) {
                // Left accent bar
                Rectangle()
                    .fill(accentColor)
                    .frame(width: 3)

                // Content
                VStack(alignment: .leading, spacing: 4) {
                    Text(scene.title.isEmpty ? "Untitled" : scene.title)
                        .font(.custom("Lora-Regular", size: 10.5))
                        .foregroundColor(.primary)
                        .lineLimit(2)
                    if let wc = scene.wordCount, wc > 0 {
                        Text("\(wc.formatted()) words")
                            .font(.system(size: 8))
                            .foregroundColor(Color(.systemGray3))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 8)
                .padding(.vertical, 7)
            }
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(
                        isActive ? accentColor : Color(.systemGray5),
                        lineWidth: isActive ? 1.5 : 0.5
                    )
            )
            .shadow(color: .black.opacity(0.06), radius: 2, x: 0, y: 1)
            .opacity(isSelecting && !isSelected ? 0.55 : 1.0)

            // Selection checkbox
            if isSelecting {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 16))
                    .foregroundColor(isSelected ? accentColor : Color(.systemGray4))
                    .padding(5)
                    .background(Color(.systemBackground).opacity(0.8))
                    .clipShape(Circle())
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { onTap() }
        .onLongPressGesture(minimumDuration: 0.4) { onLongPress() }
    }
}
