import SwiftUI

struct NotesTab: View {
    @Bindable var viewModel: ProjectViewModel
    @State private var noteContent: String = ""
    @State private var isLoadingNote = false

    private let fileService = FileProjectService()

    var body: some View {
        NavigationSplitView {
            List(selection: $viewModel.selectedNoteId) {
                let roots = viewModel.rootNotes()
                ForEach(roots) { note in
                    NoteTreeRow(note: note, viewModel: viewModel)
                }
            }
            .navigationTitle("Notes")
            .listStyle(.sidebar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    BranchMenu(viewModel: viewModel)
                }
            }
        } detail: {
            if let noteId = viewModel.selectedNoteId,
               let note = viewModel.notes.first(where: { $0.id == noteId }) {
                VStack(spacing: 0) {
                    // Tag bar
                    if let tags = note.tags, !tags.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(tags, id: \.self) { tag in
                                    Text(tag)
                                        .font(.caption2)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 3)
                                        .background(Capsule().fill(.tint.opacity(0.15)))
                                }
                            }
                            .padding(.horizontal)
                            .padding(.vertical, 6)
                        }
                    }

                    if isLoadingNote {
                        ProgressView()
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        TipTapEditorView(
                            initialContent: noteContent,
                            onContentChanged: { html in
                                noteContent = html
                                saveNoteInBackground(fileName: note.fileName, content: html)
                            }
                        )
                        .id(noteId)
                        .ignoresSafeArea(edges: .bottom)
                    }
                }
                .navigationTitle(note.title)
                .task(id: noteId) {
                    await loadNote(fileName: note.fileName)
                }
            } else {
                ContentUnavailableView(
                    "Select a Note",
                    systemImage: "note.text",
                    description: Text("Choose a note from the sidebar to view or edit.")
                )
            }
        }
    }

    private func loadNote(fileName: String) async {
        guard let url = viewModel.project?.projectURL else { return }
        isLoadingNote = true
        do {
            noteContent = try await fileService.readNote(projectURL: url, fileName: fileName)
        } catch {
            noteContent = ""
        }
        isLoadingNote = false
    }

    private func saveNoteInBackground(fileName: String, content: String) {
        guard let url = viewModel.project?.projectURL else { return }
        Task {
            try? await fileService.saveNote(projectURL: url, fileName: fileName, content: content)
        }
    }
}

// MARK: - Note tree row (recursive)

private struct NoteTreeRow: View {
    let note: NoteMetadata
    @Bindable var viewModel: ProjectViewModel

    var body: some View {
        let children = viewModel.childNotes(of: note.id)
        if children.isEmpty {
            NavigationLink(value: note.id) {
                Label(note.title, systemImage: "doc.text")
            }
        } else {
            DisclosureGroup {
                ForEach(children) { child in
                    NoteTreeRow(note: child, viewModel: viewModel)
                }
            } label: {
                NavigationLink(value: note.id) {
                    Label(note.title, systemImage: "folder")
                }
            }
        }
    }
}
