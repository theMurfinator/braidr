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

    /// ID of the scene whose detail sheet is open on the Rails tab.
    var selectedSceneForSheet: String?

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

            // Populate draft contents from per-scene drafts/*.md files (Phase 1 format),
            // then fill gaps from legacy inline timeline.draftContent for older projects.
            var merged = loaded.timelineData.draftContent ?? [:]
            let perScene = (try? await fileService.loadAllDrafts(projectURL: url)) ?? [:]
            for (sceneId, content) in perScene {
                merged[sceneId] = content
            }
            draftContents = merged
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

    /// Scenes with no timelinePosition, optionally filtered to one character.
    func inboxScenes(filter: String = "all") -> [Scene] {
        let unplaced = scenes.filter { $0.timelinePosition == nil }
        let filtered: [Scene]
        if filter == "all" {
            filtered = unplaced
        } else {
            filtered = unplaced.filter { $0.characterId == filter }
        }
        return filtered.sorted {
            if $0.characterId != $1.characterId { return $0.characterId < $1.characterId }
            return $0.sceneNumber < $1.sceneNumber
        }
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

    // MARK: - Scene field mutations (Rails inline editing)

    /// Update a scene's title in-place and persist the owning character .md file.
    func updateSceneTitle(sceneId: String, title: String) {
        guard var proj = project else { return }
        guard let idx = proj.scenes.firstIndex(where: { $0.id == sceneId }) else { return }
        proj.scenes[idx].title = title
        proj.scenes[idx].content = title
        project = proj
        schedulePersistCharacterOutline(for: proj.scenes[idx].characterId)
    }

    /// Update a scene's tags.
    func updateSceneTags(sceneId: String, tags: [String]) {
        guard var proj = project else { return }
        guard let idx = proj.scenes.firstIndex(where: { $0.id == sceneId }) else { return }
        proj.scenes[idx].tags = tags
        project = proj
        schedulePersistCharacterOutline(for: proj.scenes[idx].characterId)
    }

    /// Update a scene's sub-note list.
    func updateSceneNotes(sceneId: String, notes: [String]) {
        guard var proj = project else { return }
        guard let idx = proj.scenes.firstIndex(where: { $0.id == sceneId }) else { return }
        proj.scenes[idx].notes = notes
        project = proj
        schedulePersistCharacterOutline(for: proj.scenes[idx].characterId)
    }

    // MARK: - Private: character-outline debounced save

    private var outlineAutoSaveTimer: Timer?
    private var pendingOutlineSaves: Set<String> = []

    private func schedulePersistCharacterOutline(for characterId: String) {
        pendingOutlineSaves.insert(characterId)
        outlineAutoSaveTimer?.invalidate()
        outlineAutoSaveTimer = Timer.scheduledTimer(withTimeInterval: 0.8, repeats: false) { [weak self] _ in
            guard let self else { return }
            Task { await self.flushOutlineSaves() }
        }
    }

    private func flushOutlineSaves() async {
        guard let proj = project else { return }
        let toSave = pendingOutlineSaves
        pendingOutlineSaves.removeAll()
        for charId in toSave {
            guard let character = proj.characters.first(where: { $0.id == charId }) else { continue }
            let pps = proj.plotPoints(for: charId)
            let ss = proj.scenes(for: charId)
            try? await fileService.saveCharacterOutline(projectURL: proj.projectURL, character: character, plotPoints: pps, scenes: ss)
        }
    }

    // MARK: - Drag mutators

    /// Place an unbraided scene at timeline position `target`, shifting others down.
    func placeSceneInBraid(sceneId: String, at target: Int) {
        guard var proj = project else { return }
        // Shift any placed scene at or above target up by 1.
        for i in proj.scenes.indices {
            if let pos = proj.scenes[i].timelinePosition, pos >= target {
                proj.scenes[i].timelinePosition = pos + 1
                proj.timelineData.positions[proj.scenes[i].id] = pos + 1
            }
        }
        if let idx = proj.scenes.firstIndex(where: { $0.id == sceneId }) {
            proj.scenes[idx].timelinePosition = target
            proj.timelineData.positions[sceneId] = target
        }
        renumberBraid(&proj)
        project = proj
        saveTimelineInBackground()
    }

    /// Remove a scene from the braid, leaving it in the inbox.
    func unbraidScene(sceneId: String) {
        guard var proj = project else { return }
        if let idx = proj.scenes.firstIndex(where: { $0.id == sceneId }) {
            proj.scenes[idx].timelinePosition = nil
        }
        proj.timelineData.positions.removeValue(forKey: sceneId)
        renumberBraid(&proj)
        project = proj
        saveTimelineInBackground()
    }

    /// Move a placed scene from current position to target position.
    func moveBraidedScene(sceneId: String, to target: Int) {
        guard var proj = project else { return }
        guard let idx = proj.scenes.firstIndex(where: { $0.id == sceneId }),
              let currentPos = proj.scenes[idx].timelinePosition else { return }
        // Remove from its current slot first.
        proj.scenes[idx].timelinePosition = nil
        proj.timelineData.positions.removeValue(forKey: sceneId)
        // Shift others up/down to open a slot at target.
        for i in proj.scenes.indices where i != idx {
            guard let pos = proj.scenes[i].timelinePosition else { continue }
            if currentPos < target {
                if pos > currentPos && pos <= target - 1 {
                    proj.scenes[i].timelinePosition = pos - 1
                    proj.timelineData.positions[proj.scenes[i].id] = pos - 1
                }
            } else if currentPos > target {
                if pos >= target && pos < currentPos {
                    proj.scenes[i].timelinePosition = pos + 1
                    proj.timelineData.positions[proj.scenes[i].id] = pos + 1
                }
            }
        }
        let finalPos = min(target, braidCount(in: proj) + 1)
        proj.scenes[idx].timelinePosition = finalPos
        proj.timelineData.positions[sceneId] = finalPos
        renumberBraid(&proj)
        project = proj
        saveTimelineInBackground()
    }

    // MARK: - Drag helpers

    private func braidCount(in proj: Project) -> Int {
        proj.scenes.filter { $0.timelinePosition != nil }.count
    }

    /// Collapse any gaps so timeline positions are 1...N contiguous.
    private func renumberBraid(_ proj: inout Project) {
        let sorted = proj.scenes.enumerated()
            .compactMap { ($0.offset, $0.element.timelinePosition) }
            .filter { $0.1 != nil }
            .sorted { ($0.1 ?? 0) < ($1.1 ?? 0) }
        for (newPos, (origIdx, _)) in sorted.enumerated() {
            proj.scenes[origIdx].timelinePosition = newPos + 1
            proj.timelineData.positions[proj.scenes[origIdx].id] = newPos + 1
        }
    }
}
