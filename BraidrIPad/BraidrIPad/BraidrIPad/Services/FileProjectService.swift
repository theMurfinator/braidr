import Foundation

actor FileProjectService {

    // MARK: - Load project

    func loadProject(from url: URL) async throws -> Project {
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }

        let fm = FileManager.default
        let projectName = url.lastPathComponent

        // Check for active branch
        let branchIndex = readBranchIndex(projectURL: url)
        let activeBranch = branchIndex.activeBranch

        // Discover .md files — from branch folder if active, otherwise project root
        let mdSourceDir = branchMdDir(projectURL: url, branchName: activeBranch)
        let contents = try fm.contentsOfDirectory(at: mdSourceDir, includingPropertiesForKeys: nil)
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

        // Override positions if on a branch
        if let branch = activeBranch {
            let posURL = url.appendingPathComponent("branches/\(branch)/positions.json")
            if fm.fileExists(atPath: posURL.path),
               let posData = try? Data(contentsOf: posURL),
               let branchPositions = try? JSONDecoder().decode([String: Int].self, from: posData) {
                timelineData.positions = branchPositions
            }
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
        let branchIndex = readBranchIndex(projectURL: projectURL)
        let saveURL: URL
        if let branch = branchIndex.activeBranch {
            let fileName = URL(fileURLWithPath: character.filePath).lastPathComponent
            let branchDir = projectURL.appendingPathComponent("branches/\(branch)")
            try FileManager.default.createDirectory(at: branchDir, withIntermediateDirectories: true)
            saveURL = branchDir.appendingPathComponent(fileName)
        } else {
            saveURL = URL(fileURLWithPath: character.filePath)
        }
        try content.write(to: saveURL, atomically: true, encoding: .utf8)
    }

    func saveTimeline(projectURL: URL, timelineData: TimelineData, activeBranch: String? = nil) throws {
        // Save branch positions separately when on a branch
        if let branch = activeBranch {
            let posURL = projectURL.appendingPathComponent("branches/\(branch)/positions.json")
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let posData = try encoder.encode(timelineData.positions)
            try posData.write(to: posURL, options: .atomic)
        }

        // Always save full timeline to main
        let url = projectURL.appendingPathComponent("timeline.json")
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let encoded = try encoder.encode(timelineData)
        let merged = Self.mergeUnknownKeys(newData: encoded, existingFileURL: url)
        try merged.write(to: url, options: .atomic)
    }

    // MARK: - Branches

    func listBranches(projectURL: URL) -> BranchIndex {
        readBranchIndex(projectURL: projectURL)
    }

    func createBranch(projectURL: URL, name: String, description: String? = nil) throws -> BranchIndex {
        var index = readBranchIndex(projectURL: projectURL)
        let fm = FileManager.default

        let sourceLabel = index.activeBranch ?? "main"
        let sourceDir = branchMdDir(projectURL: projectURL, branchName: index.activeBranch)
        let sourcePositions = readBranchPositions(projectURL: projectURL, branchName: index.activeBranch)

        let destDir = projectURL.appendingPathComponent("branches/\(name)")
        try fm.createDirectory(at: destDir, withIntermediateDirectories: true)

        // Copy .md files
        let mdFiles = listMdFiles(in: sourceDir)
        for fileName in mdFiles {
            let srcURL = sourceDir.appendingPathComponent(fileName)
            let dstURL = destDir.appendingPathComponent(fileName)
            if fm.fileExists(atPath: dstURL.path) {
                try fm.removeItem(at: dstURL)
            }
            try fm.copyItem(at: srcURL, to: dstURL)
        }

        // Write positions
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let posData = try encoder.encode(sourcePositions)
        try posData.write(to: destDir.appendingPathComponent("positions.json"), options: .atomic)

        let info = BranchInfo(
            name: name,
            description: description,
            createdAt: ISO8601DateFormatter().string(from: Date()),
            createdFrom: sourceLabel
        )
        index.branches.append(info)
        index.activeBranch = name
        writeBranchIndex(projectURL: projectURL, index: index)

        return index
    }

    func switchBranch(projectURL: URL, name: String?) -> BranchIndex {
        var index = readBranchIndex(projectURL: projectURL)
        index.activeBranch = name
        writeBranchIndex(projectURL: projectURL, index: index)
        return index
    }

    func deleteBranch(projectURL: URL, name: String) throws -> BranchIndex {
        var index = readBranchIndex(projectURL: projectURL)
        let fm = FileManager.default

        let branchDir = projectURL.appendingPathComponent("branches/\(name)")
        if fm.fileExists(atPath: branchDir.path) {
            try fm.removeItem(at: branchDir)
        }

        index.branches.removeAll { $0.name == name }
        if index.activeBranch == name {
            index.activeBranch = nil
        }
        writeBranchIndex(projectURL: projectURL, index: index)

        return index
    }

    func compareBranches(projectURL: URL, leftBranch: String?, rightBranch: String?) -> BranchCompareData {
        let leftDir = branchMdDir(projectURL: projectURL, branchName: leftBranch)
        let rightDir = branchMdDir(projectURL: projectURL, branchName: rightBranch)
        let leftPositions = readBranchPositions(projectURL: projectURL, branchName: leftBranch)
        let rightPositions = readBranchPositions(projectURL: projectURL, branchName: rightBranch)

        let leftScenes = parseScenesFromDir(leftDir)
        let rightScenes = parseScenesFromDir(rightDir)

        let leftMap = Dictionary(leftScenes.map { ($0.sceneId, $0) }, uniquingKeysWith: { a, _ in a })
        let rightMap = Dictionary(rightScenes.map { ($0.sceneId, $0) }, uniquingKeysWith: { a, _ in a })

        var allIds = Set(leftMap.keys)
        allIds.formUnion(rightMap.keys)

        var diffs: [BranchSceneDiff] = []
        for sceneId in allIds {
            let l = leftMap[sceneId]
            let r = rightMap[sceneId]
            let leftTitle = l?.title ?? ""
            let rightTitle = r?.title ?? ""
            let leftPos = leftPositions[sceneId]
            let rightPos = rightPositions[sceneId]
            let changed = leftTitle != rightTitle || leftPos != rightPos
            let representative = l ?? r!

            diffs.append(BranchSceneDiff(
                sceneId: sceneId,
                characterId: representative.characterId,
                characterName: representative.characterName,
                sceneNumber: representative.sceneNumber,
                leftTitle: leftTitle,
                rightTitle: rightTitle,
                leftPosition: leftPos,
                rightPosition: rightPos,
                changed: changed
            ))
        }

        return BranchCompareData(
            leftName: leftBranch ?? "main",
            rightName: rightBranch ?? "main",
            scenes: diffs
        )
    }

    func mergeBranch(projectURL: URL, branchName: String, sceneIds: [String]) throws {
        guard !sceneIds.isEmpty else { return }

        let branchDir = branchMdDir(projectURL: projectURL, branchName: branchName)
        let branchPositions = readBranchPositions(projectURL: projectURL, branchName: branchName)
        let branchScenes = parseScenesFromDir(branchDir)

        let branchMap = Dictionary(branchScenes.map { ($0.sceneId, $0) }, uniquingKeysWith: { a, _ in a })

        // Group by filename
        var fileUpdates: [String: [(sceneId: String, fullLine: String)]] = [:]
        for sid in sceneIds {
            guard let scene = branchMap[sid] else { continue }
            fileUpdates[scene.fileName, default: []].append((sceneId: sid, fullLine: scene.fullLine))
        }

        // Update main .md files
        for (fileName, updates) in fileUpdates {
            let mainFileURL = projectURL.appendingPathComponent(fileName)
            guard var content = try? String(contentsOf: mainFileURL, encoding: .utf8) else { continue }

            for update in updates {
                let escaped = NSRegularExpression.escapedPattern(for: update.sceneId)
                let pattern = "^(\\d+\\.\\s+.*)<!--\\s*sid:\(escaped)\\s*-->.*$"
                if let regex = try? NSRegularExpression(pattern: pattern, options: .anchorsMatchLines) {
                    let range = NSRange(content.startIndex..., in: content)
                    content = regex.stringByReplacingMatches(in: content, range: range, withTemplate: update.fullLine)
                }
            }

            try content.write(to: mainFileURL, atomically: true, encoding: .utf8)
        }

        // Update positions in timeline.json
        let timelineURL = projectURL.appendingPathComponent("timeline.json")
        var timeline: [String: Any] = [:]
        if let data = try? Data(contentsOf: timelineURL),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            timeline = json
        }

        var positions = (timeline["positions"] as? [String: Int]) ?? [:]
        for sid in sceneIds {
            if let pos = branchPositions[sid] {
                positions[sid] = pos
            }
        }
        timeline["positions"] = positions

        let outData = try JSONSerialization.data(withJSONObject: timeline, options: [.prettyPrinted, .sortedKeys])
        try outData.write(to: timelineURL, options: .atomic)
    }

    // MARK: - Branch helpers

    private func readBranchIndex(projectURL: URL) -> BranchIndex {
        let url = projectURL.appendingPathComponent("branches/index.json")
        guard let data = try? Data(contentsOf: url),
              let index = try? JSONDecoder().decode(BranchIndex.self, from: data) else {
            return .empty
        }
        return index
    }

    private func writeBranchIndex(projectURL: URL, index: BranchIndex) {
        let url = projectURL.appendingPathComponent("branches/index.json")
        let dir = url.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        if let data = try? encoder.encode(index) {
            try? data.write(to: url, options: .atomic)
        }
    }

    private func branchMdDir(projectURL: URL, branchName: String?) -> URL {
        guard let name = branchName else { return projectURL }
        return projectURL.appendingPathComponent("branches/\(name)")
    }

    private func readBranchPositions(projectURL: URL, branchName: String?) -> [String: Int] {
        if let name = branchName {
            let url = projectURL.appendingPathComponent("branches/\(name)/positions.json")
            if let data = try? Data(contentsOf: url),
               let positions = try? JSONDecoder().decode([String: Int].self, from: data) {
                return positions
            }
            return [:]
        }
        let url = projectURL.appendingPathComponent("timeline.json")
        if let data = try? Data(contentsOf: url),
           let timeline = try? JSONDecoder().decode(TimelineData.self, from: data) {
            return timeline.positions
        }
        return [:]
    }

    private func listMdFiles(in dir: URL) -> [String] {
        guard let contents = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else {
            return []
        }
        return contents
            .filter { $0.pathExtension == "md" && !$0.lastPathComponent.hasPrefix("CLAUDE") && !$0.lastPathComponent.hasPrefix("README") }
            .map { $0.lastPathComponent }
    }

    private struct ParsedBranchScene {
        var sceneId: String
        var sceneNumber: Int
        var title: String
        var fullLine: String
        var characterName: String
        var characterId: String
        var fileName: String
    }

    private func parseScenesFromDir(_ dir: URL) -> [ParsedBranchScene] {
        var scenes: [ParsedBranchScene] = []
        let mdFiles = listMdFiles(in: dir)

        for fileName in mdFiles {
            let fileURL = dir.appendingPathComponent(fileName)
            guard let content = try? String(contentsOf: fileURL, encoding: .utf8) else { continue }

            let characterName = parseCharacterNameFromContent(content)
            let characterId = fileName.replacingOccurrences(of: ".md", with: "").lowercased()

            for line in content.components(separatedBy: "\n") {
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                let lineRegex = try! NSRegularExpression(pattern: "^(\\d+)\\.\\s+(.+)$")
                let range = NSRange(trimmed.startIndex..., in: trimmed)
                guard let match = lineRegex.firstMatch(in: trimmed, range: range),
                      let numRange = Range(match.range(at: 1), in: trimmed),
                      let contentRange = Range(match.range(at: 2), in: trimmed) else { continue }

                let sceneNumber = Int(String(trimmed[numRange])) ?? 0
                let sceneLine = String(trimmed[contentRange])

                let sidRegex = try! NSRegularExpression(pattern: "<!--\\s*sid:(\\S+)\\s*-->")
                let lineRange = NSRange(sceneLine.startIndex..., in: sceneLine)
                guard let sidMatch = sidRegex.firstMatch(in: sceneLine, range: lineRange),
                      let sidRange = Range(sidMatch.range(at: 1), in: sceneLine) else { continue }

                let sceneId = String(sceneLine[sidRange])
                let title = sceneLine.replacingOccurrences(of: "\\s*<!--\\s*sid:\\S+\\s*-->", with: "", options: .regularExpression)
                    .trimmingCharacters(in: .whitespaces)

                scenes.append(ParsedBranchScene(
                    sceneId: sceneId,
                    sceneNumber: sceneNumber,
                    title: title,
                    fullLine: trimmed,
                    characterName: characterName,
                    characterId: characterId,
                    fileName: fileName
                ))
            }
        }

        return scenes
    }

    private func parseCharacterNameFromContent(_ content: String) -> String {
        let regex = try! NSRegularExpression(pattern: "^---\\s*\\n[\\s\\S]*?character:\\s*(.+)\\n[\\s\\S]*?---", options: .anchorsMatchLines)
        let range = NSRange(content.startIndex..., in: content)
        if let match = regex.firstMatch(in: content, range: range),
           let nameRange = Range(match.range(at: 1), in: content) {
            return String(content[nameRange]).trimmingCharacters(in: .whitespaces)
        }
        return "Unknown"
    }
}
