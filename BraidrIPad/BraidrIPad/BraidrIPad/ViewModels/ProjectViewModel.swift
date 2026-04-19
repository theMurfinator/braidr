import Foundation
import Observation
import SwiftUI

@Observable
final class ProjectViewModel {

    // MARK: - State

    var project: Project?
    var isLoading = false
    var errorMessage: String?

    var selectedCharacterId: String?
    var selectedSceneId: String?
    var selectedNoteId: String?

    /// Current draft content keyed by scene ID
    var draftContents: [String: String] = [:]

    // MARK: - Services

    private let fileService = FileProjectService()
    private var autoSaveTimer: Timer?
    private var pendingSaves: Set<String> = [] // scene IDs with unsaved drafts

    // MARK: - Load

    func loadProject(from url: URL) async {
        isLoading = true
        errorMessage = nil

        // iOS fileImporter URLs need explicit security-scoped access before
        // any use outside the picker callback — including bookmark creation
        // and actor-boundary hops. Hold scope for the whole load.
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }

        do {
            try BookmarkManager.saveBookmark(for: url)
            let loaded = try await fileService.loadProject(from: url)
            project = loaded
            // Pre-load draft content from timeline draftContent
            draftContents = loaded.timelineData.draftContent ?? [:]
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func tryRestoreBookmark() async {
        guard let url = BookmarkManager.restoreBookmark() else { return }
        await loadProject(from: url)
    }

    // MARK: - Scene queries

    var characters: [Character] { project?.characters ?? [] }
    var scenes: [Scene] { project?.scenes ?? [] }
    var plotPoints: [PlotPoint] { project?.plotPoints ?? [] }
    var tags: [Tag] { project?.tags ?? [] }

    func scenes(for characterId: String) -> [Scene] {
        project?.scenes(for: characterId) ?? []
    }

    func plotPoints(for characterId: String) -> [PlotPoint] {
        project?.plotPoints(for: characterId) ?? []
    }

    var braidedScenes: [Scene] {
        project?.sortedBraidedScenes ?? []
    }

    func characterName(for id: String) -> String {
        project?.character(for: id)?.name ?? "Unknown"
    }

    func characterColor(for id: String) -> String {
        project?.color(for: id) ?? "#888888"
    }

    // MARK: - Drafts

    func draftContent(for sceneId: String) -> String {
        draftContents[sceneId] ?? ""
    }

    func updateDraft(for sceneId: String, content: String) {
        draftContents[sceneId] = content
        pendingSaves.insert(sceneId)
        scheduleAutoSave()
    }

    // MARK: - Notes

    var notes: [NoteMetadata] {
        project?.notesIndex?.notes ?? []
    }

    func rootNotes() -> [NoteMetadata] {
        notes.filter { $0.parentId == nil }.sorted { $0.order < $1.order }
    }

    func childNotes(of parentId: String) -> [NoteMetadata] {
        notes.filter { $0.parentId == parentId }.sorted { $0.order < $1.order }
    }

    // MARK: - Timeline reorder

    func moveBraidedScene(from source: IndexSet, to destination: Int) {
        guard var proj = project else { return }
        var braided = proj.sortedBraidedScenes
        braided.move(fromOffsets: source, toOffset: destination)

        // Reassign positions 1...N
        for (i, scene) in braided.enumerated() {
            let newPos = i + 1
            proj.timelineData.positions[scene.id] = newPos
            if let idx = proj.scenes.firstIndex(where: { $0.id == scene.id }) {
                proj.scenes[idx].timelinePosition = newPos
            }
        }
        project = proj
        saveTimelineInBackground()
    }

    // MARK: - Persistence

    private func scheduleAutoSave() {
        autoSaveTimer?.invalidate()
        autoSaveTimer = Timer.scheduledTimer(withTimeInterval: 0.8, repeats: false) { [weak self] _ in
            guard let self else { return }
            Task { await self.flushDrafts() }
        }
    }

    private func flushDrafts() async {
        guard let url = project?.projectURL else { return }
        let toSave = pendingSaves
        pendingSaves.removeAll()
        for sceneId in toSave {
            if let content = draftContents[sceneId] {
                try? await fileService.saveDraft(projectURL: url, sceneId: sceneId, content: content)
            }
        }
    }

    private func saveTimelineInBackground() {
        guard let proj = project else { return }
        Task {
            try? await fileService.saveTimeline(projectURL: proj.projectURL, timelineData: proj.timelineData)
        }
    }

    func saveCharacterOutline(character: Character) async {
        guard let proj = project else { return }
        let pps = proj.plotPoints(for: character.id)
        let ss = proj.scenes(for: character.id)
        try? await fileService.saveCharacterOutline(
            projectURL: proj.projectURL,
            character: character,
            plotPoints: pps,
            scenes: ss
        )
    }
}
