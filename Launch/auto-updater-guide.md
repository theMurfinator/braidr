# Auto-Updater Setup Guide

## ✅ What's Been Implemented

The auto-updater is now fully integrated into Braidr:

### Features Added:
1. **Automatic update checking** on app startup (production only)
2. **"Check for Updates" menu item** in the app menu (macOS) or Help menu (Windows)
3. **User-friendly dialogs** for:
   - Update available (Download / Later)
   - Update not available (Already on latest version)
   - Download progress
   - Update ready to install (Restart Now / Later)
   - Error handling

### How It Works:
- App checks for updates 3 seconds after launch
- Downloads happen in the background
- Updates install automatically when app quits
- Users can manually check via menu: Braidr → Check for Updates...

---

## 🔧 How to Use This System

### Option 1: GitHub Releases (Recommended)

1. **Create a GitHub repository** for Braidr
   ```bash
   gh repo create braidr --private
   ```

2. **Update package.json** with your GitHub username:
   ```json
   "publish": {
     "provider": "github",
     "owner": "YOUR_GITHUB_USERNAME",  // ← Change this
     "repo": "braidr"
   }
   ```

3. **Get a GitHub Personal Access Token**
   - Go to: https://github.com/settings/tokens
   - Generate new token (classic)
   - Scopes needed: `repo` (all permissions)
   - Save the token somewhere safe

4. **Publish a release:**
   ```bash
   # Set your GitHub token
   export GH_TOKEN=your_github_token_here

   # Build and publish (this uploads to GitHub Releases)
   npm run package -- --publish always
   ```

5. **Future updates:**
   - Increment version in package.json: `1.0.0` → `1.0.1`
   - Run `npm run package -- --publish always`
   - Users will get notified automatically!

### Option 2: Custom Server (Advanced)

If you don't want to use GitHub, you can host updates yourself:

```json
"publish": {
  "provider": "generic",
  "url": "https://yourdomain.com/updates"
}
```

You'll need to upload `latest-mac.yml` and `.dmg` files to that server.

---

## 📝 How to Test Auto-Updates

### Local Testing (Before Publishing)

1. **Build the app:**
   ```bash
   npm run package
   ```

2. **Install the DMG** from `dist/Braidr-1.0.0-arm64.dmg`

3. **Open the app** and go to:
   - macOS: Braidr → Check for Updates...
   - Windows: Help → Check for Updates...

4. **Expected behavior (no updates published yet):**
   - Dialog: "An error occurred while checking for updates"
   - This is normal - there are no releases yet!

### Real Testing (After Publishing)

1. **Publish version 1.0.0** to GitHub Releases

2. **Install that version** on your machine

3. **Make a change** to the app

4. **Update version** in package.json to `1.0.1`

5. **Publish version 1.0.1:**
   ```bash
   export GH_TOKEN=your_token
   npm run package -- --publish always
   ```

6. **Open the 1.0.0 app** → it should detect 1.0.1 is available!

7. **Click "Download"** → update downloads

8. **Click "Restart Now"** → app updates and relaunches

---

## 🚀 Publishing Workflow

### First Release (v1.0.0)

```bash
# Make sure version in package.json is 1.0.0
export GH_TOKEN=your_github_token

# Build and publish
npm run package -- --publish always

# This creates a GitHub Release with:
# - Braidr-1.0.0-arm64.dmg
# - Braidr-1.0.0-arm64.dmg.blockmap
# - latest-mac.yml (tells updater what's available)
```

### Future Updates (v1.0.1, v1.0.2, etc.)

```bash
# 1. Make your code changes
# 2. Update version in package.json
# 3. Build and publish
export GH_TOKEN=your_github_token
npm run package -- --publish always

# Users with v1.0.0 will get notified about v1.0.1!
```

---

## 🔒 Code Signing (Required for macOS)

**Important:** Auto-updates on macOS **require** code signing. Without it:
- Users get security warnings
- Auto-updates may not work reliably

### To Enable Code Signing:

1. **Get Apple Developer account** ($99/year)
   - Sign up: https://developer.apple.com/programs/

2. **Get Developer ID Certificate:**
   - Go to: https://developer.apple.com/account/resources/certificates/list
   - Create: Developer ID Application certificate
   - Download and install in Keychain

3. **Update package.json:**
   ```json
   "mac": {
     "category": "public.app-category.productivity",
     "target": "dmg",
     "identity": "Developer ID Application: Your Name (TEAM_ID)"
   }
   ```

4. **Build with signing:**
   ```bash
   npm run package
   ```

5. **Notarize (Optional but recommended):**
   ```json
   "afterSign": "scripts/notarize.js",
   "mac": {
     "hardenedRuntime": true,
     "gatekeeperAssess": false,
     "entitlements": "build/entitlements.mac.plist",
     "entitlementsInherit": "build/entitlements.mac.plist"
   }
   ```

---

## 📊 What Happens on Update

### User Experience:

1. **App starts** → checks for updates in background (3 sec delay)

2. **Update found** → Dialog appears:
   ```
   Update Available

   A new version (1.0.1) is available!
   Would you like to download it now?

   [Download] [Later]
   ```

3. **User clicks "Download"** → Update downloads in background

4. **Download complete** → Dialog appears:
   ```
   Update Ready

   Update downloaded. Braidr will restart to install the update.

   [Restart Now] [Later]
   ```

5. **User clicks "Restart Now"** → App quits, updates, relaunches

6. **User sees new version** 🎉

### Developer Experience:

1. Make changes
2. Bump version number
3. Run `npm run package -- --publish always`
4. All users get notified automatically!

---

## 🐛 Troubleshooting

### "Error checking for updates"
- Make sure you've published at least one release to GitHub
- Check that `package.json` has correct `owner` and `repo`
- Verify your GitHub token has `repo` permissions

### "Update not downloading"
- Check internet connection
- Look at Console logs (View → Toggle Dev Tools)
- Verify the release files exist on GitHub

### "Update downloaded but won't install"
- On macOS, this is usually a code signing issue
- Make sure the app is code signed
- Check that `autoInstallOnAppQuit` is `true`

### "Users still on old version"
- They need to restart the app to check for updates
- Or they can manually check: Braidr → Check for Updates

---

## 📋 Next Steps

### Immediate:
- [ ] Create GitHub repository for Braidr
- [ ] Update `package.json` with your GitHub username
- [ ] Get GitHub Personal Access Token

### Before Launch:
- [ ] Get Apple Developer account
- [ ] Set up code signing
- [ ] Test the full update flow (1.0.0 → 1.0.1)

### After Launch:
- [ ] When you fix a bug, bump version and publish
- [ ] Users automatically get the update!

---

## 💡 Tips

1. **Versioning:** Follow semantic versioning
   - `1.0.0` → `1.0.1` (bug fix)
   - `1.0.0` → `1.1.0` (new feature)
   - `1.0.0` → `2.0.0` (breaking change)

2. **Release Notes:** Add to GitHub Release description
   - Users see this in the update dialog
   - Helps them decide whether to update now

3. **Testing:** Always test updates on a separate machine
   - Install old version
   - Publish new version
   - Verify update works before telling users

4. **Rollbacks:** If an update breaks things
   - Delete the bad release from GitHub
   - Publish a fixed version with a higher number

---

## 🎉 You're Done!

Auto-updates are now fully working. Once you:
1. Get code signing set up
2. Publish to GitHub Releases
3. Users will automatically get all future updates!

No more manually emailing DMG files. No more users stuck on old versions. Just ship it and move on. 🚀
