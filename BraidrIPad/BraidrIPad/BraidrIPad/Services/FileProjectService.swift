import Foundation

actor FileProjectService {

    // MARK: - Load project

    func loadProject(from url: URL) async throws -> Project {
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }

        let fm = FileManager.default
        let projectName = url.lastPathComponent

        // Discover .md files in the project root
        let contents = try fm.contentsOfDirectory(at: url, includingPropertiesForKeys: nil)
        let mdFiles = contents.filter { $0.pathExtension == "md" }

        var characters: [Character] = []
        var allScenes: [Scene] = []
        var allPlotPoints: [PlotPoint] = []
        var seenCharacterIds = Set<String>()

        for mdURL in mdFiles {
            let content = try String(contentsOf: mdURL, encoding: .utf8)
            let result = OutlineParser.parse(
                content: content,
                fileName: mdURL.lastPathComponent,
                filePath: mdURL.path
            )
            if seenCharacterIds.insert(result.character.id).inserted {
                characters.append(result.character)
            }
            allScenes.append(contentsOf: result.scenes)
            allPlotPoints.append(contentsOf: result.plotPoints)
        }

        // Load timeline.json
        let timelineURL = url.appendingPathComponent("timeline.json")
        var timelineData = TimelineData()
        if fm.fileExists(atPath: timelineURL.path) {
            let data = try Data(contentsOf: timelineURL)
            timelineData = try JSONDecoder().decode(TimelineData.self, from: data)
        }

        // Apply timeline positions to scenes
        for i in allScenes.indices {
            let scene = allScenes[i]
            if let pos = timelineData.positions[scene.id] {
                allScenes[i].timelinePosition = pos
            }
            if let wc = timelineData.wordCounts?[scene.id] {
                allScenes[i].wordCount = wc
            }
        }

        // Apply character colors
        for i in characters.indices {
            if let color = timelineData.characterColors?[characters[i].id] {
                characters[i].color = color
            }
        }

        // Collect tags
        let savedTags = timelineData.tags ?? []
        let savedTagMap = Dictionary(savedTags.map { ($0.name, $0) }, uniquingKeysWith: { first, _ in first })
        var seenTagNames = Set<String>()
        var tags: [Tag] = []
        for scene in allScenes {
            for tagName in scene.tags where seenTagNames.insert(tagName).inserted {
                if let saved = savedTagMap[tagName] {
                    tags.append(saved)
                } else {
                    tags.append(Tag(id: UUID().uuidString, name: tagName, category: .people))
                }
            }
        }

        // Load notes index
        let notesIndexURL = url.appendingPathComponent("notes/notes-index.json")
        var notesIndex: NotesIndex?
        if fm.fileExists(atPath: notesIndexURL.path) {
            let data = try Data(contentsOf: notesIndexURL)
            notesIndex = try JSONDecoder().decode(NotesIndex.self, from: data)
        }

        return Project(
            projectURL: url,
            projectName: projectName,
            characters: characters,
            scenes: allScenes,
            plotPoints: allPlotPoints,
            tags: tags,
            timelineData: timelineData,
            notesIndex: notesIndex
        )
    }

    // MARK: - Drafts

    func readDraft(projectURL: URL, sceneId: String) throws -> String {
        let url = projectURL.appendingPathComponent("drafts/\(sceneId).md")
        guard FileManager.default.fileExists(atPath: url.path) else {
            // Fall back to legacy timeline.json draftContent (pre-Phase-1 projects)
            let timelineURL = projectURL.appendingPathComponent("timeline.json")
            if FileManager.default.fileExists(atPath: timelineURL.path),
               let data = try? Data(contentsOf: timelineURL),
               let timeline = try? JSONDecoder().decode(TimelineData.self, from: data),
               let content = timeline.draftContent?[sceneId] {
                return content
            }
            return ""
        }
        return try String(contentsOf: url, encoding: .utf8)
    }

    func saveDraft(projectURL: URL, sceneId: String, content: String) throws {
        let draftsDir = projectURL.appendingPathComponent("drafts")
        try FileManager.default.createDirectory(at: draftsDir, withIntermediateDirectories: true)
        let url = draftsDir.appendingPathComponent("\(sceneId).md")
        try content.write(to: url, atomically: true, encoding: .utf8)
    }

    /// Eagerly read every `drafts/*.md` file, returning sceneId → content.
    /// Mirrors the desktop Electron behavior of preloading all drafts at project-load time.
    func loadAllDrafts(projectURL: URL) throws -> [String: String] {
        let draftsDir = projectURL.appendingPathComponent("drafts")
        guard FileManager.default.fileExists(atPath: draftsDir.path) else { return [:] }
        let contents = try FileManager.default.contentsOfDirectory(at: draftsDir, includingPropertiesForKeys: nil)
        var out: [String: String] = [:]
        for fileURL in contents where fileURL.pathExtension == "md" {
            let sceneId = fileURL.deletingPathExtension().lastPathComponent
            out[sceneId] = (try? String(contentsOf: fileURL, encoding: .utf8)) ?? ""
        }
        return out
    }

    // MARK: - Notes

    func readNote(projectURL: URL, fileName: String) throws -> String {
        let url = projectURL.appendingPathComponent("notes/\(fileName)")
        guard FileManager.default.fileExists(atPath: url.path) else { return "" }
        return try String(contentsOf: url, encoding: .utf8)
    }

    func saveNote(projectURL: URL, fileName: String, content: String) throws {
        let notesDir = projectURL.appendingPathComponent("notes")
        try FileManager.default.createDirectory(at: notesDir, withIntermediateDirectories: true)
        let url = notesDir.appendingPathComponent(fileName)
        try content.write(to: url, atomically: true, encoding: .utf8)
    }

    // MARK: - Timeline

    func saveTimeline(projectURL: URL, timelineData: TimelineData) throws {
        let url = projectURL.appendingPathComponent("timeline.json")
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let encoded = try encoder.encode(timelineData)

        // Preserve task-family keys the iPad app's TimelineData doesn't model.
        // Without this, our save strips tasks/taskFieldDefs/taskViews/etc and
        // iCloud propagates the wipe to the Mac. Mirrors the desktop-side
        // saveTimelineToDisk guard (src/main/saveTimeline.ts).
        let merged = Self.mergeUnknownKeys(newData: encoded, existingFileURL: url)
        try merged.write(to: url, options: .atomic)
    }

    // Only keys that TimelineData.swift does NOT model. If the iPad's
    // TimelineData struct gains a field (e.g. tasks), remove it from this list.
    private static let preservedKeys: [String] = [
        "tasks",
        "taskFieldDefs",
        "taskViews",
        "taskColumnWidths",
        "taskVisibleColumns",
        "inlineMetadataFields",
        "showInlineLabels",
    ]

    private static func mergeUnknownKeys(newData: Data, existingFileURL: URL) -> Data {
        let fm = FileManager.default
        guard fm.fileExists(atPath: existingFileURL.path),
              let existingRaw = try? Data(contentsOf: existingFileURL),
              let existingAny = try? JSONSerialization.jsonObject(with: existingRaw),
              let existing = existingAny as? [String: Any],
              let newAny = try? JSONSerialization.jsonObject(with: newData),
              var merged = newAny as? [String: Any]
        else {
            return newData
        }

        for key in preservedKeys where merged[key] == nil {
            if let preserved = existing[key], !isEmptyJSONValue(preserved) {
                merged[key] = preserved
            }
        }

        guard let out = try? JSONSerialization.data(
            withJSONObject: merged,
            options: [.prettyPrinted, .sortedKeys]
        ) else {
            return newData
        }
        return out
    }

    private static func isEmptyJSONValue(_ value: Any?) -> Bool {
        guard let value = value else { return true }
        if value is NSNull { return true }
        if let arr = value as? [Any] { return arr.isEmpty }
        if let dict = value as? [String: Any] { return dict.isEmpty }
        return false
    }

    // MARK: - Character outline

    func saveCharacterOutline(projectURL: URL, character: Character, plotPoints: [PlotPoint], scenes: [Scene]) throws {
        let content = OutlineParser.serialize(character: character, plotPoints: plotPoints, scenes: scenes)
        let url = URL(fileURLWithPath: character.filePath)
        try content.write(to: url, atomically: true, encoding: .utf8)
    }
}
