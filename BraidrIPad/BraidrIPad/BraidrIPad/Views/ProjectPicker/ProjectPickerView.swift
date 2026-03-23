import SwiftUI

struct ProjectPickerView: View {
    @Bindable var viewModel: ProjectViewModel
    @State private var showFilePicker = false

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            Image(systemName: "book.closed.fill")
                .font(.system(size: 64))
                .foregroundStyle(.tint)

            Text("Braidr")
                .font(.largeTitle.bold())

            Text("Open a project folder to get started.\nChoose a folder containing your character outline files.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 40)

            Button {
                showFilePicker = true
            } label: {
                Label("Open Project Folder", systemImage: "folder.badge.plus")
                    .font(.headline)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)

            if viewModel.isLoading {
                ProgressView("Loading project...")
            }

            if let error = viewModel.errorMessage {
                Text(error)
                    .foregroundStyle(.red)
                    .font(.caption)
                    .padding(.horizontal, 40)
            }

            Spacer()
        }
        .fileImporter(
            isPresented: $showFilePicker,
            allowedContentTypes: [.folder],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                guard let url = urls.first else { return }
                Task { await viewModel.loadProject(from: url) }
            case .failure(let error):
                viewModel.errorMessage = error.localizedDescription
            }
        }
        .task {
            await viewModel.tryRestoreBookmark()
        }
    }
}
