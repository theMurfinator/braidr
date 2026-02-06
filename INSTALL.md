# Installation Guide

## Prerequisites

- **Node.js** (version 18 or higher)
- **npm** (comes with Node.js)

## Setup

1. Open a terminal and navigate to the project folder:
   ```bash
   cd "/Users/brian/Writing app"
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Running the App

### Development Mode
Run with hot-reloading for development:
```bash
npm run dev
```

### Production Build
Build the app for distribution:
```bash
npm run build
```

The built app will be in the `dist-electron` folder.

## Project Structure

```
Writing app/
├── src/
│   ├── main/           # Electron main process
│   │   ├── main.ts     # Main entry point
│   │   └── preload.ts  # Preload script for IPC
│   ├── renderer/       # React frontend
│   │   ├── App.tsx     # Main React component
│   │   ├── components/ # UI components
│   │   ├── services/   # Data services
│   │   └── styles.css  # Styles
│   └── shared/         # Shared types
│       └── types.ts    # TypeScript interfaces
├── CLAUDE.md           # Product documentation
├── package.json        # Dependencies and scripts
└── INSTALL.md          # This file
```

## Usage

1. Launch the app
2. Click "Open Project Folder" to select a folder containing your character markdown files
3. Use **POV View** to edit individual character outlines
4. Use **Braided View** to arrange scenes in reading order

### File Format

Each character should have a markdown file with this format:

```markdown
---
character: Character Name
---

## Plot Point Title (expected_scene_count)
Description of this section...

1. Scene description with #tags
   1. Sub-note for scene 1

2. Another scene #location #character
```

### Keyboard Shortcuts

- **Escape** - Cancel editing
- **Enter** - Confirm title edits

## Troubleshooting

### App won't start
- Make sure Node.js 18+ is installed: `node --version`
- Delete `node_modules` and run `npm install` again

### Changes not saving
- Check that the project folder has write permissions
- Look for error messages in the developer console (View > Toggle Developer Tools)
