import SwiftUI

struct RailsInboxDrawer: View {
    @Bindable var viewModel: ProjectViewModel
    @Bindable var dragState: DragState
    @State private var filter: String = "all"

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Inbox")
                .font(.headline)
                .padding(.horizontal, 12)
                .padding(.top, 12)
            filterBar
            ScrollView {
                LazyVStack(spacing: 6) {
                    ForEach(viewModel.inboxScenes(filter: filter)) { scene in
                        RailsInboxCard(
                            scene: scene,
                            characterName: viewModel.characterName(for: scene.characterId),
                            characterColorHex: viewModel.characterColor(for: scene.characterId),
                            dragState: dragState,
                            onDropRequested: { target in
                                if case .row(let idx) = target {
                                    viewModel.placeSceneInBraid(sceneId: scene.id, at: idx)
                                }
                                // Inbox -> inbox is a no-op.
                            }
                        )
                    }
                }
                .padding(.horizontal, 8)
            }
        }
        .frame(width: 260)
        .background(.regularMaterial)
        .overlay(
            RoundedRectangle(cornerRadius: 0)
                .stroke(
                    dragState.sceneId != nil && dragState.dropTarget == .inbox
                        ? Color.accentColor
                        : Color.clear,
                    lineWidth: 3
                )
        )
        .background(
            GeometryReader { geo in
                Color.clear
                    .onAppear { dragState.inboxFrame = geo.frame(in: .global) }
                    .onChange(of: geo.frame(in: .global)) { _, new in
                        dragState.inboxFrame = new
                    }
            }
        )
    }

    @ViewBuilder
    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                pill(label: "All", value: "all")
                ForEach(viewModel.characters) { ch in
                    pill(label: ch.name, value: ch.id)
                }
            }
            .padding(.horizontal, 12)
        }
    }

    private func pill(label: String, value: String) -> some View {
        let selected = filter == value
        return Button {
            filter = value
        } label: {
            Text(label)
                .font(.caption.weight(selected ? .semibold : .regular))
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(
                    Capsule().fill(selected ? Color.accentColor.opacity(0.2) : Color.clear)
                )
                .overlay(Capsule().stroke(Color.secondary.opacity(0.3)))
        }
        .buttonStyle(.plain)
    }
}
