import SwiftUI

struct ContentView: View {
    @StateObject private var projectVM = ProjectViewModel()
    @State private var showFilePicker = false

    var body: some View {
        Group {
            if projectVM.db != nil {
                RailsView(projectVM: projectVM)
            } else {
                VStack(spacing: 28) {
                    Text("Braidr")
                        .font(.custom("Lora-SemiBold", size: 28))
                        .foregroundColor(Color(hex: "#5b8fa8"))

                    Button("Open Project") { showFilePicker = true }
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(Color(hex: "#5b8fa8"))

                    if let msg = projectVM.errorMessage {
                        Text(msg)
                            .font(.system(size: 13))
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                }
                .sheet(isPresented: $showFilePicker) {
                    DocumentPicker { url in
                        projectVM.loadFromURL(url)
                        showFilePicker = false
                    }
                }
            }
        }
        .onAppear { projectVM.restoreFromBookmark() }
    }
}
