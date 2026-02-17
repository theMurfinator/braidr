# Braidr

The only writing tool built for multi-POV novels. Organize by character arc or reading order. Own your data with local markdown files.

## Features

- **POV Outline View** — Each character gets their own outline with plot point sections, drag-and-drop scenes, and story structure templates
- **Braided Timeline** — See all scenes from every character in reading order. List, table, and rails layouts
- **Editor** — Full-screen writing environment with scene navigator, writing timer, and draft versioning
- **Notes** — Wiki-style notebook with `[[wikilinks]]`, backlinks, and an interactive knowledge graph
- **Analytics** — Calendar heatmap, per-character word counts, daily goals, and milestone tracking
- **Tags & Metadata** — Five tag categories (people, locations, arcs, things, time) with autocomplete and custom metadata fields
- **Compile & Export** — Export to Markdown, DOCX, or PDF
- **Search** — Cmd+K to search across scenes, notes, and tags
- **Local Storage** — Your outlines are plain `.md` files on your hard drive. Human-readable, git-compatible, editable in any text editor

## Tech Stack

- **Electron** + **React** + **TypeScript**
- **Vite** for bundling
- **TipTap** for rich text editing
- **LemonSqueezy** for licensing
- **PostHog** for analytics
- **electron-updater** for auto-updates

## Development

```bash
npm install
npm run dev
```

## Building

Releases are fully automated via GitHub Actions. When code is pushed to `main`, the workflow:

1. Bumps the patch version
2. Builds for macOS, Windows, and Linux
3. Code signs and notarizes (macOS)
4. Publishes to GitHub Releases

Do **not** run `npm run package` locally — it requires code-signing credentials that live in GitHub Secrets.

## License

Proprietary. See [braidr.com](https://getbraider.com) for pricing.
