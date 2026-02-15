# Release Guide

## How Updates Work

Releases are fully automated. When code is merged to `main`, GitHub Actions automatically bumps the version, builds for all platforms (macOS, Windows, Linux), codesigns, notarizes, and publishes to GitHub Releases. The app's auto-updater picks up new releases automatically.

---

## After Claude Makes Changes

Claude pushes code to a feature branch. To release those changes:

### Option A: GitHub Website (No Tools Required)

1. Go to **https://github.com/theMurfinator/braidr**
2. You'll see a yellow banner: **"claude/... had recent pushes — Compare & pull request"**
3. Click **"Compare & pull request"**
4. Click **"Create pull request"**
5. Click **"Merge pull request"**
6. Done — the release builds automatically

### Option B: GitHub CLI (Terminal)

```bash
# Create and merge the PR in one go
gh pr create --repo theMurfinator/braidr \
  --base main \
  --head <branch-name> \
  --title "Description of changes" \
  --fill

gh pr merge --merge
```

Replace `<branch-name>` with whatever branch Claude pushed to (it will be in the chat).

---

## What Happens After Merge

1. GitHub Actions detects the push to `main`
2. Automatically bumps the patch version (e.g., 1.4.0 → 1.4.1)
3. Creates a version commit and git tag
4. Builds the app for macOS, Windows, and Linux
5. Codesigns and notarizes the macOS build
6. Publishes all builds to GitHub Releases
7. The app's auto-updater will notify users of the new version

You can monitor the build at: **https://github.com/theMurfinator/braidr/actions**

---

## Troubleshooting

### Build failed in GitHub Actions
- Go to https://github.com/theMurfinator/braidr/actions
- Click the failed run to see logs
- Common issues: missing secrets, npm dependency errors

### Need to skip a release
- If you push something to `main` that shouldn't trigger a release (like a README edit), include `chore: bump version` in the commit message

### Need a major/minor version bump instead of patch
- Manually run in your terminal after merging:
  ```bash
  git checkout main && git pull
  npm version minor -m "chore: bump version to %s"
  # or: npm version major -m "chore: bump version to %s"
  git push origin main --follow-tags
  ```

### Want to release from a specific tag manually
- This still works as before:
  ```bash
  git tag v1.5.0
  git push origin v1.5.0
  ```

---

## Prerequisites (One-Time Setup)

These are only needed if you want to use the terminal. The GitHub website works without any setup.

### Install Homebrew (macOS)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Install GitHub CLI
```bash
brew install gh
gh auth login
```
Choose: GitHub.com → HTTPS → Login with browser

### Verify
```bash
gh auth status
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Release Claude's changes | Merge PR on github.com |
| Check build status | https://github.com/theMurfinator/braidr/actions |
| Create PR from terminal | `gh pr create --fill` |
| Merge PR from terminal | `gh pr merge --merge` |
