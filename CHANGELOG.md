# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Open source release preparation
- MIT License
- Contributing guidelines
- Security policy

## [1.0.0] - 2025-01-30

### Added
- Multi-project workspace with custom colors and icons
- Terminal management with full PTY support (xterm.js)
- Claude CLI status detection and real-time activity display
- Git dashboard with diff viewer, commit history, and branch info
- Docker container monitoring and control
- Test dashboard with auto-detection and coverage tracking
- Remote terminal access via WebSocket
- ngrok tunnel integration for public remote access
- Token-based authentication with expiry and rate limiting
- Permanent approved devices support
- Claude tools panel for managing:
  - Agents
  - Skills
  - Commands
  - Hooks
  - MCP servers
- Project notes with Markdown support
- Browser preview with device emulation
- Screenshot capture and management
- Bookmarks per project
- Structured logging with sensitive data redaction
- Log rotation (3-day retention)

### Security
- Constant-time token comparison
- Rate limiting (50 attempts, 1 min lockout)
- Input validation for terminal resize
- CORS whitelist for localhost and ngrok domains
- Automatic sensitive data redaction in logs
