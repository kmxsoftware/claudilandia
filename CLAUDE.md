# Claudilandia - Project Instructions

## Build & Run

When building and running the app, ALWAYS follow this sequence:

1. Kill any running instance first: `pkill -f "Claudilandia.app/Contents/MacOS/Claudilandia" 2>/dev/null || true`
2. Build: `bash build.sh`
3. Launch: `open build/bin/Claudilandia.app`

One-liner:
```bash
pkill -f "Claudilandia.app/Contents/MacOS/Claudilandia" 2>/dev/null; bash build.sh && open build/bin/Claudilandia.app
```

## Tech Stack

- **Backend**: Go + Wails v2
- **Frontend**: Vanilla JS (no framework)
- **Desktop**: macOS .app bundle
- **Terminal Integration**: iTerm2 via AppleScript + Python API bridge

## Key Conventions

- Wails event names use hyphens, not colons (e.g. `iterm-session-content`, NOT `iterm:session-content`)
- Frontend modules are in `frontend/src/modules/`
- Wails bindings are auto-generated during build in `frontend/wailsjs/`
- Python bridge script: `scripts/iterm2_bridge.py` with venv at `scripts/venv/`
