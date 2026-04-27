# iPad Outline View Improvements

Improve readability and polish of the native SwiftUI Outline (POV) and Rails views. Add per-screen font pickers, better scene presentation, and word count visibility.

## Shared Font Settings Popover

New reusable component: `Views/Shared/FontSettingsPopover.swift`

- 9 font options matching EditorTab: Lora, Merriweather, EB Garamond, Georgia, New York, Palatino, Times New Roman, SF Pro, Avenir Next
- Controls: font family picker (checkmark list), font size slider (13–28pt, step 1)
- Accepts `Binding<String>` for font family and `Binding<Double>` for font size
- Each screen stores its own `@AppStorage` keys — the popover is stateless/generic
- Does NOT sync to `timeline.json` or desktop — iOS-local only via `@AppStorage`

Note: EditorTab keeps its existing font picker since it controls CSS properties for TipTap (WKWebView), not SwiftUI font attributes. The shared popover is only for native SwiftUI views.

## Font Picker Integration

### OutlineTab

- `@AppStorage("outline.fontFamily")` default `"New York"`
- `@AppStorage("outline.fontSize")` default `16.0`
- Toolbar button (SF Symbol `textformat`) opens `FontSettingsPopover` in a popover
- Font applied to scene titles in `SceneRowView`
- Plot point section headers remain at system font (they're structural, not content)

### RailsTab

- `@AppStorage("rails.fontFamily")` default `"New York"`
- `@AppStorage("rails.fontSize")` default `16.0`
- Same toolbar button pattern
- Font applied to the title `TextField` in `RailsSceneCard`

### Font Resolution

Map the stored font family string to a SwiftUI `Font`:
- System fonts (SF Pro, Avenir Next, New York, Georgia, Palatino, Times New Roman): use `Font.custom(name, size:)` — these are available on iOS without bundling
- Bundled fonts (Lora, Merriweather, EB Garamond): already in `Resources/Editor/` as `.ttf` files, registered in Info.plist — use `Font.custom(name, size:)`
- Fallback: if font name doesn't resolve, fall back to `.body`

## Outline View Improvements

All changes in `OutlineTab.swift` (specifically `SceneRowView` and `CharacterOutlineDetail`).

### Scene Title Line Limit

Remove `lineLimit(3)` — show full titles. The Outline is the reading/planning view where seeing the complete scene description matters.

### Tag Visibility Toggle

- `@AppStorage("outline.showTags")` default `true`
- Toggle added to the font settings popover (below the size slider)
- When off, the tags `Text` row is hidden
- Tags are still stored in the scene — this only controls display

### Highlighted Scene Styling

Current: just `.body.bold()` vs `.body` — too subtle.

New: add a leading accent bar using the character's color from `viewModel.characterColor(for:)`.
- 4pt wide rounded rectangle, full height of the row, leading edge
- Applied only to highlighted scenes (`scene.isHighlighted`)
- Character color accessed via `viewModel.characterColor(for: scene.characterId)`
- This requires passing `viewModel` (or at minimum the color string) into `SceneRowView`

### Word Count Badge

- Show word count as a trailing caption when `scene.wordCount` is non-nil and > 0
- Format: `"1,234w"` — abbreviated with `w` suffix, comma-formatted
- Style: `.caption2.monospacedDigit()`, `.secondary` foreground
- Positioned in the same `HStack` as the scene number and title, trailing

## File Changes

| Action | File |
|--------|------|
| Create | `Views/Shared/FontSettingsPopover.swift` |
| Modify | `Views/Outline/OutlineTab.swift` |
| Modify | `Views/Rails/RailsTab.swift` |
| Modify | `Views/Rails/RailsSceneCard.swift` |

## Scope

- No changes to models, services, or persistence
- No `timeline.json` sync — all settings are `@AppStorage` (device-local)
- No changes to EditorTab or NotesTab
- Bundled fonts must be registered in Info.plist `UIAppFonts` array if not already
