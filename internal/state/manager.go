package state

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Default colors and icons for projects
var DefaultColors = []string{
	"#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
	"#f97316", "#eab308", "#22c55e", "#14b8a6",
	"#06b6d4", "#3b82f6",
}

var DefaultIcons = []string{
	"📁", "🚀", "⚡", "🔧", "💻",
	"🌐", "📱", "🎮", "🔬", "📊",
}

// Manager manages the centralized application state
type Manager struct {
	ctx       context.Context
	state     *AppState
	statePath string
	mu        sync.RWMutex

	// Debounced save
	saveTimer *time.Timer
	saveMu    sync.Mutex
}

// NewManager creates a new state manager
func NewManager() (*Manager, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	configDir := filepath.Join(homeDir, ".projecthub")
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return nil, err
	}

	m := &Manager{
		state:     NewAppState(),
		statePath: filepath.Join(configDir, "state.json"),
	}

	// Load existing state or migrate from old format
	if err := m.load(); err != nil {
		return nil, err
	}

	return m, nil
}

// SetContext sets the Wails context for event emission
func (m *Manager) SetContext(ctx context.Context) {
	m.ctx = ctx
}

func (m *Manager) load() error {
	// Try to load new state format
	data, err := os.ReadFile(m.statePath)
	if err == nil {
		var state AppState
		if err := json.Unmarshal(data, &state); err == nil {
			m.state = &state
			// Ensure maps are initialized
			if m.state.Projects == nil {
				m.state.Projects = make(map[string]*ProjectState)
			}
			// Ensure global prompts are initialized
			if m.state.GlobalPrompts == nil {
				m.state.GlobalPrompts = []Prompt{}
			}
			if m.state.GlobalPromptCategories == nil {
				m.state.GlobalPromptCategories = []PromptCategory{}
			}
			for _, p := range m.state.Projects {
				if p.Terminals == nil {
					p.Terminals = make(map[string]*TerminalState)
				}
				if p.EnvVars == nil {
					p.EnvVars = make(map[string]string)
				}
				if p.Browser == nil {
					p.Browser = &BrowserState{Scale: 100}
				}
				if p.Prompts == nil {
					p.Prompts = []Prompt{}
				}
				if p.PromptCategories == nil {
					p.PromptCategories = []PromptCategory{}
				}
				if p.Todos == nil {
					p.Todos = []TodoItem{}
				}
			}
			return nil
		}
	}

	// Try to migrate from old projects.json format
	homeDir, _ := os.UserHomeDir()
	oldPath := filepath.Join(homeDir, ".projecthub", "projects.json")
	if err := m.migrateFromOldFormat(oldPath); err == nil {
		return m.saveImmediate()
	}

	return nil
}

func (m *Manager) migrateFromOldFormat(oldPath string) error {
	data, err := os.ReadFile(oldPath)
	if err != nil {
		return err
	}

	// Old format: array of projects
	type OldProject struct {
		ID          string            `json:"id"`
		Name        string            `json:"name"`
		Path        string            `json:"path"`
		Color       string            `json:"color"`
		Icon        string            `json:"icon"`
		BrowserTabs []string          `json:"browserTabs"`
		EnvVars     map[string]string `json:"envVars"`
		LastOpened  time.Time         `json:"lastOpened"`
		CreatedAt   time.Time         `json:"createdAt"`
	}

	var oldProjects []OldProject
	if err := json.Unmarshal(data, &oldProjects); err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	m.state = NewAppState()
	for _, op := range oldProjects {
		ps := &ProjectState{
			ID:          op.ID,
			Name:        op.Name,
			Path:        op.Path,
			Color:       op.Color,
			Icon:        op.Icon,
			Terminals:   make(map[string]*TerminalState),
			Browser:     &BrowserState{URL: "", DeviceIndex: 0, Rotated: false, Scale: 100},
			ActiveTab:   "terminal",
			SplitView:   false,
			SplitRatio:  50,
			BrowserTabs: op.BrowserTabs,
			EnvVars:     op.EnvVars,
			LastOpened:  op.LastOpened,
			CreatedAt:   op.CreatedAt,
		}
		if ps.BrowserTabs == nil {
			ps.BrowserTabs = []string{}
		}
		if ps.EnvVars == nil {
			ps.EnvVars = make(map[string]string)
		}
		m.state.Projects[op.ID] = ps
	}

	return nil
}

func (m *Manager) saveImmediate() error {
	m.mu.RLock()
	data, err := json.MarshalIndent(m.state, "", "  ")
	m.mu.RUnlock()

	if err != nil {
		return err
	}

	return os.WriteFile(m.statePath, data, 0644)
}

// Save triggers a debounced save
func (m *Manager) Save() {
	m.saveMu.Lock()
	defer m.saveMu.Unlock()

	if m.saveTimer != nil {
		m.saveTimer.Stop()
	}

	m.saveTimer = time.AfterFunc(500*time.Millisecond, func() {
		m.saveImmediate()
	})
}

// SaveSync immediately saves state (for shutdown)
func (m *Manager) SaveSync() error {
	m.saveMu.Lock()
	if m.saveTimer != nil {
		m.saveTimer.Stop()
		m.saveTimer = nil
	}
	m.saveMu.Unlock()

	return m.saveImmediate()
}

// GetState returns the full app state
func (m *Manager) GetState() *AppState {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.state
}

// GetActiveProjectID returns the active project ID
func (m *Manager) GetActiveProjectID() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.state.ActiveProject
}

// SetActiveProject changes the active project
func (m *Manager) SetActiveProject(projectID string) {
	m.mu.Lock()
	m.state.ActiveProject = projectID
	if p, ok := m.state.Projects[projectID]; ok {
		p.LastOpened = time.Now()
	}
	m.mu.Unlock()

	m.Save()

	if m.ctx != nil {
		m.mu.RLock()
		project := m.state.Projects[projectID]
		m.mu.RUnlock()

		runtime.EventsEmit(m.ctx, "state:activeProject:changed", map[string]interface{}{
			"projectId": projectID,
			"state":     project,
		})
	}
}

// GetProjects returns all projects
func (m *Manager) GetProjects() []*ProjectState {
	m.mu.RLock()
	defer m.mu.RUnlock()

	projects := make([]*ProjectState, 0, len(m.state.Projects))
	for _, p := range m.state.Projects {
		projects = append(projects, p)
	}
	return projects
}

// GetProject returns a project by ID
func (m *Manager) GetProject(id string) *ProjectState {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.state.Projects[id]
}

// CreateProject creates a new project
func (m *Manager) CreateProject(name, path string) (*ProjectState, error) {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}

	info, err := os.Stat(absPath)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, os.ErrNotExist
	}

	id := uuid.New().String()
	colorIdx := len(m.state.Projects) % len(DefaultColors)
	iconIdx := len(m.state.Projects) % len(DefaultIcons)

	project := NewProjectState(id, name, absPath, DefaultColors[colorIdx], DefaultIcons[iconIdx])

	m.mu.Lock()
	m.state.Projects[id] = project
	m.mu.Unlock()

	m.Save()

	if m.ctx != nil {
		runtime.EventsEmit(m.ctx, "state:project:created", project)
	}

	return project, nil
}

// UpdateProject updates a project's basic info
func (m *Manager) UpdateProject(project *ProjectState) error {
	m.mu.Lock()
	if existing, ok := m.state.Projects[project.ID]; ok {
		// Update allowed fields
		existing.Name = project.Name
		existing.Color = project.Color
		existing.Icon = project.Icon
		existing.BrowserTabs = project.BrowserTabs
		existing.EnvVars = project.EnvVars
		existing.Notes = project.Notes
	}
	m.mu.Unlock()

	m.Save()

	if m.ctx != nil {
		runtime.EventsEmit(m.ctx, "state:project:updated", project)
	}

	return nil
}

// DeleteProject deletes a project
func (m *Manager) DeleteProject(id string) error {
	m.mu.Lock()
	delete(m.state.Projects, id)
	if m.state.ActiveProject == id {
		m.state.ActiveProject = ""
	}
	m.mu.Unlock()

	m.Save()

	if m.ctx != nil {
		runtime.EventsEmit(m.ctx, "state:project:deleted", map[string]string{"projectId": id})
	}

	return nil
}

// Terminal operations

// CreateTerminal creates a terminal in a project
// If name is empty or "Terminal" or "Terminal 1", generates unique name atomically
func (m *Manager) CreateTerminal(projectID, name, workDir string) (*TerminalState, error) {
	termID := uuid.New().String()

	m.mu.Lock()
	project, ok := m.state.Projects[projectID]
	if !ok {
		m.mu.Unlock()
		return nil, os.ErrNotExist
	}

	// Generate unique name inside the lock to prevent race conditions
	if name == "" || name == "Terminal" || name == "Terminal 1" {
		maxNum := 0
		for _, t := range project.Terminals {
			var num int
			if _, err := fmt.Sscanf(t.Name, "Terminal %d", &num); err == nil {
				if num > maxNum {
					maxNum = num
				}
			}
		}
		name = fmt.Sprintf("Terminal %d", maxNum+1)
	}

	term := NewTerminalState(termID, projectID, name, workDir)
	project.Terminals[termID] = term
	if project.ActiveTerminalID == "" {
		project.ActiveTerminalID = termID
	}
	m.mu.Unlock()

	m.Save()

	if m.ctx != nil {
		runtime.EventsEmit(m.ctx, "state:terminal:created", map[string]interface{}{
			"projectId": projectID,
			"terminal":  term,
		})
	}

	return term, nil
}

// SetTerminalRunning updates the running state of a terminal
func (m *Manager) SetTerminalRunning(projectID, terminalID string, running bool) {
	m.mu.Lock()
	if p, ok := m.state.Projects[projectID]; ok {
		if t, ok := p.Terminals[terminalID]; ok {
			t.Running = running
		}
	}
	m.mu.Unlock()

	// Don't persist running state, it's runtime only
}

// ClearAllTerminals removes all terminals from all projects
// Called at startup since PTYs don't survive app restart
func (m *Manager) ClearAllTerminals() {
	m.mu.Lock()
	for _, project := range m.state.Projects {
		project.Terminals = make(map[string]*TerminalState)
	}
	m.mu.Unlock()
	m.Save()
}

// DeleteTerminal removes a terminal from a project
func (m *Manager) DeleteTerminal(projectID, terminalID string) error {
	m.mu.Lock()
	project, ok := m.state.Projects[projectID]
	if !ok {
		m.mu.Unlock()
		return os.ErrNotExist
	}
	delete(project.Terminals, terminalID)
	if project.ActiveTerminalID == terminalID {
		project.ActiveTerminalID = ""
		// Set first available terminal as active
		for id := range project.Terminals {
			project.ActiveTerminalID = id
			break
		}
	}
	m.mu.Unlock()

	m.Save()

	if m.ctx != nil {
		runtime.EventsEmit(m.ctx, "state:terminal:deleted", map[string]string{
			"projectId":  projectID,
			"terminalId": terminalID,
		})
	}

	return nil
}

// SetActiveTerminal sets the active terminal for a project
func (m *Manager) SetActiveTerminal(projectID, terminalID string) {
	m.mu.Lock()
	if project, ok := m.state.Projects[projectID]; ok {
		project.ActiveTerminalID = terminalID
	}
	m.mu.Unlock()

	m.Save()
}

// RenameTerminal renames a terminal in a project
func (m *Manager) RenameTerminal(projectID, terminalID, name string) error {
	m.mu.Lock()
	project, ok := m.state.Projects[projectID]
	if !ok {
		m.mu.Unlock()
		return os.ErrNotExist
	}
	term, ok := project.Terminals[terminalID]
	if !ok {
		m.mu.Unlock()
		return os.ErrNotExist
	}
	term.Name = name
	m.mu.Unlock()

	m.Save()

	if m.ctx != nil {
		runtime.EventsEmit(m.ctx, "state:terminal:renamed", map[string]string{
			"projectId":  projectID,
			"terminalId": terminalID,
			"name":       name,
		})
	}

	return nil
}

// GetTerminal returns a terminal by project and terminal ID
func (m *Manager) GetTerminal(projectID, terminalID string) *TerminalState {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if project, ok := m.state.Projects[projectID]; ok {
		return project.Terminals[terminalID]
	}
	return nil
}

// GetTerminalByID finds a terminal by ID across all projects
func (m *Manager) GetTerminalByID(terminalID string) (projectID string, term *TerminalState) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for pid, project := range m.state.Projects {
		if t, ok := project.Terminals[terminalID]; ok {
			return pid, t
		}
	}
	return "", nil
}

// GetProjectTerminals returns all terminals for a project
func (m *Manager) GetProjectTerminals(projectID string) []*TerminalState {
	m.mu.RLock()
	defer m.mu.RUnlock()

	project, ok := m.state.Projects[projectID]
	if !ok {
		return nil
	}

	terminals := make([]*TerminalState, 0, len(project.Terminals))
	for _, t := range project.Terminals {
		terminals = append(terminals, t)
	}
	return terminals
}

// Browser operations

// UpdateBrowserState updates the browser state for a project
func (m *Manager) UpdateBrowserState(projectID string, url string, deviceIndex int, rotated bool, scale int) {
	m.mu.Lock()
	if project, ok := m.state.Projects[projectID]; ok {
		if project.Browser == nil {
			project.Browser = &BrowserState{}
		}
		project.Browser.URL = url
		project.Browser.DeviceIndex = deviceIndex
		project.Browser.Rotated = rotated
		project.Browser.Scale = scale
	}
	m.mu.Unlock()

	m.Save()
}

// AddBookmark adds a bookmark to a project's browser state
func (m *Manager) AddBookmark(projectID, name, url string) (*Bookmark, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	project, ok := m.state.Projects[projectID]
	if !ok {
		return nil, os.ErrNotExist
	}

	if project.Browser == nil {
		project.Browser = &BrowserState{Bookmarks: []Bookmark{}}
	}

	if project.Browser.Bookmarks == nil {
		project.Browser.Bookmarks = []Bookmark{}
	}

	// Check if bookmark already exists for this URL
	for _, b := range project.Browser.Bookmarks {
		if b.URL == url {
			return &b, nil
		}
	}

	bookmark := Bookmark{
		ID:    uuid.New().String(),
		Name:  name,
		URL:   url,
		Order: len(project.Browser.Bookmarks),
	}

	project.Browser.Bookmarks = append(project.Browser.Bookmarks, bookmark)

	go m.Save()

	return &bookmark, nil
}

// RemoveBookmark removes a bookmark from a project
func (m *Manager) RemoveBookmark(projectID, bookmarkID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	project, ok := m.state.Projects[projectID]
	if !ok {
		return os.ErrNotExist
	}

	if project.Browser == nil || project.Browser.Bookmarks == nil {
		return nil
	}

	// Find and remove the bookmark
	for i, b := range project.Browser.Bookmarks {
		if b.ID == bookmarkID {
			project.Browser.Bookmarks = append(
				project.Browser.Bookmarks[:i],
				project.Browser.Bookmarks[i+1:]...,
			)
			break
		}
	}

	go m.Save()

	return nil
}

// GetBookmarks returns all bookmarks for a project
func (m *Manager) GetBookmarks(projectID string) []Bookmark {
	m.mu.RLock()
	defer m.mu.RUnlock()

	project, ok := m.state.Projects[projectID]
	if !ok || project.Browser == nil || project.Browser.Bookmarks == nil {
		return []Bookmark{}
	}

	return project.Browser.Bookmarks
}

// UI operations

// UpdateUIState updates the UI state for a project
func (m *Manager) UpdateUIState(projectID string, activeTab string, splitView bool, splitRatio float64) {
	m.mu.Lock()
	if project, ok := m.state.Projects[projectID]; ok {
		project.ActiveTab = activeTab
		project.SplitView = splitView
		project.SplitRatio = splitRatio
	}
	m.mu.Unlock()

	m.Save()
}

// EmitTerminalOutput emits terminal output with project context
func (m *Manager) EmitTerminalOutput(terminalID, data string) {
	projectID, _ := m.GetTerminalByID(terminalID)

	if m.ctx != nil && projectID != "" {
		runtime.EventsEmit(m.ctx, "state:terminal:output", map[string]string{
			"projectId": projectID,
			"id":        terminalID,
			"data":      data,
		})
	}
}

// EmitTerminalExit emits terminal exit with project context
func (m *Manager) EmitTerminalExit(terminalID string) {
	projectID, _ := m.GetTerminalByID(terminalID)

	if projectID != "" {
		m.SetTerminalRunning(projectID, terminalID, false)

		if m.ctx != nil {
			runtime.EventsEmit(m.ctx, "state:terminal:exit", map[string]string{
				"projectId":  projectID,
				"terminalId": terminalID,
			})
		}
	}
}

// EmitClaudeStatus emits Claude CLI status with project context
func (m *Manager) EmitClaudeStatus(terminalID, status string) {
	projectID, _ := m.GetTerminalByID(terminalID)

	if m.ctx != nil && projectID != "" {
		runtime.EventsEmit(m.ctx, "state:claude:status", map[string]string{
			"projectId":  projectID,
			"terminalId": terminalID,
			"status":     status,
		})
	}
}

// UpdateBrowserTabs updates browser tabs for a project
func (m *Manager) UpdateBrowserTabs(projectID string, tabs []BrowserTab, activeTabID string) error {
	m.mu.Lock()
	project, ok := m.state.Projects[projectID]
	if !ok {
		m.mu.Unlock()
		return os.ErrNotExist
	}

	if project.Browser == nil {
		project.Browser = &BrowserState{}
	}

	project.Browser.Tabs = tabs
	project.Browser.ActiveTabID = activeTabID
	m.mu.Unlock()

	m.Save()

	return nil
}

// Test History operations

// SaveTestHistory saves test run history for a project
func (m *Manager) SaveTestHistory(projectID string, history []TestRun) error {
	m.mu.Lock()
	project, ok := m.state.Projects[projectID]
	if !ok {
		m.mu.Unlock()
		return os.ErrNotExist
	}

	// Keep only last 20 runs
	if len(history) > 20 {
		history = history[:20]
	}

	project.TestHistory = history
	m.mu.Unlock()

	m.Save()

	return nil
}

// GetTestHistory returns test run history for a project
func (m *Manager) GetTestHistory(projectID string) []TestRun {
	m.mu.RLock()
	defer m.mu.RUnlock()

	project, ok := m.state.Projects[projectID]
	if !ok || project.TestHistory == nil {
		return []TestRun{}
	}

	return project.TestHistory
}

// AddTestRun adds a single test run to project history
func (m *Manager) AddTestRun(projectID string, run TestRun) error {
	m.mu.Lock()
	project, ok := m.state.Projects[projectID]
	if !ok {
		m.mu.Unlock()
		return os.ErrNotExist
	}

	if project.TestHistory == nil {
		project.TestHistory = []TestRun{}
	}

	// Add to beginning (newest first)
	project.TestHistory = append([]TestRun{run}, project.TestHistory...)

	// Keep only last 20 runs
	if len(project.TestHistory) > 20 {
		project.TestHistory = project.TestHistory[:20]
	}

	m.mu.Unlock()

	m.Save()

	return nil
}

// ============================================
// Prompt operations
// ============================================

// GetProjectPrompts returns all prompts for a project
func (m *Manager) GetProjectPrompts(projectID string) []Prompt {
	m.mu.RLock()
	defer m.mu.RUnlock()

	project, ok := m.state.Projects[projectID]
	if !ok || project.Prompts == nil {
		return []Prompt{}
	}

	return project.Prompts
}

// CreatePrompt creates a new prompt in a project
func (m *Manager) CreatePrompt(projectID string, prompt Prompt) (*Prompt, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	project, ok := m.state.Projects[projectID]
	if !ok {
		return nil, os.ErrNotExist
	}

	if project.Prompts == nil {
		project.Prompts = []Prompt{}
	}

	prompt.ID = uuid.New().String()
	now := time.Now()
	prompt.CreatedAt = now
	prompt.UpdatedAt = now
	prompt.IsGlobal = false

	project.Prompts = append(project.Prompts, prompt)

	go m.Save()

	return &prompt, nil
}

// UpdatePrompt updates an existing prompt in a project
func (m *Manager) UpdatePrompt(projectID, promptID string, prompt Prompt) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	project, ok := m.state.Projects[projectID]
	if !ok {
		return os.ErrNotExist
	}

	for i, p := range project.Prompts {
		if p.ID == promptID {
			prompt.ID = promptID
			prompt.CreatedAt = p.CreatedAt
			prompt.UpdatedAt = time.Now()
			prompt.IsGlobal = false
			project.Prompts[i] = prompt
			go m.Save()
			return nil
		}
	}

	return os.ErrNotExist
}

// DeletePrompt deletes a prompt from a project
func (m *Manager) DeletePrompt(projectID, promptID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	project, ok := m.state.Projects[projectID]
	if !ok {
		return os.ErrNotExist
	}

	for i, p := range project.Prompts {
		if p.ID == promptID {
			project.Prompts = append(project.Prompts[:i], project.Prompts[i+1:]...)
			go m.Save()
			return nil
		}
	}

	return os.ErrNotExist
}

// IncrementPromptUsage increments the usage count for a prompt
func (m *Manager) IncrementPromptUsage(projectID, promptID string, isGlobal bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if isGlobal {
		for i, p := range m.state.GlobalPrompts {
			if p.ID == promptID {
				m.state.GlobalPrompts[i].UsageCount++
				m.state.GlobalPrompts[i].UpdatedAt = time.Now()
				go m.Save()
				return nil
			}
		}
	} else {
		project, ok := m.state.Projects[projectID]
		if !ok {
			return os.ErrNotExist
		}

		for i, p := range project.Prompts {
			if p.ID == promptID {
				project.Prompts[i].UsageCount++
				project.Prompts[i].UpdatedAt = time.Now()
				go m.Save()
				return nil
			}
		}
	}

	return os.ErrNotExist
}

// TogglePromptPinned toggles the pinned status of a prompt
func (m *Manager) TogglePromptPinned(projectID, promptID string, isGlobal bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if isGlobal {
		for i, p := range m.state.GlobalPrompts {
			if p.ID == promptID {
				m.state.GlobalPrompts[i].Pinned = !m.state.GlobalPrompts[i].Pinned
				m.state.GlobalPrompts[i].UpdatedAt = time.Now()
				go m.Save()
				return nil
			}
		}
	} else {
		project, ok := m.state.Projects[projectID]
		if !ok {
			return os.ErrNotExist
		}

		for i, p := range project.Prompts {
			if p.ID == promptID {
				project.Prompts[i].Pinned = !project.Prompts[i].Pinned
				project.Prompts[i].UpdatedAt = time.Now()
				go m.Save()
				return nil
			}
		}
	}

	return os.ErrNotExist
}

// ============================================
// Global Prompt operations
// ============================================

// GetGlobalPrompts returns all global prompts
func (m *Manager) GetGlobalPrompts() []Prompt {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.state.GlobalPrompts == nil {
		return []Prompt{}
	}

	return m.state.GlobalPrompts
}

// CreateGlobalPrompt creates a new global prompt
func (m *Manager) CreateGlobalPrompt(prompt Prompt) (*Prompt, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.state.GlobalPrompts == nil {
		m.state.GlobalPrompts = []Prompt{}
	}

	prompt.ID = uuid.New().String()
	now := time.Now()
	prompt.CreatedAt = now
	prompt.UpdatedAt = now
	prompt.IsGlobal = true

	m.state.GlobalPrompts = append(m.state.GlobalPrompts, prompt)

	go m.Save()

	return &prompt, nil
}

// UpdateGlobalPrompt updates an existing global prompt
func (m *Manager) UpdateGlobalPrompt(promptID string, prompt Prompt) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for i, p := range m.state.GlobalPrompts {
		if p.ID == promptID {
			prompt.ID = promptID
			prompt.CreatedAt = p.CreatedAt
			prompt.UpdatedAt = time.Now()
			prompt.IsGlobal = true
			m.state.GlobalPrompts[i] = prompt
			go m.Save()
			return nil
		}
	}

	return os.ErrNotExist
}

// DeleteGlobalPrompt deletes a global prompt
func (m *Manager) DeleteGlobalPrompt(promptID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for i, p := range m.state.GlobalPrompts {
		if p.ID == promptID {
			m.state.GlobalPrompts = append(m.state.GlobalPrompts[:i], m.state.GlobalPrompts[i+1:]...)
			go m.Save()
			return nil
		}
	}

	return os.ErrNotExist
}

// ============================================
// Prompt Category operations
// ============================================

// GetPromptCategories returns all categories for a project
func (m *Manager) GetPromptCategories(projectID string) []PromptCategory {
	m.mu.RLock()
	defer m.mu.RUnlock()

	project, ok := m.state.Projects[projectID]
	if !ok || project.PromptCategories == nil {
		return []PromptCategory{}
	}

	return project.PromptCategories
}

// GetGlobalPromptCategories returns all global categories
func (m *Manager) GetGlobalPromptCategories() []PromptCategory {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.state.GlobalPromptCategories == nil {
		return []PromptCategory{}
	}

	return m.state.GlobalPromptCategories
}

// CreatePromptCategory creates a new prompt category
func (m *Manager) CreatePromptCategory(projectID, name string, isGlobal bool) (*PromptCategory, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	category := PromptCategory{
		ID:       uuid.New().String(),
		Name:     name,
		IsGlobal: isGlobal,
	}

	if isGlobal {
		if m.state.GlobalPromptCategories == nil {
			m.state.GlobalPromptCategories = []PromptCategory{}
		}
		category.Order = len(m.state.GlobalPromptCategories)
		m.state.GlobalPromptCategories = append(m.state.GlobalPromptCategories, category)
	} else {
		project, ok := m.state.Projects[projectID]
		if !ok {
			return nil, os.ErrNotExist
		}

		if project.PromptCategories == nil {
			project.PromptCategories = []PromptCategory{}
		}
		category.Order = len(project.PromptCategories)
		project.PromptCategories = append(project.PromptCategories, category)
	}

	go m.Save()

	return &category, nil
}

// DeletePromptCategory deletes a prompt category
func (m *Manager) DeletePromptCategory(projectID, categoryID string, isGlobal bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if isGlobal {
		for i, c := range m.state.GlobalPromptCategories {
			if c.ID == categoryID {
				m.state.GlobalPromptCategories = append(
					m.state.GlobalPromptCategories[:i],
					m.state.GlobalPromptCategories[i+1:]...,
				)
				go m.Save()
				return nil
			}
		}
	} else {
		project, ok := m.state.Projects[projectID]
		if !ok {
			return os.ErrNotExist
		}

		for i, c := range project.PromptCategories {
			if c.ID == categoryID {
				project.PromptCategories = append(
					project.PromptCategories[:i],
					project.PromptCategories[i+1:]...,
				)
				go m.Save()
				return nil
			}
		}
	}

	return os.ErrNotExist
}

// ============================================
// Todo operations
// ============================================

// GetTodos returns all todos for a project
func (m *Manager) GetTodos(projectID string) []TodoItem {
	m.mu.RLock()
	defer m.mu.RUnlock()

	project, ok := m.state.Projects[projectID]
	if !ok || project.Todos == nil {
		return []TodoItem{}
	}

	return project.Todos
}

// SaveTodos saves the todos for a project
func (m *Manager) SaveTodos(projectID string, todos []TodoItem) error {
	m.mu.Lock()
	project, ok := m.state.Projects[projectID]
	if !ok {
		m.mu.Unlock()
		return os.ErrNotExist
	}

	project.Todos = todos
	m.mu.Unlock()

	m.Save()

	return nil
}

// ============================================
// Approved Remote Clients
// ============================================

// GetApprovedClients returns all approved remote clients
func (m *Manager) GetApprovedClients() []*ApprovedRemoteClient {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.state.ApprovedRemoteClients == nil {
		return []*ApprovedRemoteClient{}
	}

	// Return pointers to copies
	result := make([]*ApprovedRemoteClient, len(m.state.ApprovedRemoteClients))
	for i := range m.state.ApprovedRemoteClients {
		c := m.state.ApprovedRemoteClients[i]
		result[i] = &c
	}
	return result
}

// SetApprovedClients saves approved remote clients
func (m *Manager) SetApprovedClients(clients interface{}) {
	m.mu.Lock()

	// Handle different input types
	switch c := clients.(type) {
	case []*ApprovedRemoteClient:
		m.state.ApprovedRemoteClients = make([]ApprovedRemoteClient, len(c))
		for i, client := range c {
			m.state.ApprovedRemoteClients[i] = *client
		}
	case []ApprovedRemoteClient:
		m.state.ApprovedRemoteClients = c
	}

	m.mu.Unlock()
	m.Save()
}

// GetTerminalTheme returns the current terminal theme name
func (m *Manager) GetTerminalTheme() string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.state.TerminalTheme == "" {
		return "dracula" // default theme
	}
	return m.state.TerminalTheme
}

// SetTerminalTheme sets the terminal theme for all terminals
func (m *Manager) SetTerminalTheme(themeName string) {
	m.mu.Lock()
	m.state.TerminalTheme = themeName
	m.mu.Unlock()
	m.Save()

	// Emit event to notify frontend
	if m.ctx != nil {
		runtime.EventsEmit(m.ctx, "state:terminal:theme", themeName)
	}
}

// GetWindowState returns the saved window state
func (m *Manager) GetWindowState() *WindowState {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.state.Window
}

// SetWindowState saves the window state
func (m *Manager) SetWindowState(state *WindowState) {
	m.mu.Lock()
	m.state.Window = state
	m.mu.Unlock()
	m.Save()
}

// GetPomodoroSettings returns the saved pomodoro timer settings
func (m *Manager) GetPomodoroSettings() *PomodoroSettings {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.state.Pomodoro == nil {
		return &PomodoroSettings{SessionMinutes: 25, BreakMinutes: 5}
	}
	return m.state.Pomodoro
}

// SavePomodoroSettings saves the pomodoro timer settings
func (m *Manager) SavePomodoroSettings(sessionMinutes, breakMinutes int) {
	m.mu.Lock()
	m.state.Pomodoro = &PomodoroSettings{
		SessionMinutes: sessionMinutes,
		BreakMinutes:   breakMinutes,
	}
	m.mu.Unlock()
	m.Save()
}
