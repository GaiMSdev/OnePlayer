# OnePlayer — Session Handoff

## What is OnePlayer
A Safari Web Extension for YouTube (macOS) with three features:
1. **Auto-Pause** — Only one YouTube tab plays at a time, others pause automatically
2. **Sticky PiP** — Video enters Picture-in-Picture when you scroll past 75% of the player
3. **Manual PiP Button** — Overlay button on YouTube's video player to toggle PiP on demand

Price: $2 on the Mac App Store.

## Project structure
- **Bundle ID:** `GaiMS.OnePlayer` (app), `GaiMS.OnePlayer.Extension` (extension)
- **Team:** `WJ72K9ZA94`
- **Manifest V3** Safari Web Extension

### Key files
- `OnePlayer Extension/Resources/content.js` — Content script injected into YouTube. Handles: settings, auto-pause notifications, sticky PiP scroll logic, manual PiP overlay button, time save/restore, YouTube SPA navigation
- `OnePlayer Extension/Resources/background.js` — Service worker. Handles: cross-tab pause via `browser.scripting.executeScript`, content script injection, auto-refresh on install with position save + force pause
- `OnePlayer Extension/Resources/popup.html` + `popup.js` — Extension popup with three toggles (Auto-Pause, Sticky PiP, PiP Button on Player) and a Refresh YouTube Tabs button
- `OnePlayer Extension/Resources/manifest.json` — MV3, permissions: tabs, scripting, storage. Host: `*://*.youtube.com/*`
- `OnePlayer/ViewController.swift` — Mac app with programmatic WKWebView, loads Main.html setup page, uses `appBridge` message handler
- `OnePlayer/Resources/Base.lproj/Main.html` — Onboarding/setup page with 3-step instructions
- `OnePlayer/Base.lproj/Main.storyboard` — Cleaned up: no WKWebView in storyboard (created programmatically)

### Settings stored in `browser.storage.local`
- `pauseEnabled` (default: true)
- `pipEnabled` (default: true)
- `pipButtonEnabled` (default: true)

## What was done in this session

### Bug fixes
1. **Storyboard/ViewController conflict** — Removed duplicate WKWebView from storyboard (was creating two webviews)
2. **PiP API mismatch** — Changed from standard API (`document.exitPictureInPicture`) to webkit API (`webkitSetPresentationMode`) consistently for Safari
3. **PiP button click handler** — Fixed by using standard `requestPictureInPicture()` first with webkit fallback, removed `preventDefault()` that blocked Safari's user gesture detection
4. **Popup.js was corrupted** — Completely rewrote it (was missing functions, broken braces)
5. **Fake traffic lights removed** — Both popup.html and Main.html had fake macOS traffic light dots that created "window in window" appearance

### New features
1. **Manual PiP overlay button** on YouTube video player (top-right corner, visible on hover, toggles PiP)
2. **PiP Button toggle** in popup to show/hide the overlay button
3. **Auto-refresh on install** — When extension is installed/updated, saves video position in all YouTube tabs, reloads them, restores position, and pauses all videos
4. **Dark mode support** — Both popup and setup page support `prefers-color-scheme: dark`

### Cleanup
- Removed debug build IDs (`dbg-2026-04-20-1`)
- Removed unused `popup.css`
- Removed `_locales/en/messages.json` (hardcoded strings in manifest instead)
- Changed manifest description from Norwegian to English
- Removed WebKit2IBPlugin dependency from storyboard

## Current state
- **Builds successfully** with zero errors and zero warnings
- **Committed:** `741e920` on `main` — "Build complete OnePlayer Safari extension for YouTube"
- All three features working and tested by user

## What remains before App Store submission
1. **Fastlane is set up** at `fastlane/` with all metadata files populated — but fastlane CLI is NOT installed (system Ruby 2.6 too old). User needs: `brew install fastlane`
2. **Screenshots** — User has them ready, need to be placed in `fastlane/screenshots/en-US/` as .png (min 1280x800)
3. **Privacy URL + Support URL** — Empty in `fastlane/metadata/en-US/`, must be filled before submission
4. **Privacy Nutrition Labels** — Need to declare in App Store Connect (extension uses `browser.storage.local` for settings only, no analytics, no tracking)
5. **Archive + sign** with Apple Developer identity
6. **Submit for review**

## Uncommitted files
- `fastlane/` directory (metadata, Appfile, Deliverfile)
- `APP_STORE_COPY.md` update
- `OnePlayer.xcodeproj/xcuserdata/` (should stay untracked)
