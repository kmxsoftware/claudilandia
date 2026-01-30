# Claudilandia

A powerful desktop companion app for [Claude Code](https://claude.ai/claude-code) developers. Manage multiple projects, terminals, git operations, Docker containers, and more - all in one place.

Built with [Wails](https://wails.io/) (Go + JavaScript).

## Features

- **Multi-Project Workspace** - Organize and switch between multiple projects with custom colors and icons
- **Terminal Management** - Multiple terminal tabs per project with full PTY support (xterm.js)
- **Claude CLI Integration** - Detects Claude Code CLI status and displays real-time activity
- **Git Dashboard** - View changed files, diffs, commit history, and branch info
- **Docker Integration** - Monitor and control containers for your projects
- **Test Dashboard** - Auto-detect test runs, track results, and monitor coverage trends
- **Remote Access** - Access your terminals remotely via WebSocket with ngrok tunnel support
- **Claude Tools Panel** - Manage agents, skills, commands, hooks, and MCP servers
- **Project Notes** - Markdown notes per project
- **Browser Preview** - Embedded browser with device emulation
- **Screenshots** - Capture and manage project screenshots

## Screenshots

*Coming soon*

## Requirements

- **Go** 1.24+
- **Node.js** 18+
- **Wails CLI** v2.11+

### Platform-specific

- **macOS**: Xcode Command Line Tools
- **Linux**: `gtk3`, `webkit2gtk` (see [Wails Linux Guide](https://wails.io/docs/gettingstarted/installation#linux))
- **Windows**: WebView2 (usually pre-installed on Windows 10/11)

## Installation

### From Source

1. Install Wails CLI:
   ```bash
   go install github.com/wailsapp/wails/v2/cmd/wails@latest
   ```

2. Clone the repository:
   ```bash
   git clone https://github.com/anthropics/claudilandia.git
   cd claudilandia
   ```

3. Install frontend dependencies:
   ```bash
   cd frontend && npm install && cd ..
   ```

4. Build the application:
   ```bash
   wails build
   ```

5. Run the built application from `build/bin/`

## Development

Run in development mode with hot-reload:

```bash
wails dev
```

This starts:
- Go backend with live reload
- Vite dev server for frontend at `http://localhost:34115`

## Project Structure

```
├── main.go              # Application entry point
├── app.go               # Main App struct with all exposed methods
├── internal/
│   ├── terminal/        # PTY terminal management
│   ├── docker/          # Docker API integration
│   ├── git/             # Git operations
│   ├── claude/          # Claude CLI detection & tools
│   ├── remote/          # WebSocket server for remote access
│   ├── state/           # Application state persistence
│   ├── testing/         # Test watcher & coverage
│   ├── structure/       # Project structure scanner
│   └── logging/         # Structured logging with rotation
├── frontend/
│   ├── src/
│   │   ├── main.js      # Frontend entry point
│   │   └── modules/     # Feature modules (terminal, git, docker, etc.)
│   └── package.json
├── build/               # Build configuration & output
└── wails.json           # Wails project configuration
```

## Remote Access

Claudilandia supports remote terminal access via WebSocket:

1. Enable remote access from the app
2. Optionally enable ngrok tunnel for public access
3. Share the generated URL with token
4. Access terminals from any browser

Security features:
- Token-based authentication with expiry
- Permanent approved devices support
- Rate limiting (50 attempts, 1 min lockout)
- Constant-time token comparison
- CORS whitelist (localhost, ngrok domains)

## Configuration

Application data is stored in:
- **macOS/Linux**: `~/.claudilandia/`
- **Windows**: `%USERPROFILE%\.claudilandia\`

This includes:
- `logs/` - Application logs (3-day retention)
- Project state and settings

## Tech Stack

**Backend:**
- Go 1.24
- Wails v2.11
- gorilla/websocket
- creack/pty
- Docker SDK

**Frontend:**
- Vanilla JavaScript (ES6 modules)
- xterm.js 6.0
- Vite 3.0
- marked (Markdown)
- highlight.js (syntax highlighting)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Author

**Karol Mroszczyk** - [karol.mroszczyk@gmail.com](mailto:karol.mroszczyk@gmail.com)
