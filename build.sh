#!/bin/bash
~/go/bin/wails build -devtools "$@"

# Re-sign with entitlements so macOS remembers microphone permission across rebuilds
codesign --force --deep --sign - \
  --entitlements build/darwin/entitlements.plist \
  build/bin/Claudilandia.app
