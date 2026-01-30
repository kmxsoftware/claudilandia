#!/bin/bash
# Build script for Claudilandia with custom icon

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Building Claudilandia..."
cd "$PROJECT_DIR"

# Build with Wails
WAILS="${WAILS:-/Users/karol/go/bin/wails}"
"$WAILS" build

# Copy custom icon (Wails generates a different one)
if [ -f "$PROJECT_DIR/build/appicon.icns" ]; then
    cp "$PROJECT_DIR/build/appicon.icns" "$PROJECT_DIR/build/bin/Claudilandia.app/Contents/Resources/iconfile.icns"
    echo "✓ Custom icon installed"
fi

# Touch app bundle to invalidate icon cache
touch "$PROJECT_DIR/build/bin/Claudilandia.app"

echo "✓ Build complete: $PROJECT_DIR/build/bin/Claudilandia.app"
