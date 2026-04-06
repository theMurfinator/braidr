import Foundation

struct ParseResult {
    var character: Character
    var plotPoints: [PlotPoint]
    var scenes: [Scene]
    var rawContent: String
}

enum OutlineParser {

    // MARK: - Public

    static func parse(content: String, fileName: String, filePath: String) -> ParseResult {
        let (characterName, body, _fileNameTag) = parseCharacterFromFrontmatter(content: content, fileName: fileName)
        let properCharacterTag = characterName.lowercased().replacingOccurrences(of: " ", with: "_")

        let character = Character(
            id: stableId(characterName.lowercased()),
            name: characterName,
            filePath: filePath
        )

        let lines = body.components(separatedBy: "\n")
        var plotPoints: [PlotPoint] = []
        var scenes: [Scene] = []

        var currentPlotPoint: PlotPoint?
        var ppDescriptionLines: [String] = []
        var currentScene: Scene?
        var currentNotes: [String] = []
        var plotPointOrder = 0

        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard !trimmed.isEmpty else { continue }

            // Plot point header: ## Title (count)
            if isPlotPointHeader(line) {
                // Flush previous scene
                if var s = currentScene {
                    s.notes = currentNotes
                    scenes.append(s)
                    currentScene = nil
                    currentNotes = []
                }
                // Flush previous plot point description
                if var pp = currentPlotPoint, !ppDescriptionLines.isEmpty {
                    pp.description = ppDescriptionLines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
                    if let idx = plotPoints.firstIndex(where: { $0.id == pp.id }) {
                        plotPoints[idx] = pp
                    }
                    ppDescriptionLines = []
                }

                let (title, count) = parsePlotPointHeader(trimmed)
                let pp = PlotPoint(
                    id: generateId(),
                    characterId: character.id,
                    title: title,
                    expectedSceneCount: count,
                    description: "",
                    order: plotPointOrder
                )
                plotPointOrder += 1
                plotPoints.append(pp)
                currentPlotPoint = pp
                continue
            }

            // Scene line: N. content
            if isSceneLine(line) {
                if var s = currentScene {
                    s.notes = currentNotes
                    scenes.append(s)
                    currentNotes = []
                }
                if var pp = currentPlotPoint, !ppDescriptionLines.isEmpty {
                    pp.description = ppDescriptionLines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
                    if let idx = plotPoints.firstIndex(where: { $0.id == pp.id }) {
                        plotPoints[idx] = pp
                    }
                    ppDescriptionLines = []
                }

                let parsed = parseSceneLine(trimmed)
                var tags = extractTags(from: parsed.content)

                // Filter old filename-based tag if needed
                let fileNameTag = _fileNameTag
                if fileNameTag != properCharacterTag {
                    tags.removeAll { $0 == fileNameTag }
                }
                // Auto-add character tag
                if !tags.contains(properCharacterTag) {
                    tags.append(properCharacterTag)
                }

                currentScene = Scene(
                    id: parsed.stableId ?? generateId(),
                    characterId: character.id,
                    sceneNumber: parsed.sceneNumber,
                    title: parsed.content,
                    content: parsed.content,
                    tags: tags,
                    timelinePosition: nil,
                    isHighlighted: parsed.isHighlighted,
                    notes: [],
                    plotPointId: currentPlotPoint?.id,
                    wordCount: nil
                )
                continue
            }

            // Sub-note (indented numbered or bullet)
            if isSubNote(line), currentScene != nil {
                let note = trimmed
                    .replacingOccurrences(of: "^\\s*[\\d\\-\\*]+\\.\\s*", with: "", options: .regularExpression)
                currentNotes.append(note)
                continue
            }

            // Otherwise: plot point description or scene continuation
            if currentPlotPoint != nil && currentScene == nil {
                ppDescriptionLines.append(trimmed)
            } else if currentScene != nil {
                currentNotes.append(trimmed)
            }
        }

        // Flush last scene
        if var s = currentScene {
            s.notes = currentNotes
            scenes.append(s)
        }
        // Flush last plot point description
        if var pp = currentPlotPoint, !ppDescriptionLines.isEmpty {
            pp.description = ppDescriptionLines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            if let idx = plotPoints.firstIndex(where: { $0.id == pp.id }) {
                plotPoints[idx] = pp
            }
        }

        return ParseResult(character: character, plotPoints: plotPoints, scenes: scenes, rawContent: content)
    }

    /// Serialize an outline back to markdown
    static func serialize(character: Character, plotPoints: [PlotPoint], scenes: [Scene]) -> String {
        var content = "---\ncharacter: \(character.name)\n---\n\n"

        let scenesByPP = Dictionary(grouping: scenes.filter { $0.characterId == character.id }) { $0.plotPointId ?? "__orphan__" }
        let sortedPPs = plotPoints
            .filter { $0.characterId == character.id }
            .sorted { $0.order < $1.order }

        var counter = 1

        // Orphan scenes first
        for scene in (scenesByPP["__orphan__"] ?? []).sorted(by: { $0.sceneNumber < $1.sceneNumber }) {
            let line = buildSceneLine(scene: scene, characterName: character.name)
            content += "\(counter). \(line)\n"
            counter += 1
            for note in scene.notes {
                content += "\t1. \(note)\n"
            }
        }

        for pp in sortedPPs {
            let countStr = pp.expectedSceneCount.map { " (\($0))" } ?? ""
            content += "## \(pp.title)\(countStr)\n"
            if !pp.description.isEmpty {
                content += "\(pp.description)\n"
            }
            for scene in (scenesByPP[pp.id] ?? []).sorted(by: { $0.sceneNumber < $1.sceneNumber }) {
                let line = buildSceneLine(scene: scene, characterName: character.name)
                content += "\(counter). \(line)\n"
                counter += 1
                for note in scene.notes {
                    content += "\t1. \(note)\n"
                }
            }
            content += "\n"
        }

        return content
    }

    // MARK: - Tag extraction

    static func extractTags(from text: String) -> [String] {
        let regex = try! NSRegularExpression(pattern: "#([a-zA-Z0-9_]+)")
        let range = NSRange(text.startIndex..., in: text)
        let matches = regex.matches(in: text, range: range)
        var tags: [String] = []
        var seen = Set<String>()
        for match in matches {
            if let r = Range(match.range(at: 1), in: text) {
                let tag = String(text[r]).lowercased()
                if seen.insert(tag).inserted {
                    tags.append(tag)
                }
            }
        }
        return tags
    }

    // MARK: - Private helpers

    private static func generateId() -> String {
        let chars = "abcdefghijklmnopqrstuvwxyz0123456789"
        return String((0..<9).map { _ in chars.randomElement()! })
    }

    private static func stableId(_ str: String) -> String {
        var hash: Int32 = 0
        for char in str.unicodeScalars {
            let c = Int32(char.value)
            hash = ((hash &<< 5) &- hash) &+ c
        }
        return "c" + String(abs(hash), radix: 36)
    }

    private static func parseCharacterFromFrontmatter(content: String, fileName: String) -> (name: String, body: String, fileNameTag: String) {
        let fileNameWithoutExt = fileName.replacingOccurrences(of: ".md", with: "")
        let fileNameTag = fileNameWithoutExt.lowercased()
            .replacingOccurrences(of: " ", with: "_")
            .replacingOccurrences(of: "-", with: "_")

        let pattern = "^---\\n([\\s\\S]*?)\\n---\\n"
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: content, range: NSRange(content.startIndex..., in: content)),
              let fmRange = Range(match.range(at: 1), in: content),
              let fullRange = Range(match.range, in: content) else {
            // No frontmatter
            let name = fileNameWithoutExt
                .replacingOccurrences(of: "-", with: " ")
                .capitalized
            return (name, content, fileNameTag)
        }

        let frontmatter = String(content[fmRange])
        let body = String(content[fullRange.upperBound...])

        let charRegex = try! NSRegularExpression(pattern: "character:\\s*(.+)")
        let name: String
        if let cm = charRegex.firstMatch(in: frontmatter, range: NSRange(frontmatter.startIndex..., in: frontmatter)),
           let r = Range(cm.range(at: 1), in: frontmatter) {
            name = String(frontmatter[r]).trimmingCharacters(in: .whitespaces)
        } else {
            name = fileNameWithoutExt
        }

        return (name, body, fileNameTag)
    }

    private static func isPlotPointHeader(_ line: String) -> Bool {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        return trimmed.hasPrefix("## ")
    }

    private static func parsePlotPointHeader(_ line: String) -> (title: String, count: Int?) {
        let regex = try! NSRegularExpression(pattern: "^##\\s+(.+?)(?:\\s*\\((\\d+)\\))?$")
        let range = NSRange(line.startIndex..., in: line)
        if let match = regex.firstMatch(in: line, range: range),
           let titleRange = Range(match.range(at: 1), in: line) {
            let title = String(line[titleRange]).trimmingCharacters(in: .whitespaces)
            var count: Int?
            if match.range(at: 2).location != NSNotFound,
               let countRange = Range(match.range(at: 2), in: line) {
                count = Int(String(line[countRange]))
            }
            return (title, count)
        }
        let title = line.replacingOccurrences(of: "^##\\s+", with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        return (title, nil)
    }

    private static func isSceneLine(_ line: String) -> Bool {
        let regex = try! NSRegularExpression(pattern: "^\\d+\\.\\s")
        return regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)) != nil
    }

    private static func parseSceneLine(_ line: String) -> (sceneNumber: Int, content: String, isHighlighted: Bool, stableId: String?) {
        let regex = try! NSRegularExpression(pattern: "^(\\d+)\\.\\s+(.+)$")
        let range = NSRange(line.startIndex..., in: line)
        guard let match = regex.firstMatch(in: line, range: range),
              let numRange = Range(match.range(at: 1), in: line),
              let contentRange = Range(match.range(at: 2), in: line) else {
            return (0, line, false, nil)
        }

        let sceneNumber = Int(String(line[numRange])) ?? 0
        var content = String(line[contentRange])

        // Extract stable ID from <!-- sid:xxx -->
        var sid: String?
        let sidRegex = try! NSRegularExpression(pattern: "<!--\\s*sid:(\\S+)\\s*-->")
        if let sidMatch = sidRegex.firstMatch(in: content, range: NSRange(content.startIndex..., in: content)),
           let sidRange = Range(sidMatch.range(at: 1), in: content) {
            sid = String(content[sidRange])
            // Remove the comment from content
            if let fullSidRange = Range(sidMatch.range, in: content) {
                content = content.replacingCharacters(in: fullSidRange, with: "")
                    .trimmingCharacters(in: .whitespaces)
            }
        }

        // Check for highlight ==**text**==
        let highlightRegex = try! NSRegularExpression(pattern: "==\\*\\*.*\\*\\*==")
        let isHighlighted = highlightRegex.firstMatch(in: content, range: NSRange(content.startIndex..., in: content)) != nil

        return (sceneNumber, content, isHighlighted, sid)
    }

    private static func isSubNote(_ line: String) -> Bool {
        let regex = try! NSRegularExpression(pattern: "^\\s+[\\d\\-\\*]+\\.\\s")
        return regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)) != nil
    }

    private static func buildSceneLine(scene: Scene, characterName: String) -> String {
        // Strip existing tags and stable ID from content
        var clean = scene.content
            .replacingOccurrences(of: "#[a-zA-Z0-9_]+", with: "", options: .regularExpression)
            .replacingOccurrences(of: "\\s*<!--\\s*sid:\\S+\\s*-->", with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)

        let characterTag = characterName.lowercased().replacingOccurrences(of: " ", with: "_")
        let tagsToWrite = scene.tags.filter { $0 != characterTag }

        if !tagsToWrite.isEmpty {
            clean += " " + tagsToWrite.map { "#\($0)" }.joined(separator: " ")
        }

        clean += " <!-- sid:\(scene.id) -->"
        return clean
    }
}
