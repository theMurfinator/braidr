import Foundation
import SwiftUI

@MainActor
final class ProjectViewModel: ObservableObject {
    @Published var db: BraidrDB?
    @Published var characters: [BraidrCharacter] = []
    @Published var scenes: [BraidrScene] = []
    @Published var plotPoints: [BraidrPlotPoint] = []
    @Published var chapters: [BraidrChapter] = []
    @Published var errorMessage: String?

    private let bookmarkKey = "braidrFileBookmark"

    func loadFromURL(_ url: URL) {
        let accessing = url.startAccessingSecurityScopedResource()
        do {
            let newDB = try BraidrDB(url: url)
            self.db = newDB
            if accessing {
                try? saveBookmark(for: url)
            }
            try reload()
            errorMessage = nil
            if accessing { url.stopAccessingSecurityScopedResource() }
        } catch {
            errorMessage = error.localizedDescription
            if accessing { url.stopAccessingSecurityScopedResource() }
        }
    }

    func reload() throws {
        guard let db else { return }
        characters = try db.fetchCharacters()
        scenes     = try db.fetchScenesInTimeline()
        plotPoints = try db.fetchPlotPoints()
        chapters   = try db.fetchChapters()
    }

    func restoreFromBookmark() {
        guard let data = UserDefaults.standard.data(forKey: bookmarkKey) else { return }
        var isStale = false
        guard let url = try? URL(resolvingBookmarkData: data,
                                  options: [],
                                  relativeTo: nil,
                                  bookmarkDataIsStale: &isStale) else { return }
        loadFromURL(url)
    }

    private func saveBookmark(for url: URL) throws {
        let data = try url.bookmarkData(options: [],
                                         includingResourceValuesForKeys: nil,
                                         relativeTo: nil)
        UserDefaults.standard.set(data, forKey: bookmarkKey)
    }
}
