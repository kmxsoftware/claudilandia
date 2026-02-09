package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"projecthub/internal/claude"
	"projecthub/internal/docker"
	"projecthub/internal/git"
	"projecthub/internal/iterm"
	"projecthub/internal/logging"
	"projecthub/internal/remote"
	"projecthub/internal/state"
	"projecthub/internal/structure"
	"projecthub/internal/teams"
	"projecthub/internal/terminal"
	"projecthub/internal/testing"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx              context.Context
	terminalManager  *terminal.Manager
	dockerManager    *docker.Manager
	stateManager     *state.Manager
	gitManager       *git.Manager
	claudeDetector   *claude.Detector
	toolsManager     *claude.ToolsManager
	testWatcher      *testing.Watcher
	coverageWatcher  *testing.CoverageWatcher
	testScanner      *testing.TestScanner
	structureScanner *structure.Scanner
	remoteServer     *remote.Server
	ngrokTunnel      *remote.NgrokTunnel
	itermController  *iterm.Controller
	coverageStopChan chan struct{}
	teamsWatcher     *teams.Watcher
	teamsStopChan    chan struct{}
	voiceProcess     *exec.Cmd
	voiceStdin       io.WriteCloser
	voiceMu          sync.Mutex
	mu               sync.RWMutex
}

// NewApp creates a new App
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Initialize logger first
	if err := logging.InitDefault(); err != nil {
		fmt.Printf("Error initializing logger: %v\n", err)
	} else {
		logging.Info("Application starting", "version", "1.0.0")
	}

	// Initialize state manager first
	stateMgr, err := state.NewManager()
	if err != nil {
		logging.Error("Failed to initialize state manager", "error", err)
	} else {
		a.stateManager = stateMgr
		a.stateManager.SetContext(ctx)
		// Clear all terminals at startup (PTYs don't survive restart)
		a.stateManager.ClearAllTerminals()
	}

	// Initialize terminal manager
	a.terminalManager = terminal.NewManager()
	a.terminalManager.SetOutputHandler(a.onTerminalOutput)
	a.terminalManager.SetExitHandler(a.onTerminalExit)

	// Initialize docker manager
	dockerMgr, err := docker.NewManager()
	if err != nil {
		logging.Warn("Docker not available", "error", err)
	} else {
		a.dockerManager = dockerMgr
		logging.Info("Docker manager initialized")
	}

	// Initialize git manager
	a.gitManager = git.NewManager()

	// Initialize Claude CLI detector
	a.claudeDetector = claude.NewDetector()

	// Initialize tools manager for agents, skills, hooks
	a.toolsManager = claude.NewToolsManager()

	// Initialize test output watcher
	a.testWatcher = testing.NewWatcher()

	// Initialize coverage watcher
	a.coverageWatcher = testing.NewCoverageWatcher()
	a.coverageWatcher.SetUpdateHandler(func(projectPath string, summary *testing.CoverageSummary) {
		runtime.EventsEmit(a.ctx, "coverage-update", map[string]interface{}{
			"projectPath": projectPath,
			"summary":     summary,
		})
	})

	// Initialize structure scanner
	a.structureScanner = structure.NewScanner()

	// Initialize test scanner
	a.testScanner = testing.NewTestScanner()

	// Initialize iTerm2 controller (no polling - sync on demand only)
	a.itermController = iterm.NewController()
	logging.Info("iTerm2 controller initialized")

	// Attempt to initialize Python bridge for styled terminal content (non-blocking)
	go func() {
		execPath, _ := os.Executable()
		baseDir := filepath.Dir(execPath)
		logging.Info("Python bridge: executable dir", "baseDir", baseDir)

		// Candidate directories to search for scripts/
		candidates := []string{
			// macOS .app bundle: binary is at X.app/Contents/MacOS/Binary
			// project root is 5 levels up: MacOS -> Contents -> X.app -> bin -> build -> project
			filepath.Join(baseDir, "..", "..", "..", "..", "..", "scripts"),
			// Development: binary in build/bin/, project root is 2 up
			filepath.Join(baseDir, "..", "..", "scripts"),
			// Next to binary
			filepath.Join(baseDir, "scripts"),
		}

		var scriptPath, pythonPath string
		for _, dir := range candidates {
			sp := filepath.Join(dir, "iterm2_bridge.py")
			pp := filepath.Join(dir, "venv", "bin", "python3")
			logging.Info("Python bridge: trying", "script", sp, "python", pp)
			if _, err := os.Stat(sp); err == nil {
				if _, err := os.Stat(pp); err == nil {
					scriptPath = sp
					pythonPath = pp
					logging.Info("Python bridge: found at", "script", scriptPath)
					break
				} else {
					logging.Info("Python bridge: venv not found", "path", pp, "error", err)
				}
			} else {
				logging.Info("Python bridge: script not found", "path", sp)
			}
		}

		if scriptPath == "" {
			logging.Info("Python bridge script/venv not found, styled output unavailable")
			return
		}

		if err := a.itermController.InitPythonBridge(scriptPath, pythonPath); err != nil {
			logging.Info("Styled terminal output unavailable", "error", err)
		}
	}()

	// Start coverage polling in background (check every 5 seconds)
	a.coverageStopChan = make(chan struct{})
	go a.coverageWatcher.StartPolling(5*time.Second, a.coverageStopChan)

	// Initialize teams watcher (polling starts on-demand when tab is active)
	a.teamsWatcher = teams.NewWatcher()
	a.teamsWatcher.SetUpdateCallback(func(allTeams map[string]*teams.TeamSnapshot) {
		runtime.EventsEmit(a.ctx, "teams-update", allTeams)
	})

	// Restore window state after a short delay (needs window to be ready)
	const windowReadyDelay = 150 * time.Millisecond
	go func() {
		time.Sleep(windowReadyDelay)
		a.restoreWindowState()
	}()
}

// shutdown is called when the app is closing
func (a *App) shutdown(ctx context.Context) {
	// Save window state before closing
	a.saveWindowState()

	// Stop coverage watcher
	if a.coverageStopChan != nil {
		close(a.coverageStopChan)
	}
	// Stop teams watcher
	if a.teamsStopChan != nil {
		close(a.teamsStopChan)
	}
	// Stop iTerm2 polling, content watching, and Python bridge
	if a.itermController != nil {
		a.itermController.StopStyledContentWatching()
		a.itermController.StopPythonBridge()
		a.itermController.StopPolling()
	}
	if a.terminalManager != nil {
		a.terminalManager.CloseAll()
	}
	if a.dockerManager != nil {
		a.dockerManager.Close()
	}
	if a.stateManager != nil {
		a.stateManager.SaveSync()
	}
}

// Window position bounds for validation (supports multi-monitor setups)
const (
	minWindowX      = -5000 // Allow negative for left-side monitors
	maxWindowX      = 10000
	minWindowY      = -5000
	maxWindowY      = 10000
	minWindowWidth  = 400
	minWindowHeight = 300
)

// restoreWindowState restores the window position and size from saved state
func (a *App) restoreWindowState() {
	if a.stateManager == nil {
		return
	}

	ws := a.stateManager.GetWindowState()
	if ws == nil {
		logging.Debug("No window state to restore")
		return
	}

	// Restore maximized state first if set
	if ws.Maximized {
		runtime.WindowMaximise(a.ctx)
		logging.Info("Window state restored (maximized)")
		return
	}

	// Validate position is within reasonable bounds (supports multi-monitor)
	positionValid := ws.X >= minWindowX && ws.X <= maxWindowX &&
		ws.Y >= minWindowY && ws.Y <= maxWindowY

	// Validate size is reasonable
	sizeValid := ws.Width >= minWindowWidth && ws.Height >= minWindowHeight

	if positionValid {
		runtime.WindowSetPosition(a.ctx, ws.X, ws.Y)
	} else {
		logging.Warn("Skipping window position restore - out of bounds", "x", ws.X, "y", ws.Y)
	}

	if sizeValid {
		runtime.WindowSetSize(a.ctx, ws.Width, ws.Height)
	} else {
		logging.Warn("Skipping window size restore - invalid", "width", ws.Width, "height", ws.Height)
	}

	logging.Info("Window state restored", "x", ws.X, "y", ws.Y, "width", ws.Width, "height", ws.Height)
}

// saveWindowState saves the current window position and size
func (a *App) saveWindowState() {
	if a.stateManager == nil {
		return
	}

	maximized := runtime.WindowIsMaximised(a.ctx)

	var x, y, width, height int

	if maximized {
		// When maximized, try to preserve the previous non-maximized state
		existing := a.stateManager.GetWindowState()
		if existing != nil && !existing.Maximized {
			x, y = existing.X, existing.Y
			width, height = existing.Width, existing.Height
		} else {
			// Use current values as fallback
			x, y = runtime.WindowGetPosition(a.ctx)
			width, height = runtime.WindowGetSize(a.ctx)
		}
	} else {
		x, y = runtime.WindowGetPosition(a.ctx)
		width, height = runtime.WindowGetSize(a.ctx)
	}

	ws := &state.WindowState{
		X:         x,
		Y:         y,
		Width:     width,
		Height:    height,
		Maximized: maximized,
	}

	a.stateManager.SetWindowState(ws)
	logging.Info("Window state saved", "x", x, "y", y, "width", width, "height", height, "maximized", maximized)
}

// Terminal output/exit handlers - emit events to frontend with project context
func (a *App) onTerminalOutput(id string, data []byte) {
	// Analyze for Claude CLI status
	if a.claudeDetector != nil {
		status, changed := a.claudeDetector.Analyze(id, data)
		if changed && status != claude.StatusNone {
			if a.stateManager != nil {
				a.stateManager.EmitClaudeStatus(id, string(status))
			}
		}
	}

	// Analyze for test output
	if a.testWatcher != nil {
		summary, changed := a.testWatcher.Analyze(id, data)
		if changed && summary != nil {
			// Emit test status event to frontend
			runtime.EventsEmit(a.ctx, "test-status", map[string]interface{}{
				"terminalId": id,
				"summary":    summary,
			})
		}
	}

	// Send with project context
	encoded := base64.StdEncoding.EncodeToString(data)
	if a.stateManager != nil {
		a.stateManager.EmitTerminalOutput(id, encoded)
	}

	// Broadcast to remote clients
	if a.remoteServer != nil && a.remoteServer.IsRunning() {
		a.remoteServer.BroadcastOutput(id, encoded)
	}
}

func (a *App) onTerminalExit(id string) {
	// Clean up Claude detector state for this terminal
	if a.claudeDetector != nil {
		a.claudeDetector.RemoveTerminal(id)
		if a.stateManager != nil {
			a.stateManager.EmitClaudeStatus(id, string(claude.StatusNone))
		}
	}
	// Clean up test watcher state for this terminal
	if a.testWatcher != nil {
		a.testWatcher.RemoveTerminal(id)
	}
	if a.stateManager != nil {
		a.stateManager.EmitTerminalExit(id)
	}
}

// ============================================
// State Methods
// ============================================

// GetState returns the full application state
func (a *App) GetState() *state.AppState {
	if a.stateManager == nil {
		return state.NewAppState()
	}
	return a.stateManager.GetState()
}

// ============================================
// Project Methods
// ============================================

// GetProjects returns all projects
func (a *App) GetProjects() []*state.ProjectState {
	if a.stateManager == nil {
		return []*state.ProjectState{}
	}
	return a.stateManager.GetProjects()
}

// GetProject returns a project by ID
func (a *App) GetProject(id string) *state.ProjectState {
	if a.stateManager == nil {
		return nil
	}
	return a.stateManager.GetProject(id)
}

// CreateProject creates a new project
func (a *App) CreateProject(name, path string) (*state.ProjectState, error) {
	if a.stateManager == nil {
		return nil, fmt.Errorf("state manager not initialized")
	}
	return a.stateManager.CreateProject(name, path)
}

// UpdateProject updates a project
func (a *App) UpdateProject(p state.ProjectState) error {
	if a.stateManager == nil {
		return fmt.Errorf("state manager not initialized")
	}
	return a.stateManager.UpdateProject(&p)
}

// DeleteProject deletes a project
func (a *App) DeleteProject(id string) error {
	if a.stateManager == nil {
		return fmt.Errorf("state manager not initialized")
	}
	return a.stateManager.DeleteProject(id)
}

// SetActiveProject sets the currently active project
func (a *App) SetActiveProject(id string) {
	if a.stateManager != nil {
		a.stateManager.SetActiveProject(id)
	}
}

// GetActiveProject returns the active project ID
func (a *App) GetActiveProject() string {
	if a.stateManager == nil {
		return ""
	}
	return a.stateManager.GetActiveProjectID()
}

// SelectDirectory opens a directory picker
func (a *App) SelectDirectory() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Project Directory",
	})
}

// GetDefaultColors returns available colors
func (a *App) GetDefaultColors() []string {
	return state.DefaultColors
}

// GetDefaultIcons returns available icons
func (a *App) GetDefaultIcons() []string {
	return state.DefaultIcons
}

// ============================================
// Terminal Methods
// ============================================

// TerminalInfo for frontend (keeping for backward compatibility)
type TerminalInfo struct {
	ID        string `json:"id"`
	ProjectID string `json:"projectId"`
	Name      string `json:"name"`
	WorkDir   string `json:"workDir"`
	Running   bool   `json:"running"`
}

// CreateTerminal creates a new terminal for a project
func (a *App) CreateTerminal(projectID, name, workDir string) (*TerminalInfo, error) {
	if a.terminalManager == nil {
		return nil, fmt.Errorf("terminal manager not initialized")
	}
	if a.stateManager == nil {
		return nil, fmt.Errorf("state manager not initialized")
	}

	// Create in state manager first (generates unique name atomically if needed)
	termState, err := a.stateManager.CreateTerminal(projectID, name, workDir)
	if err != nil {
		return nil, err
	}

	// Create actual PTY terminal using the name from state (may have been auto-generated)
	term, err := a.terminalManager.CreateWithID(termState.ID, termState.Name, workDir)
	if err != nil {
		// Clean up state if PTY creation fails
		a.stateManager.DeleteTerminal(projectID, termState.ID)
		return nil, err
	}

	// Mark as running
	a.stateManager.SetTerminalRunning(projectID, termState.ID, true)

	// Broadcast updated terminal list to remote clients
	if a.remoteServer != nil && a.remoteServer.IsRunning() {
		a.remoteServer.BroadcastTerminalsList()
	}

	info := term.Info()
	return &TerminalInfo{
		ID:        info.ID,
		ProjectID: projectID,
		Name:      info.Name,
		WorkDir:   info.WorkDir,
		Running:   info.Running,
	}, nil
}

// GetTerminals returns all terminals (flat list for backward compatibility)
func (a *App) GetTerminals() []TerminalInfo {
	if a.terminalManager == nil {
		return []TerminalInfo{}
	}

	terms := a.terminalManager.List()
	result := make([]TerminalInfo, len(terms))
	for i, t := range terms {
		info := t.Info()
		projectID := ""
		if a.stateManager != nil {
			projectID, _ = a.stateManager.GetTerminalByID(info.ID)
		}
		result[i] = TerminalInfo{
			ID:        info.ID,
			ProjectID: projectID,
			Name:      info.Name,
			WorkDir:   info.WorkDir,
			Running:   info.Running,
		}
	}
	return result
}

// GetProjectTerminals returns terminals for a specific project
func (a *App) GetProjectTerminals(projectID string) []TerminalInfo {
	if a.stateManager == nil {
		return []TerminalInfo{}
	}

	terms := a.stateManager.GetProjectTerminals(projectID)
	result := make([]TerminalInfo, len(terms))
	for i, t := range terms {
		result[i] = TerminalInfo{
			ID:        t.ID,
			ProjectID: t.ProjectID,
			Name:      t.Name,
			WorkDir:   t.WorkDir,
			Running:   t.Running,
		}
	}
	return result
}

// WriteTerminal writes data to a terminal
func (a *App) WriteTerminal(id string, data string) error {
	if a.terminalManager == nil {
		return fmt.Errorf("terminal manager not initialized")
	}

	// Decode base64 data from frontend
	decoded, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		// If not base64, use raw string
		decoded = []byte(data)
	}

	return a.terminalManager.Write(id, decoded)
}

// ResizeTerminal resizes a terminal
func (a *App) ResizeTerminal(id string, rows, cols int) error {
	if a.terminalManager == nil {
		return fmt.Errorf("terminal manager not initialized")
	}
	return a.terminalManager.Resize(id, uint16(rows), uint16(cols))
}

// CloseTerminal closes a terminal
func (a *App) CloseTerminal(id string) error {
	if a.terminalManager == nil {
		return fmt.Errorf("terminal manager not initialized")
	}

	// Find project and clean up state
	if a.stateManager != nil {
		projectID, _ := a.stateManager.GetTerminalByID(id)
		if projectID != "" {
			a.stateManager.DeleteTerminal(projectID, id)
		}
	}

	err := a.terminalManager.Close(id)

	// Broadcast updated terminal list to remote clients
	if a.remoteServer != nil && a.remoteServer.IsRunning() {
		a.remoteServer.BroadcastTerminalsList()
	}

	return err
}

// SetActiveTerminal sets the active terminal for a project
func (a *App) SetActiveTerminal(projectID, terminalID string) {
	if a.stateManager != nil {
		a.stateManager.SetActiveTerminal(projectID, terminalID)
	}
}

// PauseTerminal pauses PTY output reading for flow control
func (a *App) PauseTerminal(id string) {
	if a.terminalManager != nil {
		a.terminalManager.Pause(id)
	}
}

// ResumeTerminal resumes PTY output reading for flow control
func (a *App) ResumeTerminal(id string) {
	if a.terminalManager != nil {
		a.terminalManager.Resume(id)
	}
}

// GetTerminalTheme returns the current terminal theme name
func (a *App) GetTerminalTheme() string {
	if a.stateManager == nil {
		return "dracula"
	}
	return a.stateManager.GetTerminalTheme()
}

// SetTerminalTheme sets the terminal theme for all terminals
func (a *App) SetTerminalTheme(themeName string) {
	if a.stateManager != nil {
		a.stateManager.SetTerminalTheme(themeName)
	}
}

// GetTerminalFontSize returns the current terminal font size
func (a *App) GetTerminalFontSize() int {
	if a.stateManager == nil {
		return 12
	}
	return a.stateManager.GetTerminalFontSize()
}

// SetTerminalFontSize sets the terminal font size for all terminals
func (a *App) SetTerminalFontSize(size int) {
	if a.stateManager != nil {
		a.stateManager.SetTerminalFontSize(size)
	}
}

// GetVoiceLang returns the saved voice input language
func (a *App) GetVoiceLang() string {
	if a.stateManager == nil {
		return "en-US"
	}
	return a.stateManager.GetVoiceLang()
}

// SetVoiceLang saves the voice input language
func (a *App) SetVoiceLang(lang string) {
	if a.stateManager != nil {
		a.stateManager.SetVoiceLang(lang)
	}
}

// GetVoiceAutoSubmit returns the saved voice auto-submit setting
func (a *App) GetVoiceAutoSubmit() bool {
	if a.stateManager == nil {
		return true
	}
	return a.stateManager.GetVoiceAutoSubmit()
}

// SetVoiceAutoSubmit saves the voice auto-submit setting
func (a *App) SetVoiceAutoSubmit(enabled bool) {
	if a.stateManager != nil {
		a.stateManager.SetVoiceAutoSubmit(enabled)
	}
}

// GetDashboardFullscreen returns the saved dashboard fullscreen state
func (a *App) GetDashboardFullscreen() bool {
	if a.stateManager == nil {
		return false
	}
	return a.stateManager.GetDashboardFullscreen()
}

// SetDashboardFullscreen saves the dashboard fullscreen state
func (a *App) SetDashboardFullscreen(enabled bool) {
	if a.stateManager != nil {
		a.stateManager.SetDashboardFullscreen(enabled)
	}
}

// GetToolsPanelHeight returns the saved tools panel height percentage
func (a *App) GetToolsPanelHeight() float64 {
	if a.stateManager == nil {
		return 40
	}
	return a.stateManager.GetToolsPanelHeight()
}

// SetToolsPanelHeight saves the tools panel height percentage
func (a *App) SetToolsPanelHeight(height float64) {
	if a.stateManager != nil {
		a.stateManager.SetToolsPanelHeight(height)
	}
}

// ============================================
// Pomodoro Timer Methods
// ============================================

// GetPomodoroSettings returns the saved pomodoro timer settings
func (a *App) GetPomodoroSettings() *state.PomodoroSettings {
	if a.stateManager == nil {
		return &state.PomodoroSettings{SessionMinutes: 25, BreakMinutes: 5}
	}
	return a.stateManager.GetPomodoroSettings()
}

// SavePomodoroSettings saves the pomodoro timer settings
func (a *App) SavePomodoroSettings(sessionMinutes, breakMinutes int) {
	if a.stateManager != nil {
		a.stateManager.SavePomodoroSettings(sessionMinutes, breakMinutes)
	}
}

// ============================================
// iTerm2 Integration Methods
// ============================================

// GetITermStatus returns the current iTerm2 status (running state and tabs)
func (a *App) GetITermStatus() *iterm.ITermStatus {
	if a.itermController == nil {
		return &iterm.ITermStatus{Running: false, Tabs: []iterm.ITermTab{}}
	}
	status, err := a.itermController.GetStatus()
	if err != nil {
		return &iterm.ITermStatus{Running: false, Tabs: []iterm.ITermTab{}}
	}
	return status
}

// LaunchITerm launches iTerm2 application
func (a *App) LaunchITerm() error {
	if a.itermController == nil {
		return fmt.Errorf("iTerm controller not initialized")
	}
	return a.itermController.LaunchITerm()
}

// SwitchITermTab switches to a specific tab in iTerm2
func (a *App) SwitchITermTab(windowID, tabIndex int) error {
	if a.itermController == nil {
		return fmt.Errorf("iTerm controller not initialized")
	}
	return a.itermController.SwitchTab(windowID, tabIndex)
}

// SwitchITermTabBySessionID switches to a tab by its session ID (more reliable)
func (a *App) SwitchITermTabBySessionID(sessionID string) error {
	if a.itermController == nil {
		return fmt.Errorf("iTerm controller not initialized")
	}
	return a.itermController.SwitchTabBySessionID(sessionID)
}

// RenameITermTab renames an iTerm2 tab
func (a *App) RenameITermTab(windowID, tabIndex int, newName string) error {
	if a.itermController == nil {
		return fmt.Errorf("iTerm controller not initialized")
	}
	return a.itermController.RenameTab(windowID, tabIndex, newName)
}

// RenameITermTabBySessionID renames an iTerm2 tab by session ID
func (a *App) RenameITermTabBySessionID(sessionID, newName string) error {
	if a.itermController == nil {
		return fmt.Errorf("iTerm controller not initialized")
	}
	return a.itermController.RenameTabBySessionID(sessionID, newName)
}

// CreateITermTab creates a new tab in iTerm2 at the specified directory with a name
func (a *App) CreateITermTab(workingDir, tabName string) error {
	if a.itermController == nil {
		return fmt.Errorf("iTerm controller not initialized")
	}
	return a.itermController.CreateTab(workingDir, tabName)
}

// CloseITermTab closes a specific tab in iTerm2
func (a *App) CloseITermTab(windowID, tabIndex int) error {
	if a.itermController == nil {
		return fmt.Errorf("iTerm controller not initialized")
	}
	return a.itermController.CloseTab(windowID, tabIndex)
}

// CloseITermTabBySessionID closes the tab containing a specific session
func (a *App) CloseITermTabBySessionID(sessionID string) error {
	if a.itermController == nil {
		return fmt.Errorf("iTerm controller not initialized")
	}
	return a.itermController.CloseTabBySessionID(sessionID)
}

// FocusITerm brings iTerm2 to the foreground
func (a *App) FocusITerm() error {
	if a.itermController == nil {
		return fmt.Errorf("iTerm controller not initialized")
	}
	return a.itermController.FocusITerm()
}

// WriteITermText writes text to the active iTerm2 session
func (a *App) WriteITermText(text string, pressEnter bool) error {
	if a.itermController == nil {
		return fmt.Errorf("iTerm controller not initialized")
	}
	return a.itermController.WriteText(text, pressEnter)
}

// GetITermSessionContents returns the last N lines from the active iTerm2 session
func (a *App) GetITermSessionContents(lines int) (string, error) {
	if a.itermController == nil {
		return "", fmt.Errorf("iTerm controller not initialized")
	}
	return a.itermController.GetSessionContents(lines)
}

// GetITermSessionInfo returns information about the active iTerm2 session
func (a *App) GetITermSessionInfo() (*iterm.SessionInfo, error) {
	if a.itermController == nil {
		return nil, fmt.Errorf("iTerm controller not initialized")
	}
	return a.itermController.GetSessionInfo()
}

// GetITermSessionContentsByID returns the last N lines from a specific iTerm2 session
func (a *App) GetITermSessionContentsByID(sessionID string, lines int) (string, error) {
	if a.itermController == nil {
		return "", fmt.Errorf("iTerm controller not initialized")
	}
	return a.itermController.GetSessionContentsByID(sessionID, lines)
}

// RequestStyledHistory requests styled scrollback history via Python bridge
func (a *App) RequestStyledHistory(sessionID string) error {
	if a.itermController == nil {
		return fmt.Errorf("iTerm controller not initialized")
	}
	return a.itermController.RequestStyledHistory(sessionID, func(content *iterm.StyledContent) {
		linesJSON, err := json.Marshal(content.Lines)
		if err != nil {
			return
		}
		runtime.EventsEmit(a.ctx, "iterm-session-history", map[string]interface{}{
			"sessionId": content.SessionID,
			"lines":     string(linesJSON),
		})
	})
}

// WriteITermTextBySessionID writes text to a specific iTerm2 session
func (a *App) WriteITermTextBySessionID(sessionID string, text string, pressEnter bool) error {
	if a.itermController == nil {
		return fmt.Errorf("iTerm controller not initialized")
	}
	return a.itermController.WriteTextBySessionID(sessionID, text, pressEnter)
}

// SendITermSpecialKey sends a special key sequence to a specific iTerm2 session
func (a *App) SendITermSpecialKey(sessionID string, key string) error {
	if a.itermController == nil {
		return fmt.Errorf("iTerm controller not initialized")
	}
	return a.itermController.SendSpecialKeyBySessionID(sessionID, key)
}

// WatchITermSession starts watching a session's styled content via Python bridge.
// Returns an error string if the bridge is not available.
func (a *App) WatchITermSession(sessionID string) string {
	logging.Info("WatchITermSession called", "sessionId", sessionID)
	if a.itermController == nil {
		return "ERROR: iTerm controller not initialized"
	}

	err := a.itermController.StartStyledContentWatching(
		sessionID,
		func(content *iterm.StyledContent) {
			linesJSON, err := json.Marshal(content.Lines)
			if err != nil {
				logging.Error("Failed to marshal styled lines", "error", err)
				return
			}
			runtime.EventsEmit(a.ctx, "iterm-session-styled-content", map[string]interface{}{
				"sessionId": content.SessionID,
				"lines":     string(linesJSON),
				"cursor":    map[string]interface{}{"x": content.Cursor.X, "y": content.Cursor.Y},
				"cols":      content.Cols,
				"rows":      content.Rows,
			})
		},
		func(profile *iterm.ProfileData) {
			runtime.EventsEmit(a.ctx, "iterm-session-profile", map[string]interface{}{
				"sessionId": profile.SessionID,
				"colors": map[string]interface{}{
					"fg":     profile.Colors.Fg,
					"bg":     profile.Colors.Bg,
					"cursor": profile.Colors.Cursor,
					"ansi":   profile.Colors.Ansi,
				},
			})
		},
	)

	if err != nil {
		logging.Warn("WatchITermSession failed", "error", err)
		return "ERROR: " + err.Error()
	}
	return ""
}

// UnwatchITermSession stops watching any session content
func (a *App) UnwatchITermSession() {
	if a.itermController == nil {
		return
	}
	a.itermController.StopStyledContentWatching()
}

// IsBridgeAvailable returns whether styled terminal rendering is available
func (a *App) IsBridgeAvailable() bool {
	if a.itermController == nil {
		return false
	}
	return a.itermController.IsBridgeAvailable()
}

// ============================================
// Voice Input Methods
// ============================================

// StartVoiceRecognition starts native macOS speech recognition.
// Returns "OK" on success or "ERROR: ..." on failure.
func (a *App) StartVoiceRecognition(lang string) string {
	a.voiceMu.Lock()
	defer a.voiceMu.Unlock()

	// Stop any existing voice process
	if a.voiceProcess != nil {
		if a.voiceStdin != nil {
			a.voiceStdin.Write([]byte("stop\n"))
			a.voiceStdin.Close()
		}
		a.voiceProcess.Wait()
		a.voiceProcess = nil
		a.voiceStdin = nil
	}

	// Find the voice_input binary using same candidate pattern as Python bridge
	execPath, _ := os.Executable()
	baseDir := filepath.Dir(execPath)
	candidates := []string{
		filepath.Join(baseDir, "..", "..", "..", "..", "..", "scripts", "voice_input"),
		filepath.Join(baseDir, "..", "..", "scripts", "voice_input"),
		filepath.Join(baseDir, "scripts", "voice_input"),
	}

	var binaryPath string
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			binaryPath = p
			break
		}
	}

	if binaryPath == "" {
		// Try to compile it
		sourceCandidates := []string{
			filepath.Join(baseDir, "..", "..", "..", "..", "..", "scripts", "voice_input.swift"),
			filepath.Join(baseDir, "..", "..", "scripts", "voice_input.swift"),
			filepath.Join(baseDir, "scripts", "voice_input.swift"),
		}
		var sourcePath string
		for _, p := range sourceCandidates {
			if _, err := os.Stat(p); err == nil {
				sourcePath = p
				break
			}
		}
		if sourcePath == "" {
			return "ERROR: voice_input.swift not found"
		}

		targetPath := sourcePath[:len(sourcePath)-6] // strip .swift
		logging.Info("Compiling voice_input", "source", sourcePath, "target", targetPath)
		cmd := exec.Command("swiftc", "-O", "-o", targetPath, sourcePath, "-framework", "Speech", "-framework", "AVFoundation")
		if out, err := cmd.CombinedOutput(); err != nil {
			return "ERROR: compile failed: " + string(out)
		}
		binaryPath = targetPath
	}

	if lang == "" {
		lang = "en-US"
	}
	logging.Info("Starting voice recognition", "binary", binaryPath, "lang", lang)
	cmd := exec.Command(binaryPath, lang)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "ERROR: " + err.Error()
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return "ERROR: " + err.Error()
	}

	if err := cmd.Start(); err != nil {
		return "ERROR: " + err.Error()
	}

	a.voiceProcess = cmd
	a.voiceStdin = stdin

	// Read stdout in goroutine, emit events to frontend
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			var msg map[string]interface{}
			if err := json.Unmarshal([]byte(line), &msg); err == nil {
				runtime.EventsEmit(a.ctx, "voice-transcript", msg)
			}
		}
		runtime.EventsEmit(a.ctx, "voice-stopped", nil)
	}()

	return "OK"
}

// StopVoiceRecognition stops the voice recognition process
func (a *App) StopVoiceRecognition() {
	a.voiceMu.Lock()
	defer a.voiceMu.Unlock()

	if a.voiceProcess != nil {
		if a.voiceStdin != nil {
			a.voiceStdin.Write([]byte("stop\n"))
			a.voiceStdin.Close()
			a.voiceStdin = nil
		}
		a.voiceProcess.Wait()
		a.voiceProcess = nil
	}
}

// ============================================
// Agent Teams Methods
// ============================================

// StartTeamsPolling starts polling for team changes (called when Teams tab is opened)
func (a *App) StartTeamsPolling() {
	if a.teamsWatcher == nil {
		return
	}
	if a.teamsStopChan != nil {
		return // already polling
	}
	a.teamsStopChan = make(chan struct{})
	go a.teamsWatcher.StartPolling(3*time.Second, a.teamsStopChan)
}

// StopTeamsPolling stops polling for team changes (called when Teams tab is closed)
func (a *App) StopTeamsPolling() {
	if a.teamsStopChan != nil {
		close(a.teamsStopChan)
		a.teamsStopChan = nil
	}
}

// GetAllTeams returns all currently active teams
func (a *App) GetAllTeams() map[string]*teams.TeamSnapshot {
	if a.teamsWatcher == nil {
		return nil
	}
	return a.teamsWatcher.GetAllTeams()
}

// GetTeamHistory returns archived/past teams
func (a *App) GetTeamHistory() []teams.TeamHistoryEntry {
	if a.teamsWatcher == nil {
		return nil
	}
	return a.teamsWatcher.GetHistory()
}

// ============================================
// Browser Methods
// ============================================

// UpdateBrowserState updates the browser state for a project
func (a *App) UpdateBrowserState(projectID string, url string, deviceIndex int, rotated bool, scale int) {
	if a.stateManager != nil {
		a.stateManager.UpdateBrowserState(projectID, url, deviceIndex, rotated, scale)
	}
}

// AddBookmark adds a bookmark to a project
func (a *App) AddBookmark(projectID, name, url string) (*state.Bookmark, error) {
	if a.stateManager == nil {
		return nil, fmt.Errorf("state manager not initialized")
	}
	return a.stateManager.AddBookmark(projectID, name, url)
}

// RemoveBookmark removes a bookmark from a project
func (a *App) RemoveBookmark(projectID, bookmarkID string) error {
	if a.stateManager == nil {
		return fmt.Errorf("state manager not initialized")
	}
	return a.stateManager.RemoveBookmark(projectID, bookmarkID)
}

// GetBookmarks returns all bookmarks for a project
func (a *App) GetBookmarks(projectID string) []state.Bookmark {
	if a.stateManager == nil {
		return []state.Bookmark{}
	}
	return a.stateManager.GetBookmarks(projectID)
}

// ============================================
// UI State Methods
// ============================================

// UpdateUIState updates UI state for a project
func (a *App) UpdateUIState(projectID string, activeTab string, splitView bool, splitRatio float64) {
	if a.stateManager != nil {
		a.stateManager.UpdateUIState(projectID, activeTab, splitView, splitRatio)
	}
}

// ============================================
// Test History Methods
// ============================================

// SaveTestHistory saves test run history for a project
func (a *App) SaveTestHistory(projectID string, history []state.TestRun) error {
	if a.stateManager == nil {
		return fmt.Errorf("state manager not initialized")
	}
	return a.stateManager.SaveTestHistory(projectID, history)
}

// GetTestHistory returns test run history for a project
func (a *App) GetTestHistory(projectID string) []state.TestRun {
	if a.stateManager == nil {
		return []state.TestRun{}
	}
	return a.stateManager.GetTestHistory(projectID)
}

// AddTestRun adds a single test run to project history
func (a *App) AddTestRun(projectID string, run state.TestRun) error {
	if a.stateManager == nil {
		return fmt.Errorf("state manager not initialized")
	}
	return a.stateManager.AddTestRun(projectID, run)
}

// ============================================
// Prompt Methods
// ============================================

// GetProjectPrompts returns all prompts for a project
func (a *App) GetProjectPrompts(projectID string) []state.Prompt {
	if a.stateManager == nil {
		return []state.Prompt{}
	}
	return a.stateManager.GetProjectPrompts(projectID)
}

// CreatePrompt creates a new prompt in a project
func (a *App) CreatePrompt(projectID string, prompt state.Prompt) (*state.Prompt, error) {
	if a.stateManager == nil {
		return nil, fmt.Errorf("state manager not initialized")
	}
	return a.stateManager.CreatePrompt(projectID, prompt)
}

// UpdatePrompt updates an existing prompt in a project
func (a *App) UpdatePrompt(projectID, promptID string, prompt state.Prompt) error {
	if a.stateManager == nil {
		return fmt.Errorf("state manager not initialized")
	}
	return a.stateManager.UpdatePrompt(projectID, promptID, prompt)
}

// DeletePrompt deletes a prompt from a project
func (a *App) DeletePrompt(projectID, promptID string) error {
	if a.stateManager == nil {
		return fmt.Errorf("state manager not initialized")
	}
	return a.stateManager.DeletePrompt(projectID, promptID)
}

// IncrementPromptUsage increments the usage count for a prompt
func (a *App) IncrementPromptUsage(projectID, promptID string, isGlobal bool) error {
	if a.stateManager == nil {
		return fmt.Errorf("state manager not initialized")
	}
	return a.stateManager.IncrementPromptUsage(projectID, promptID, isGlobal)
}

// TogglePromptPinned toggles the pinned status of a prompt
func (a *App) TogglePromptPinned(projectID, promptID string, isGlobal bool) error {
	if a.stateManager == nil {
		return fmt.Errorf("state manager not initialized")
	}
	return a.stateManager.TogglePromptPinned(projectID, promptID, isGlobal)
}

// GetGlobalPrompts returns all global prompts
func (a *App) GetGlobalPrompts() []state.Prompt {
	if a.stateManager == nil {
		return []state.Prompt{}
	}
	return a.stateManager.GetGlobalPrompts()
}

// CreateGlobalPrompt creates a new global prompt
func (a *App) CreateGlobalPrompt(prompt state.Prompt) (*state.Prompt, error) {
	if a.stateManager == nil {
		return nil, fmt.Errorf("state manager not initialized")
	}
	return a.stateManager.CreateGlobalPrompt(prompt)
}

// UpdateGlobalPrompt updates an existing global prompt
func (a *App) UpdateGlobalPrompt(promptID string, prompt state.Prompt) error {
	if a.stateManager == nil {
		return fmt.Errorf("state manager not initialized")
	}
	return a.stateManager.UpdateGlobalPrompt(promptID, prompt)
}

// DeleteGlobalPrompt deletes a global prompt
func (a *App) DeleteGlobalPrompt(promptID string) error {
	if a.stateManager == nil {
		return fmt.Errorf("state manager not initialized")
	}
	return a.stateManager.DeleteGlobalPrompt(promptID)
}

// GetPromptCategories returns all categories for a project
func (a *App) GetPromptCategories(projectID string) []state.PromptCategory {
	if a.stateManager == nil {
		return []state.PromptCategory{}
	}
	return a.stateManager.GetPromptCategories(projectID)
}

// GetGlobalPromptCategories returns all global categories
func (a *App) GetGlobalPromptCategories() []state.PromptCategory {
	if a.stateManager == nil {
		return []state.PromptCategory{}
	}
	return a.stateManager.GetGlobalPromptCategories()
}

// CreatePromptCategory creates a new prompt category
func (a *App) CreatePromptCategory(projectID, name string, isGlobal bool) (*state.PromptCategory, error) {
	if a.stateManager == nil {
		return nil, fmt.Errorf("state manager not initialized")
	}
	return a.stateManager.CreatePromptCategory(projectID, name, isGlobal)
}

// DeletePromptCategory deletes a prompt category
func (a *App) DeletePromptCategory(projectID, categoryID string, isGlobal bool) error {
	if a.stateManager == nil {
		return fmt.Errorf("state manager not initialized")
	}
	return a.stateManager.DeletePromptCategory(projectID, categoryID, isGlobal)
}

// ============================================
// Docker Methods
// ============================================

// IsDockerAvailable checks if Docker is available
func (a *App) IsDockerAvailable() bool {
	if a.dockerManager == nil {
		return false
	}
	return a.dockerManager.IsAvailable()
}

// GetContainers returns all containers
func (a *App) GetContainers(all bool) ([]docker.Container, error) {
	if a.dockerManager == nil {
		return nil, fmt.Errorf("docker not available")
	}
	return a.dockerManager.ListContainers(all)
}

// GetDockerProjectContainers returns containers for current project
func (a *App) GetDockerProjectContainers(projectName string) ([]docker.Container, error) {
	if a.dockerManager == nil {
		return nil, fmt.Errorf("docker not available")
	}
	return a.dockerManager.ListContainersForProject(projectName)
}

// StartContainer starts a container
func (a *App) StartContainer(id string) error {
	if a.dockerManager == nil {
		return fmt.Errorf("docker not available")
	}
	return a.dockerManager.StartContainer(id)
}

// StopContainer stops a container
func (a *App) StopContainer(id string) error {
	if a.dockerManager == nil {
		return fmt.Errorf("docker not available")
	}
	return a.dockerManager.StopContainer(id)
}

// RestartContainer restarts a container
func (a *App) RestartContainer(id string) error {
	if a.dockerManager == nil {
		return fmt.Errorf("docker not available")
	}
	return a.dockerManager.RestartContainer(id)
}

// GetContainerLogs gets container logs
func (a *App) GetContainerLogs(id string) (string, error) {
	if a.dockerManager == nil {
		return "", fmt.Errorf("docker not available")
	}
	return a.dockerManager.GetContainerLogs(id, 100)
}

// ============================================
// Git Methods
// ============================================

// IsGitRepo checks if a path is a git repository
func (a *App) IsGitRepo(path string) bool {
	if a.gitManager == nil {
		return false
	}
	return a.gitManager.IsGitRepo(path)
}

// GetGitChangedFiles returns list of changed files in repo
func (a *App) GetGitChangedFiles(path string) ([]git.ChangedFile, error) {
	if a.gitManager == nil {
		return nil, fmt.Errorf("git manager not initialized")
	}
	return a.gitManager.GetChangedFiles(path)
}

// GetGitFileDiff returns the diff for a specific file
func (a *App) GetGitFileDiff(repoPath, filePath string) (*git.FileDiff, error) {
	if a.gitManager == nil {
		return nil, fmt.Errorf("git manager not initialized")
	}
	return a.gitManager.GetFileDiff(repoPath, filePath)
}

// GetGitCurrentBranch returns the current branch name
func (a *App) GetGitCurrentBranch(path string) string {
	if a.gitManager == nil {
		return ""
	}
	return a.gitManager.GetCurrentBranch(path)
}

// GetGitStatus returns git status counts (staged, unstaged, untracked)
func (a *App) GetGitStatus(path string) map[string]int {
	if a.gitManager == nil {
		return map[string]int{"staged": 0, "unstaged": 0, "untracked": 0}
	}
	staged, unstaged, untracked := a.gitManager.GetStatus(path)
	return map[string]int{
		"staged":    staged,
		"unstaged":  unstaged,
		"untracked": untracked,
	}
}

// GetGitHistory returns commit history for a repository
func (a *App) GetGitHistory(path string, limit int) ([]git.CommitInfo, error) {
	if a.gitManager == nil {
		return nil, fmt.Errorf("git manager not initialized")
	}
	return a.gitManager.GetCommitHistory(path, limit)
}

// ============================================
// Claude Tools Methods (Agents, Libs, Skills, Hooks)
// ============================================

// GetProjectAgents returns agents from the project's .claude/agents/ directory
func (a *App) GetProjectAgents(projectPath string) []claude.Agent {
	if a.toolsManager == nil {
		return []claude.Agent{}
	}
	agents, _ := a.toolsManager.GetProjectAgents(projectPath)
	return agents
}

// GetGlobalAgents returns agents from ~/.claude/agents/
func (a *App) GetGlobalAgents() []claude.Agent {
	if a.toolsManager == nil {
		return []claude.Agent{}
	}
	agents, _ := a.toolsManager.GetGlobalAgents()
	return agents
}

// GetAgentContent reads the content of an agent file
func (a *App) GetAgentContent(path string) string {
	if a.toolsManager == nil {
		return ""
	}
	content, _ := a.toolsManager.GetAgentContent(path)
	return content
}

// SaveAgentContent saves content to an agent file
func (a *App) SaveAgentContent(path, content string) error {
	if a.toolsManager == nil {
		return fmt.Errorf("tools manager not initialized")
	}
	return a.toolsManager.SaveAgentContent(path, content)
}

// GetClaudemd reads the CLAUDE.md file from a project
func (a *App) GetClaudemd(projectPath string) string {
	claudemdPath := filepath.Join(projectPath, "CLAUDE.md")
	content, err := os.ReadFile(claudemdPath)
	if err != nil {
		// Return empty string if file doesn't exist
		return ""
	}
	return string(content)
}

// SaveClaudemd saves content to the CLAUDE.md file in a project
func (a *App) SaveClaudemd(projectPath, content string) error {
	claudemdPath := filepath.Join(projectPath, "CLAUDE.md")
	return os.WriteFile(claudemdPath, []byte(content), 0644)
}

// GetAvailableSkills returns skills from the Claude plugins marketplace
func (a *App) GetAvailableSkills() []claude.Skill {
	if a.toolsManager == nil {
		return []claude.Skill{}
	}
	skills, _ := a.toolsManager.GetAvailableSkills()
	return skills
}

// GetInstalledSkills returns the names of skills installed in the project
func (a *App) GetInstalledSkills(projectPath string) []string {
	if a.toolsManager == nil {
		return []string{}
	}
	skills, _ := a.toolsManager.GetInstalledSkills(projectPath)
	return skills
}

// InstallSkill copies a skill from the marketplace to the project
func (a *App) InstallSkill(projectPath, skillName string) error {
	if a.toolsManager == nil {
		return fmt.Errorf("tools manager not initialized")
	}
	return a.toolsManager.InstallSkill(projectPath, skillName)
}

// GetProjectHooks returns hooks configured in the project
func (a *App) GetProjectHooks(projectPath string) []claude.Hook {
	if a.toolsManager == nil {
		return []claude.Hook{}
	}
	hooks, _ := a.toolsManager.GetProjectHooks(projectPath)
	return hooks
}

// InstallHook adds a hook to the project's settings.json
func (a *App) InstallHook(projectPath, hookType string) error {
	if a.toolsManager == nil {
		return fmt.Errorf("tools manager not initialized")
	}
	return a.toolsManager.InstallHook(projectPath, hookType)
}

// GetProjectDependencies reads dependencies from package.json
func (a *App) GetProjectDependencies(projectPath string) map[string]string {
	if a.toolsManager == nil {
		return map[string]string{}
	}
	deps, _ := a.toolsManager.GetProjectDependencies(projectPath)
	return deps
}

// CheckLibraryStatus checks which libraries from a list are installed
func (a *App) CheckLibraryStatus(projectPath string, libs []string) []claude.LibStatus {
	if a.toolsManager == nil {
		return []claude.LibStatus{}
	}
	statuses, _ := a.toolsManager.CheckLibraryStatus(projectPath, libs)
	return statuses
}

// ============================================
// Commands Methods
// ============================================

// GetProjectCommands returns commands from the project's .claude/commands/ directory
func (a *App) GetProjectCommands(projectPath string) []claude.Command {
	if a.toolsManager == nil {
		return []claude.Command{}
	}
	commands, _ := a.toolsManager.GetProjectCommands(projectPath)
	return commands
}

// GetGlobalCommands returns commands from ~/.claude/commands/
func (a *App) GetGlobalCommands() []claude.Command {
	if a.toolsManager == nil {
		return []claude.Command{}
	}
	commands, _ := a.toolsManager.GetGlobalCommands()
	return commands
}

// GetCommandContent reads the content of a command file
func (a *App) GetCommandContent(path string) string {
	if a.toolsManager == nil {
		return ""
	}
	content, _ := a.toolsManager.GetCommandContent(path)
	return content
}

// SaveCommandContent saves content to a command file
func (a *App) SaveCommandContent(path, content string) error {
	if a.toolsManager == nil {
		return fmt.Errorf("tools manager not initialized")
	}
	return a.toolsManager.SaveCommandContent(path, content)
}

// CreateCommand creates a new command file in the project
func (a *App) CreateCommand(projectPath, name, content string) error {
	if a.toolsManager == nil {
		return fmt.Errorf("tools manager not initialized")
	}
	return a.toolsManager.CreateCommand(projectPath, name, content)
}

// DeleteCommand deletes a command file
func (a *App) DeleteCommand(path string) error {
	if a.toolsManager == nil {
		return fmt.Errorf("tools manager not initialized")
	}
	return a.toolsManager.DeleteCommand(path)
}

// ============================================
// MCP Methods
// ============================================

// GetProjectMCPServers returns MCP servers from the project's .mcp.json
func (a *App) GetProjectMCPServers(projectPath string) []claude.MCPServer {
	if a.toolsManager == nil {
		return []claude.MCPServer{}
	}
	servers, _ := a.toolsManager.GetProjectMCPServers(projectPath)
	return servers
}

// GetUserMCPServers returns MCP servers from ~/.claude.json
func (a *App) GetUserMCPServers() []claude.MCPServer {
	if a.toolsManager == nil {
		return []claude.MCPServer{}
	}
	servers, _ := a.toolsManager.GetUserMCPServers()
	return servers
}

// AddMCPServer adds a new MCP server to project config
func (a *App) AddMCPServer(projectPath string, server claude.MCPServer) error {
	if a.toolsManager == nil {
		return fmt.Errorf("tools manager not initialized")
	}
	return a.toolsManager.AddMCPServer(projectPath, server)
}

// RemoveMCPServer removes an MCP server from project config
func (a *App) RemoveMCPServer(projectPath, name string) error {
	if a.toolsManager == nil {
		return fmt.Errorf("tools manager not initialized")
	}
	return a.toolsManager.RemoveMCPServer(projectPath, name)
}

// ============================================
// Enhanced Hooks Methods
// ============================================

// GetProjectHooksDetailed returns hooks with full configuration
func (a *App) GetProjectHooksDetailed(projectPath string) []claude.HookEntry {
	if a.toolsManager == nil {
		return []claude.HookEntry{}
	}
	hooks, _ := a.toolsManager.GetProjectHooksDetailed(projectPath)
	return hooks
}

// AddHookEntry adds a new hook entry to project settings
func (a *App) AddHookEntry(projectPath string, hook claude.HookEntry) error {
	if a.toolsManager == nil {
		return fmt.Errorf("tools manager not initialized")
	}
	return a.toolsManager.AddHookEntry(projectPath, hook)
}

// AddHook adds a new hook to project settings (legacy)
func (a *App) AddHook(projectPath string, hook claude.Hook) error {
	if a.toolsManager == nil {
		return fmt.Errorf("tools manager not initialized")
	}
	return a.toolsManager.AddHook(projectPath, hook)
}

// RemoveHook removes a hook from project settings
func (a *App) RemoveHook(projectPath, hookType, matcher string) error {
	if a.toolsManager == nil {
		return fmt.Errorf("tools manager not initialized")
	}
	return a.toolsManager.RemoveHook(projectPath, hookType, matcher)
}

// GetHookScriptContent reads the content of a hook script file
func (a *App) GetHookScriptContent(projectPath, scriptPath string) string {
	if a.toolsManager == nil {
		return ""
	}
	content, _ := a.toolsManager.GetHookScriptContent(projectPath, scriptPath)
	return content
}

// GetProjectHookScripts returns list of hook scripts in .claude/hooks/ folder
func (a *App) GetProjectHookScripts(projectPath string) []string {
	if a.toolsManager == nil {
		return []string{}
	}
	scripts, _ := a.toolsManager.GetProjectHookScripts(projectPath)
	return scripts
}

// CreateHookScript creates a new hook script file in .claude/hooks/
func (a *App) CreateHookScript(projectPath, scriptName, content string) error {
	if a.toolsManager == nil {
		return fmt.Errorf("tools manager not initialized")
	}
	return a.toolsManager.CreateHookScript(projectPath, scriptName, content)
}

// DeleteHookScript deletes a hook script file
func (a *App) DeleteHookScript(projectPath, scriptName string) error {
	if a.toolsManager == nil {
		return fmt.Errorf("tools manager not initialized")
	}
	return a.toolsManager.DeleteHookScript(projectPath, scriptName)
}

// InstallTemplateHook installs a hook from template repo to project
func (a *App) InstallTemplateHook(projectPath string, hook claude.HookEntry) error {
	if a.toolsManager == nil {
		return fmt.Errorf("tools manager not initialized")
	}
	repoPath := a.toolsManager.GetTemplateRepoPath()
	return a.toolsManager.InstallTemplateHook(projectPath, hook, repoPath)
}

// ============================================
// Template Repository Methods
// ============================================

// GetTemplateRepoPath returns the path to the everything-claude-code repo
func (a *App) GetTemplateRepoPath() string {
	if a.toolsManager == nil {
		return ""
	}
	return a.toolsManager.GetTemplateRepoPath()
}

// GetTemplateAgents returns agents from the template repo
func (a *App) GetTemplateAgents() []claude.TemplateItem {
	if a.toolsManager == nil {
		return []claude.TemplateItem{}
	}
	repoPath := a.toolsManager.GetTemplateRepoPath()
	if repoPath == "" {
		return []claude.TemplateItem{}
	}
	agents, _ := a.toolsManager.GetTemplateAgents(repoPath)
	return agents
}

// GetTemplateCommands returns commands from the template repo
func (a *App) GetTemplateCommands() []claude.TemplateItem {
	if a.toolsManager == nil {
		return []claude.TemplateItem{}
	}
	repoPath := a.toolsManager.GetTemplateRepoPath()
	if repoPath == "" {
		return []claude.TemplateItem{}
	}
	commands, _ := a.toolsManager.GetTemplateCommands(repoPath)
	return commands
}

// GetTemplateSkills returns skills from the template repo
func (a *App) GetTemplateSkills() []claude.TemplateItem {
	if a.toolsManager == nil {
		return []claude.TemplateItem{}
	}
	repoPath := a.toolsManager.GetTemplateRepoPath()
	if repoPath == "" {
		return []claude.TemplateItem{}
	}
	skills, _ := a.toolsManager.GetTemplateSkills(repoPath)
	return skills
}

// GetTemplateRules returns rules from the template repo
func (a *App) GetTemplateRules() []claude.TemplateItem {
	if a.toolsManager == nil {
		return []claude.TemplateItem{}
	}
	repoPath := a.toolsManager.GetTemplateRepoPath()
	if repoPath == "" {
		return []claude.TemplateItem{}
	}
	rules, _ := a.toolsManager.GetTemplateRules(repoPath)
	return rules
}

// GetTemplateHooks returns hooks from the template repo
func (a *App) GetTemplateHooks() []claude.HookEntry {
	if a.toolsManager == nil {
		return []claude.HookEntry{}
	}
	repoPath := a.toolsManager.GetTemplateRepoPath()
	if repoPath == "" {
		return []claude.HookEntry{}
	}
	hooks, _ := a.toolsManager.GetTemplateHooks(repoPath)
	return hooks
}

// GetTemplateMCPServers returns MCP servers from the template repo
func (a *App) GetTemplateMCPServers() []claude.MCPServer {
	if a.toolsManager == nil {
		return []claude.MCPServer{}
	}
	repoPath := a.toolsManager.GetTemplateRepoPath()
	if repoPath == "" {
		return []claude.MCPServer{}
	}
	servers, _ := a.toolsManager.GetTemplateMCPServers(repoPath)
	return servers
}

// GetTemplateContent reads the content of a template file
func (a *App) GetTemplateContent(path string) string {
	if a.toolsManager == nil {
		return ""
	}
	content, _ := a.toolsManager.GetTemplateContent(path)
	return content
}

// InstallTemplateAgent installs an agent from template repo to project
func (a *App) InstallTemplateAgent(projectPath, templatePath string) error {
	if a.toolsManager == nil {
		return fmt.Errorf("tools manager not initialized")
	}
	return a.toolsManager.InstallTemplateAgent(projectPath, templatePath)
}

// InstallTemplateCommand installs a command from template repo to project
func (a *App) InstallTemplateCommand(projectPath, templatePath string) error {
	if a.toolsManager == nil {
		return fmt.Errorf("tools manager not initialized")
	}
	return a.toolsManager.InstallTemplateCommand(projectPath, templatePath)
}

// InstallTemplateSkill installs a skill from template repo to project
func (a *App) InstallTemplateSkill(projectPath, templatePath string) error {
	if a.toolsManager == nil {
		return fmt.Errorf("tools manager not initialized")
	}
	return a.toolsManager.InstallTemplateSkill(projectPath, templatePath)
}

// InstallTemplateRule installs a rule from template repo to project
func (a *App) InstallTemplateRule(projectPath, templatePath string) error {
	if a.toolsManager == nil {
		return fmt.Errorf("tools manager not initialized")
	}
	return a.toolsManager.InstallTemplateRule(projectPath, templatePath)
}

// ============================================
// Notes Methods
// ============================================

// SaveNotes saves notes for a project
func (a *App) SaveNotes(projectID, notes string) error {
	if a.stateManager == nil {
		return fmt.Errorf("state manager not initialized")
	}
	project := a.stateManager.GetProject(projectID)
	if project == nil {
		return fmt.Errorf("project not found")
	}
	project.Notes = notes
	return a.stateManager.UpdateProject(project)
}

// GetNotes returns notes for a project
func (a *App) GetNotes(projectID string) string {
	if a.stateManager == nil {
		return ""
	}
	project := a.stateManager.GetProject(projectID)
	if project == nil {
		return ""
	}
	return project.Notes
}

// ============================================
// Screenshot Methods
// ============================================

// Screenshot represents screenshot metadata
type Screenshot struct {
	ID        string `json:"id"`
	Filename  string `json:"filename"`
	Path      string `json:"path"`
	Timestamp int64  `json:"timestamp"`
}

// SaveScreenshot saves a screenshot for a project
func (a *App) SaveScreenshot(projectID, base64Data, filename string) (string, error) {
	// Get home directory
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %v", err)
	}

	// Create screenshots directory
	screenshotsDir := filepath.Join(homeDir, ".projecthub", "screenshots", projectID)
	if err := os.MkdirAll(screenshotsDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create screenshots directory: %v", err)
	}

	// Generate filename with timestamp if not provided
	if filename == "" {
		filename = fmt.Sprintf("screenshot_%d.png", time.Now().UnixMilli())
	}

	// Full path for the screenshot
	fullPath := filepath.Join(screenshotsDir, filename)

	// Decode base64 data
	data, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return "", fmt.Errorf("failed to decode screenshot data: %v", err)
	}

	// Write file
	if err := os.WriteFile(fullPath, data, 0644); err != nil {
		return "", fmt.Errorf("failed to save screenshot: %v", err)
	}

	return fullPath, nil
}

// GetScreenshots returns all screenshots for a project
func (a *App) GetScreenshots(projectID string) ([]Screenshot, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get home directory: %v", err)
	}

	screenshotsDir := filepath.Join(homeDir, ".projecthub", "screenshots", projectID)

	// Check if directory exists
	if _, err := os.Stat(screenshotsDir); os.IsNotExist(err) {
		return []Screenshot{}, nil
	}

	// Read directory
	entries, err := os.ReadDir(screenshotsDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read screenshots directory: %v", err)
	}

	var screenshots []Screenshot
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		// Only include PNG files
		if filepath.Ext(entry.Name()) != ".png" {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		fullPath := filepath.Join(screenshotsDir, entry.Name())
		screenshots = append(screenshots, Screenshot{
			ID:        entry.Name(),
			Filename:  entry.Name(),
			Path:      fullPath,
			Timestamp: info.ModTime().UnixMilli(),
		})
	}

	return screenshots, nil
}

// DeleteScreenshot deletes a screenshot
func (a *App) DeleteScreenshot(projectID, filename string) error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("failed to get home directory: %v", err)
	}

	fullPath := filepath.Join(homeDir, ".projecthub", "screenshots", projectID, filename)

	// Check if file exists
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		return fmt.Errorf("screenshot not found")
	}

	return os.Remove(fullPath)
}

// ============================================
// Browser Tabs Methods
// ============================================

// UpdateBrowserTabs updates browser tabs for a project
func (a *App) UpdateBrowserTabs(projectID string, tabs []state.BrowserTab, activeTabID string) error {
	if a.stateManager == nil {
		return fmt.Errorf("state manager not initialized")
	}
	return a.stateManager.UpdateBrowserTabs(projectID, tabs, activeTabID)
}

// ============================================
// Test Watcher Methods
// ============================================

// GetTestSummary returns the test summary for a specific terminal
func (a *App) GetTestSummary(terminalID string) *testing.TestSummary {
	if a.testWatcher == nil {
		return nil
	}
	return a.testWatcher.GetSummary(terminalID)
}

// GetAllTestSummaries returns test summaries for all terminals
func (a *App) GetAllTestSummaries() map[string]*testing.TestSummary {
	if a.testWatcher == nil {
		return make(map[string]*testing.TestSummary)
	}
	return a.testWatcher.GetAllSummaries()
}

// IsTestRunning returns true if tests are currently running in any terminal
func (a *App) IsTestRunning() bool {
	if a.testWatcher == nil {
		return false
	}
	return a.testWatcher.IsRunning()
}

// ResetTestState resets the test state for a terminal
func (a *App) ResetTestState(terminalID string) {
	if a.testWatcher != nil {
		a.testWatcher.ResetTerminal(terminalID)
	}
}

// ============================================
// Coverage Watcher Methods
// ============================================

// WatchProjectCoverage starts watching coverage for a project
func (a *App) WatchProjectCoverage(projectPath string) {
	if a.coverageWatcher != nil {
		a.coverageWatcher.WatchProject(projectPath)
	}
}

// UnwatchProjectCoverage stops watching coverage for a project
func (a *App) UnwatchProjectCoverage(projectPath string) {
	if a.coverageWatcher != nil {
		a.coverageWatcher.UnwatchProject(projectPath)
	}
}

// GetProjectCoverage returns coverage summary for a project
func (a *App) GetProjectCoverage(projectPath string) *testing.CoverageSummary {
	if a.coverageWatcher == nil {
		return nil
	}
	return a.coverageWatcher.GetCoverage(projectPath)
}

// GetProjectCoverageHistory returns coverage history for trending
func (a *App) GetProjectCoverageHistory(projectPath string) *testing.CoverageHistory {
	if a.coverageWatcher == nil {
		return nil
	}
	return a.coverageWatcher.GetHistory(projectPath)
}

// CheckProjectCoverage manually checks for coverage updates
func (a *App) CheckProjectCoverage(projectPath string) {
	if a.coverageWatcher != nil {
		a.coverageWatcher.WatchProject(projectPath) // This will check and emit if changed
	}
}

// ============================================
// Structure Scanner Methods
// ============================================

// GetProjectStructure returns the full file tree for a project (JS/TS files only)
func (a *App) GetProjectStructure(projectPath string) (*structure.FileNode, error) {
	if a.structureScanner == nil {
		return nil, fmt.Errorf("structure scanner not initialized")
	}
	return a.structureScanner.ScanProject(projectPath)
}

// GetProjectFolderHierarchy returns only the folder hierarchy (no files) for graph visualization
func (a *App) GetProjectFolderHierarchy(projectPath string) (*structure.FileNode, error) {
	if a.structureScanner == nil {
		return nil, fmt.Errorf("structure scanner not initialized")
	}
	return a.structureScanner.GetFolderHierarchy(projectPath)
}

// ReadFileContent reads and returns the content of a file
func (a *App) ReadFileContent(filePath string) (string, error) {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return "", err
	}
	return string(content), nil
}

// SaveFileContent saves content to a file
func (a *App) SaveFileContent(filePath string, content string) error {
	return os.WriteFile(filePath, []byte(content), 0644)
}

// ============================================
// Logging Methods
// ============================================

// Log receives log messages from the frontend and routes them through the centralized logger
func (a *App) Log(level, module, message string, data map[string]interface{}) {
	logging.LogFromFrontend(logging.LogEntry{
		Level:   level,
		Module:  module,
		Message: message,
		Data:    data,
	})
}

// IsDevMode returns whether the application is running in development mode
func (a *App) IsDevMode() bool {
	return logging.IsDevMode()
}

// ============================================
// Todo Methods
// ============================================

// GetTodos returns all todos for a project
func (a *App) GetTodos(projectID string) []state.TodoItem {
	if a.stateManager == nil {
		return []state.TodoItem{}
	}
	return a.stateManager.GetTodos(projectID)
}

// SaveTodos saves todos for a project
func (a *App) SaveTodos(projectID string, todos []state.TodoItem) error {
	if a.stateManager == nil {
		return fmt.Errorf("state manager not initialized")
	}
	return a.stateManager.SaveTodos(projectID, todos)
}

// ============================================
// Test Scanner Methods
// ============================================

// ScanProjectTests scans a project for test files and returns discovery info
func (a *App) ScanProjectTests(projectPath string) (*testing.TestDiscovery, error) {
	if a.testScanner == nil {
		return nil, fmt.Errorf("test scanner not initialized")
	}
	return a.testScanner.ScanProjectTests(projectPath)
}

// GetTestDiscovery returns cached test discovery or scans if needed
func (a *App) GetTestDiscovery(projectPath string) (*testing.TestDiscovery, error) {
	if a.testScanner == nil {
		return nil, fmt.Errorf("test scanner not initialized")
	}
	return a.testScanner.GetTestDiscovery(projectPath)
}

// ClearTestDiscoveryCache clears the test discovery cache for a project
func (a *App) ClearTestDiscoveryCache(projectPath string) {
	if a.testScanner != nil {
		a.testScanner.ClearCache(projectPath)
	}
}

// GetPackageJSONScripts returns scripts from project's package.json
func (a *App) GetPackageJSONScripts(projectPath string) (map[string]string, error) {
	return testing.GetPackageJSONScripts(projectPath)
}

// ============================================
// Remote Access Methods
// ============================================

// RemoteAccessStatus represents the status of remote access
type RemoteAccessStatus struct {
	Enabled          bool                `json:"enabled"`
	SavedDevicesOnly bool                `json:"savedDevicesOnly"`
	Running          bool                `json:"running"`
	Port             int                 `json:"port"`
	LocalURL         string              `json:"localUrl"`
	PublicURL        string              `json:"publicUrl"`
	Token            string              `json:"token"`
	ClientCount      int                 `json:"clientCount"`
	Clients          []remote.ClientInfo `json:"clients"`
}

// StartRemoteAccess starts the remote access server with optional ngrok tunnel
func (a *App) StartRemoteAccess(config remote.Config) (*RemoteAccessStatus, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	// Validate config (logs warnings if defaults applied)
	if validationErr := config.Validate(); validationErr != nil {
		logging.Warn("Remote config validation warnings", "warnings", validationErr.Error())
	}

	// Initialize remote server if needed
	if a.remoteServer == nil {
		a.remoteServer = remote.NewServer(a.itermController)
		a.remoteServer.SetProjectHandler(&remoteProjectHandler{app: a})
		a.setupApprovedClientsCallback()
		a.loadApprovedClients()
	}

	var token string
	var localURL string
	var publicURL string

	// Generate token only if not using saved devices only mode
	if config.SavedDevicesOnly {
		// No new token - only approved clients can connect
		// Check if we have any approved clients
		approvedClients := a.GetApprovedClients()
		if len(approvedClients) == 0 {
			return nil, fmt.Errorf("no saved devices configured - add a device first")
		}
		token = "" // No temporary token
		localURL = fmt.Sprintf("http://localhost:%d/", config.Port)
	} else {
		// Generate temporary token
		tokenDuration := time.Duration(config.TokenExpiry) * time.Hour
		var err error
		token, err = a.remoteServer.GenerateToken(tokenDuration)
		if err != nil {
			return nil, fmt.Errorf("failed to generate access token: %w", err)
		}
		localURL = fmt.Sprintf("http://localhost:%d/?token=%s", config.Port, token)
	}

	// Start server in goroutine
	go func() {
		if err := a.remoteServer.Start(config.Port); err != nil {
			logging.Error("Remote server error", "error", err)
		}
	}()

	// Wait for server to be ready
	time.Sleep(100 * time.Millisecond)

	// Start ngrok tunnel if requested
	if config.Enabled {
		if a.ngrokTunnel == nil {
			a.ngrokTunnel = remote.NewNgrokTunnel()
		}

		ngrokURL, err := a.ngrokTunnel.Start(config)
		if err != nil {
			logging.Warn("Failed to start ngrok tunnel", "error", err)
		} else {
			if config.SavedDevicesOnly {
				publicURL = ngrokURL + "/"
			} else {
				publicURL = ngrokURL + "/?token=" + token
			}
		}
	}

	logging.Info("Remote access started",
		"port", config.Port,
		"savedDevicesOnly", config.SavedDevicesOnly,
		"localUrl", localURL,
		"publicUrl", publicURL,
	)

	return &RemoteAccessStatus{
		Enabled:         config.Enabled,
		SavedDevicesOnly: config.SavedDevicesOnly,
		Running:         true,
		Port:            config.Port,
		LocalURL:        localURL,
		PublicURL:       publicURL,
		Token:           token,
		ClientCount:     0,
		Clients:         []remote.ClientInfo{},
	}, nil
}

// StopRemoteAccess stops the remote access server and ngrok tunnel
func (a *App) StopRemoteAccess() error {
	a.mu.Lock()
	defer a.mu.Unlock()

	var lastErr error

	// Stop ngrok tunnel
	if a.ngrokTunnel != nil {
		if err := a.ngrokTunnel.Stop(); err != nil {
			logging.Error("Failed to stop ngrok", "error", err)
			lastErr = err
		}
	}

	// Stop remote server
	if a.remoteServer != nil {
		if err := a.remoteServer.Stop(); err != nil {
			logging.Error("Failed to stop remote server", "error", err)
			lastErr = err
		}
	}

	logging.Info("Remote access stopped")
	return lastErr
}

// GetRemoteAccessStatus returns the current remote access status
func (a *App) GetRemoteAccessStatus() *RemoteAccessStatus {
	a.mu.RLock()
	defer a.mu.RUnlock()

	status := &RemoteAccessStatus{
		Enabled:    false,
		Running:    false,
		Port:       9090,
		LocalURL:   "",
		PublicURL:  "",
		Token:      "",
		ClientCount: 0,
		Clients:    []remote.ClientInfo{},
	}

	if a.remoteServer != nil && a.remoteServer.IsRunning() {
		status.Running = true
		status.Port = a.remoteServer.GetPort()
		status.Token = a.remoteServer.GetToken()
		status.LocalURL = fmt.Sprintf("http://localhost:%d/?token=%s", status.Port, status.Token)
		status.Clients = a.remoteServer.GetClients()
		status.ClientCount = len(status.Clients)

		if a.ngrokTunnel != nil && a.ngrokTunnel.IsRunning() {
			status.Enabled = true
			status.PublicURL = a.ngrokTunnel.GetPublicURL() + "/?token=" + status.Token
		}
	}

	return status
}

// GetRemoteAccessClients returns list of connected remote clients
func (a *App) GetRemoteAccessClients() []remote.ClientInfo {
	if a.remoteServer == nil {
		return []remote.ClientInfo{}
	}
	return a.remoteServer.GetClients()
}

// RefreshNgrokURL refreshes the ngrok public URL
func (a *App) RefreshNgrokURL() (string, error) {
	if a.ngrokTunnel == nil || !a.ngrokTunnel.IsRunning() {
		return "", fmt.Errorf("ngrok tunnel not running")
	}
	return a.ngrokTunnel.RefreshURL()
}

// ============================================
// Approved Clients (Permanent Tokens)
// ============================================

// AddApprovedClient creates a new permanent token for an approved client
func (a *App) AddApprovedClient(name string) (*remote.ApprovedClient, error) {
	// Generate token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}
	token := hex.EncodeToString(tokenBytes)

	now := time.Now()
	client := &remote.ApprovedClient{
		Token:     token,
		Name:      name,
		CreatedAt: now,
		LastUsed:  now,
	}

	// Save to state (persistent)
	stateClients := a.stateManager.GetApprovedClients()
	stateClients = append(stateClients, &state.ApprovedRemoteClient{
		Token:     client.Token,
		Name:      client.Name,
		CreatedAt: client.CreatedAt,
		LastUsed:  client.LastUsed,
	})
	a.stateManager.SetApprovedClients(stateClients)

	// Also add to remote server if it's running
	if a.remoteServer != nil {
		a.remoteServer.SetApprovedClients(a.getRemoteApprovedClients())
	}

	logging.Info("Approved client added", "name", name)
	return client, nil
}

// RemoveApprovedClient removes an approved client by token
func (a *App) RemoveApprovedClient(token string) {
	// Remove from state (persistent)
	stateClients := a.stateManager.GetApprovedClients()
	filtered := make([]*state.ApprovedRemoteClient, 0)
	for _, c := range stateClients {
		if c.Token != token {
			filtered = append(filtered, c)
		}
	}
	a.stateManager.SetApprovedClients(filtered)

	// Also remove from remote server if it's running
	if a.remoteServer != nil {
		a.remoteServer.SetApprovedClients(a.getRemoteApprovedClients())
	}

	logging.Info("Approved client removed")
}

// GetApprovedClients returns all approved clients from persistent state
func (a *App) GetApprovedClients() []*remote.ApprovedClient {
	stateClients := a.stateManager.GetApprovedClients()
	result := make([]*remote.ApprovedClient, len(stateClients))
	for i, c := range stateClients {
		result[i] = &remote.ApprovedClient{
			Token:     c.Token,
			Name:      c.Name,
			CreatedAt: c.CreatedAt,
			LastUsed:  c.LastUsed,
		}
	}
	return result
}

// getRemoteApprovedClients converts state clients to remote clients
func (a *App) getRemoteApprovedClients() []*remote.ApprovedClient {
	return a.GetApprovedClients()
}

// setupApprovedClientsCallback sets up callback for persistence
// Note: This syncs changes from remoteServer back to state (e.g., lastUsed updates)
func (a *App) setupApprovedClientsCallback() {
	if a.remoteServer != nil {
		a.remoteServer.SetApprovedChangeCallback(func() {
			// Sync remote server state back to persistent state
			remoteClients := a.remoteServer.GetApprovedClients()
			stateClients := make([]*state.ApprovedRemoteClient, len(remoteClients))
			for i, c := range remoteClients {
				stateClients[i] = &state.ApprovedRemoteClient{
					Token:     c.Token,
					Name:      c.Name,
					CreatedAt: c.CreatedAt,
					LastUsed:  c.LastUsed,
				}
			}
			a.stateManager.SetApprovedClients(stateClients)
		})
	}
}

// loadApprovedClients loads approved clients from state into remote server
func (a *App) loadApprovedClients() {
	if a.remoteServer == nil {
		return
	}
	// Load from state and sync to remote server
	a.remoteServer.SetApprovedClients(a.getRemoteApprovedClients())
}

// ============================================
// ProjectHandler Implementation for Remote Access
// ============================================

// RemoteGetProjects implements remote.ProjectHandler.GetProjects
func (a *App) RemoteGetProjects() []remote.ProjectInfo {
	if a.stateManager == nil {
		return []remote.ProjectInfo{}
	}

	projects := a.stateManager.GetProjects()
	result := make([]remote.ProjectInfo, 0, len(projects))

	for _, p := range projects {
		projectInfo := remote.ProjectInfo{
			ID:        p.ID,
			Name:      p.Name,
			Path:      p.Path,
			Color:     p.Color,
			Icon:      p.Icon,
			Terminals: make([]remote.TerminalInfo, 0),
		}

		// Get terminals for this project
		for _, t := range p.Terminals {
			running := false
			if a.terminalManager != nil {
				if term := a.terminalManager.Get(t.ID); term != nil {
					running = term.Info().Running
				}
			}

			projectInfo.Terminals = append(projectInfo.Terminals, remote.TerminalInfo{
				ID:        t.ID,
				ProjectID: p.ID,
				Name:      t.Name,
				WorkDir:   t.WorkDir,
				Running:   running,
			})
		}

		result = append(result, projectInfo)
	}

	return result
}

// RemoteCreateTerminal implements remote.ProjectHandler.CreateTerminal
func (a *App) RemoteCreateTerminal(projectID, name string) (*remote.TerminalInfo, error) {
	if a.stateManager == nil {
		return nil, fmt.Errorf("state manager not initialized")
	}

	project := a.stateManager.GetProject(projectID)
	if project == nil {
		return nil, fmt.Errorf("project not found: %s", projectID)
	}

	// Create terminal using existing method
	termInfo, err := a.CreateTerminal(projectID, name, project.Path)
	if err != nil {
		return nil, err
	}

	return &remote.TerminalInfo{
		ID:        termInfo.ID,
		ProjectID: termInfo.ProjectID,
		Name:      termInfo.Name,
		WorkDir:   termInfo.WorkDir,
		Running:   termInfo.Running,
	}, nil
}

// RemoteRenameTerminal implements remote.ProjectHandler.RenameTerminal
func (a *App) RemoteRenameTerminal(projectID, terminalID, name string) error {
	if a.stateManager == nil {
		return fmt.Errorf("state manager not initialized")
	}

	return a.stateManager.RenameTerminal(projectID, terminalID, name)
}

// RemoteDeleteTerminal implements remote.ProjectHandler.DeleteTerminal
func (a *App) RemoteDeleteTerminal(projectID, terminalID string) error {
	return a.CloseTerminal(terminalID)
}

// remoteProjectHandler wraps App to implement remote.ProjectHandler interface
type remoteProjectHandler struct {
	app *App
}

func (h *remoteProjectHandler) GetProjects() []remote.ProjectInfo {
	return h.app.RemoteGetProjects()
}

func (h *remoteProjectHandler) CreateTerminal(projectID, name string) (*remote.TerminalInfo, error) {
	return h.app.RemoteCreateTerminal(projectID, name)
}

func (h *remoteProjectHandler) RenameTerminal(projectID, terminalID, name string) error {
	return h.app.RemoteRenameTerminal(projectID, terminalID, name)
}

func (h *remoteProjectHandler) DeleteTerminal(projectID, terminalID string) error {
	return h.app.RemoteDeleteTerminal(projectID, terminalID)
}
