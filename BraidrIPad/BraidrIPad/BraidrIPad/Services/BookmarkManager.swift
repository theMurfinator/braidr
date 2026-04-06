import Foundation

enum BookmarkManager {

    private static let bookmarkKey = "projectFolderBookmark"

    /// Save a security-scoped bookmark for a URL (folder picked by the user)
    static func saveBookmark(for url: URL) throws {
        let data = try url.bookmarkData(
            options: .minimalBookmark,
            includingResourceValuesForKeys: nil,
            relativeTo: nil
        )
        UserDefaults.standard.set(data, forKey: bookmarkKey)
    }

    /// Restore the previously bookmarked URL.
    /// Returns nil if no bookmark is stored.
    /// The caller must call `url.stopAccessingSecurityScopedResource()` when done.
    static func restoreBookmark() -> URL? {
        guard let data = UserDefaults.standard.data(forKey: bookmarkKey) else { return nil }
        var isStale = false
        guard let url = try? URL(
            resolvingBookmarkData: data,
            bookmarkDataIsStale: &isStale
        ) else { return nil }

        if isStale {
            // Re-save the bookmark
            try? saveBookmark(for: url)
        }

        _ = url.startAccessingSecurityScopedResource()
        return url
    }

    /// Remove the saved bookmark
    static func clearBookmark() {
        UserDefaults.standard.removeObject(forKey: bookmarkKey)
    }
}
