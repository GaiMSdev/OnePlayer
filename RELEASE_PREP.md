# OnePlayer Release Prep

## Current status
- App builds successfully in Xcode.
- Release archive succeeds.
- Project is already set up with:
  - macOS app target
  - Safari extension target
  - App Store-friendly bundle structure
  - automatic signing team configured
  - sandbox + hardened runtime enabled
  - app icon assets present

## What has already been verified
- `xcodebuild build` succeeds for Debug.
- `xcodebuild archive` succeeds for Release with signing disabled in dry-run mode.
- The app bundle and embedded extension validate correctly in the archive flow.

## Important IDs
- Main app bundle ID: `GaiMS.OnePlayer`
- Safari extension bundle ID: `GaiMS.OnePlayer.Extension`
- Development team: `WJ72K9ZA94`

## What is still required before App Store submission
1. Final signing with the correct Apple Developer identity
2. App Store Connect app record / metadata
3. Screenshots
4. Privacy details
5. Final review of extension behavior under App Store rules
6. User to press Publish manually

## Dry-run archive command
```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project '/Users/robert/Xcode Prosjekter/OnePlayer/OnePlayer.xcodeproj' \
  -scheme 'OnePlayer' \
  -configuration Release \
  archive \
  -archivePath '/Users/robert/Library/Developer/Xcode/Archives/OnePlayer.xcarchive'
```

## Brutal truth
OnePlayer is now in the right shape for release prep.
It is **not** ready to publish until the remaining signing and App Store metadata steps are done.
