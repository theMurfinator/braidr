import SwiftUI

private struct SceneSheetId: Identifiable { let id: String }

struct RailsTab: View {
    @Bindable var viewModel: ProjectViewModel
    @AppStorage("rails.inboxOpen") private var inboxOpen: Bool = false
    @AppStorage("rails.fontFamily") private var fontFamily: String = ".AppleSystemUISerifSemibold"
    @AppStorage("rails.fontSize") private var fontSize: Double = 16
    @State private var dragState = DragState()
    @State private var showFontMenu = false
    @State private var showTagsDummy = true

    var body: some View {
        NavigationStack {
            ZStack {
                HStack(spacing: 0) {
                    if inboxOpen {
                        RailsInboxDrawer(viewModel: viewModel, dragState: dragState)
                            .transition(.move(edge: .leading))
                    }
                    RailsGridView(viewModel: viewModel, dragState: dragState)
                }
                .animation(.default, value: inboxOpen)

                if dragState.sceneId != nil {
                    ghost
                        .position(dragState.ghostPosition)
                        .allowsHitTesting(false)
                }
            }
            .navigationTitle("Rails")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        inboxOpen.toggle()
                    } label: {
                        Image(systemName: inboxOpen ? "tray.full.fill" : "tray.full")
                    }
                    .accessibilityLabel(inboxOpen ? "Close inbox" : "Open inbox")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showFontMenu = true
                    } label: {
                        Image(systemName: "textformat")
                    }
                }
            }
            .sheet(item: Binding(
                get: { viewModel.selectedSceneForSheet.map { SceneSheetId(id: $0) } },
                set: { viewModel.selectedSceneForSheet = $0?.id }
            )) { wrapper in
                SceneDetailSheet(viewModel: viewModel, sceneId: wrapper.id)
            }
            .popover(isPresented: $showFontMenu) {
                FontSettingsPopover(
                    fontFamily: $fontFamily,
                    fontSize: $fontSize,
                    showTags: $showTagsDummy
                )
                .frame(minWidth: 320, minHeight: 320)
            }
        }
    }

    @ViewBuilder
    private var ghost: some View {
        if let scn = dragState.ghostScene {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 4) {
                    Circle()
                        .fill(Color(hex: dragState.ghostCharacterColorHex))
                        .frame(width: 8, height: 8)
                    Text("\(scn.sceneNumber)")
                        .font(.caption2.monospacedDigit().bold())
                        .foregroundStyle(Color(hex: dragState.ghostCharacterColorHex))
                    Spacer(minLength: 0)
                }
                Text(scn.title.strippingInlineTags())
                    .font(.footnote)
                    .foregroundStyle(.primary)
                    .lineLimit(2)
            }
            .padding(10)
            .frame(width: 220)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(hex: dragState.ghostCharacterColorHex).opacity(0.9))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(Color.white.opacity(0.5), lineWidth: 1)
            )
            .foregroundStyle(.white)
            .shadow(radius: 10, y: 4)
            .scaleEffect(1.05)
            .rotationEffect(.degrees(-1.5))
        }
    }
}
