import SwiftUI

struct ConnectionBadge: View {
    @Bindable var viewModel: ProjectViewModel
    let sceneId: String
    @State private var showPopover = false

    private var count: Int { viewModel.connectionCount(for: sceneId) }

    var body: some View {
        if count > 0 {
            Button {
                showPopover = true
            } label: {
                HStack(spacing: 3) {
                    Image(systemName: "link")
                        .font(.caption2)
                    Text("\(count)")
                        .font(.caption2.monospacedDigit())
                }
                .padding(.horizontal, 5)
                .padding(.vertical, 2)
                .background(Capsule().fill(Color.accentColor.opacity(0.15)))
                .foregroundStyle(.tint)
            }
            .buttonStyle(.plain)
            .popover(isPresented: $showPopover) {
                connectionList
                    .frame(minWidth: 240)
                    .padding(12)
            }
        }
    }

    @ViewBuilder
    private var connectionList: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Connections")
                .font(.headline)
            ForEach(viewModel.connections(for: sceneId)) { scn in
                Button {
                    viewModel.selectedSceneForSheet = scn.id
                    showPopover = false
                } label: {
                    HStack {
                        Circle()
                            .fill(Color(hex: viewModel.characterColor(for: scn.characterId)))
                            .frame(width: 8, height: 8)
                        Text("\(viewModel.characterName(for: scn.characterId)) · \(scn.sceneNumber)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(scn.title.strippingInlineTags())
                            .font(.footnote)
                            .lineLimit(1)
                        Spacer()
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }
}
