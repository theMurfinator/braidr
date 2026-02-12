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

### Package Signed macOS Release
```bash
npm run package
```

This builds, code signs, notarizes, and creates a `.dmg` + `.zip`. See the **macOS Code Signing** section below.

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

## macOS Code Signing & Notarization

### Step 1: Create a Developer ID Application Certificate

1. Open **Keychain Access** on your Mac
2. Menu bar: **Keychain Access > Certificate Assistant > Request a Certificate From a Certificate Authority**
3. Enter your email, select **Saved to disk**, click Continue, save the `.certSigningRequest` file
4. Go to [Apple Developer Certificates](https://developer.apple.com/account/resources/certificates/list)
5. Click **+** to create a new certificate
6. Select **Developer ID Application** > Continue
7. Upload the `.certSigningRequest` file
8. Download the generated `.cer` file
9. Double-click the `.cer` to install it in Keychain Access

Verify it installed:
```bash
security find-identity -v -p codesigning
```

### Step 2: Create an App-Specific Password for Notarization

1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Sign in > **Sign-In and Security > App-Specific Passwords**
3. Click **Generate an app-specific password**, name it "Braidr Notarization"
4. Save the generated password (`xxxx-xxxx-xxxx-xxxx`)

### Step 3: Set Environment Variables

Add to `~/.zshrc`:

```bash
export APPLE_ID="your-apple-id@email.com"
export APPLE_ID_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="CBMC9F64HB"
```

Then `source ~/.zshrc`.

### Step 4: Build

```bash
npm run package
```

## Troubleshooting

### Code signing certificate not found
- Verify with `security find-identity -v -p codesigning`
- Certificate must be in your **login** keychain

### Notarization fails
- Ensure `APPLE_ID_PASSWORD` is an **app-specific password** (not your regular Apple password)
- Check entitlements files exist in `build/`
- Run `codesign --verify --deep --strict /path/to/Braidr.app` to diagnose

### App won't start
- Make sure Node.js 18+ is installed: `node --version`
- Delete `node_modules` and run `npm install` again

### Changes not saving
- Check that the project folder has write permissions
- Look for error messages in the developer console (View > Toggle Developer Tools)
