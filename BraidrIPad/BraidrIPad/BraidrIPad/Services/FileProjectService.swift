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
        let url = projectURL.appendingPathComponent("drafts/\(sceneId).html")
        guard FileManager.default.fileExists(atPath: url.path) else {
            // Fall back to timeline.json draftContent
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
        let url = draftsDir.appendingPathComponent("\(sceneId).html")
        try content.write(to: url, atomically: true, encoding: .utf8)
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
        let data = try encoder.encode(timelineData)
        try data.write(to: url, options: .atomic)
    }

    // MARK: - Character outline

    func saveCharacterOutline(projectURL: URL, character: Character, plotPoints: [PlotPoint], scenes: [Scene]) throws {
        let content = OutlineParser.serialize(character: character, plotPoints: plotPoints, scenes: scenes)
        let url = URL(fileURLWithPath: character.filePath)
        try content.write(to: url, atomically: true, encoding: .utf8)
    }
}
