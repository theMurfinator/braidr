import Foundation

struct Project {
    var projectURL: URL
    var projectName: String
    var characters: [Character]
    var scenes: [Scene]
    var plotPoints: [PlotPoint]
    var tags: [Tag]
    var timelineData: TimelineData
    var notesIndex: NotesIndex?

    var sortedBraidedScenes: [Scene] {
        scenes
            .filter { $0.timelinePosition != nil }
            .sorted { ($0.timelinePosition ?? 0) < ($1.timelinePosition ?? 0) }
    }

    func scenes(for characterId: String) -> [Scene] {
        scenes
            .filter { $0.characterId == characterId }
            .sorted { $0.sceneNumber < $1.sceneNumber }
    }

    func plotPoints(for characterId: String) -> [PlotPoint] {
        plotPoints
            .filter { $0.characterId == characterId }
            .sorted { $0.order < $1.order }
    }

    func character(for id: String) -> Character? {
        characters.first { $0.id == id }
    }

    func color(for characterId: String) -> String? {
        timelineData.characterColors?[characterId]
            ?? characters.first { $0.id == characterId }?.color
    }
}
