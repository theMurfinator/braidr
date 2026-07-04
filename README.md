# Braidr

The only writing tool built for multi-POV novels. Organize by character arc or reading order. Own your data in a single local file.

See `docs/features.md` for the full, actively-maintained feature list. Highlights:

- **POV Outline View** — Each character gets their own outline with plot point sections, drag-and-drop scenes, and a bullpen for loose scenes/sections
- **Braided Timeline** — All characters' scenes in reading order, in list, table, rails, or outline layouts
- **Editor** — Full-screen writing environment with scene navigator, writing timer, and draft versioning
- **Notes** — Wiki-style notebook (BlockNote) with `[[wikilinks]]`, backlinks, tables, and images
- **Tasks** — Lightweight task tracker with custom fields, timer, and subtasks
- **Analytics** — Calendar heatmap, per-character word counts, weekly/monthly targets, session check-ins
- **Draft Branches** — Explore alternate plot/character directions, compare and merge back
- **Tags & Metadata** — Five tag categories (people, locations, arcs, things, time) with autocomplete and custom metadata fields
- **Compile & Export** — Export to Markdown, HTML, DOCX, or PDF
- **Search** — Cmd+K to search across scenes and notes
- **Local Storage** — A single `.braidr` SQLite file per project. Local-first, no cloud sync. (Legacy folder-of-markdown projects are converted to `.braidr` automatically on first open.)

## Tech Stack

- **Electron** + **React** + **TypeScript**
- **Vite** for bundling
- **better-sqlite3** for local project storage
- **TipTap** + **BlockNote** for rich text editing
- **Stripe** for payment + subscription management, with a custom license API (`braidr-api` on Vercel)
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

Proprietary. See [getbraidr.com](https://getbraidr.com) for pricing.
