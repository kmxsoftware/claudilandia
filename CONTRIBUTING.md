# Contributing to Claudilandia

Thank you for your interest in contributing to Claudilandia! This document provides guidelines and information for contributors.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Set up the development environment (see README.md)
4. Create a feature branch from `main`

## Development Setup

```bash
# Install Wails CLI
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# Install frontend dependencies
cd frontend && npm install && cd ..

# Run in development mode
wails dev
```

## Code Style

### Go (Backend)

- Run `go fmt` before committing
- Follow standard Go conventions
- Use meaningful variable and function names
- Add comments for exported functions
- Handle errors explicitly

### JavaScript (Frontend)

- Use ES6+ features
- Keep modules focused and single-purpose
- Use descriptive function and variable names
- Avoid global state where possible

## Commit Messages

Use clear, descriptive commit messages:

```
feat: add remote terminal reconnection support
fix: resolve terminal resize issue on Windows
docs: update installation instructions
refactor: simplify state management logic
```

Prefixes:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

## Pull Request Process

1. **Create an issue first** - Discuss significant changes before implementing
2. **Keep PRs focused** - One feature or fix per PR
3. **Update documentation** - If your changes affect usage
4. **Test your changes** - Ensure the app builds and runs correctly
5. **Describe your changes** - Provide clear PR description

### PR Checklist

- [ ] Code follows project style guidelines
- [ ] `go fmt` has been run
- [ ] App builds without errors (`wails build`)
- [ ] Changes have been tested locally
- [ ] Documentation updated if needed

## Reporting Issues

When reporting bugs, please include:

- Operating system and version
- Go and Node.js versions
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable

## Feature Requests

For feature requests:

- Check existing issues first
- Describe the use case
- Explain why it would be valuable
- Consider if you'd like to implement it

## Project Structure

```
├── main.go              # App entry, Wails bootstrap
├── app.go               # Main App struct, all backend methods
├── internal/            # Backend packages
│   ├── terminal/        # PTY management
│   ├── docker/          # Docker integration
│   ├── git/             # Git operations
│   ├── claude/          # Claude CLI tools
│   ├── remote/          # WebSocket server
│   ├── state/           # State persistence
│   ├── testing/         # Test watcher
│   └── logging/         # Logging system
└── frontend/src/modules/ # Frontend feature modules
```

## Questions?

Feel free to open an issue for questions or reach out to the maintainer.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
