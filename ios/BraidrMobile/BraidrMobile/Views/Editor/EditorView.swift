import SwiftUI

struct EditorView: View {
    let scene: BraidrScene
    @ObservedObject var projectVM: ProjectViewModel

    var body: some View {
        Text("Editor -- \(scene.title)")
            .navigationBarHidden(true)
    }
}
