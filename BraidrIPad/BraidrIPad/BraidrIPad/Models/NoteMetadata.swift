import Foundation

struct NoteMetadata: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    var fileName: String
    var parentId: String?
    var order: Int
    var createdAt: Double
    var modifiedAt: Double
    var outgoingLinks: [String]
    var sceneLinks: [String]
    var tags: [String]?
    var folderPath: String? // deprecated, kept for migration
}

struct ArchivedNote: Codable, Identifiable {
    var id: String
    var title: String
    var content: String
    var parentId: String?
    var tags: [String]
    var outgoingLinks: [String]
    var sceneLinks: [String]
    var archivedAt: Double
    var originalMetadata: OriginalNoteMetadata
}

struct OriginalNoteMetadata: Codable, Hashable {
    var order: Int
    var createdAt: Double
    var modifiedAt: Double
}

struct NotesIndex: Codable {
    var notes: [NoteMetadata]
    var archivedNotes: [ArchivedNote]?
    var version: Int?
}
