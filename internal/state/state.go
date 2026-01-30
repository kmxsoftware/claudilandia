package state

import "time"

// TodoItem represents a single todo item in a project
type TodoItem struct {
	ID        string    `json:"id"`
	Text      string    `json:"text"`
	Completed bool      `json:"completed"`
	CreatedAt time.Time `json:"createdAt"`
}

// ApprovedRemoteClient represents a permanently approved remote client
type ApprovedRemoteClient struct {
	Token     string    `json:"token"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
	LastUsed  time.Time `json:"lastUsed"`
}

// AppState represents the entire application state
type AppState struct {
	Version       int                      `json:"version"`
	ActiveProject string                   `json:"activeProjectId"`
	Projects      map[string]*ProjectState `json:"projects"`
	// Global prompts accessible across all projects
	GlobalPrompts          []Prompt         `json:"globalPrompts"`
	GlobalPromptCategories []PromptCategory `json:"globalPromptCategories"`
	// Approved remote clients (permanent tokens)
	ApprovedRemoteClients []ApprovedRemoteClient `json:"approvedRemoteClients"`
	// Terminal theme (global for all terminals)
	TerminalTheme string `json:"terminalTheme"`
}

// ProjectState represents a single project with all its state
type ProjectState struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Path string `json:"path"`

	// UI customization
	Color string `json:"color"`
	Icon  string `json:"icon"`

	// Terminal state - terminals belong to project
	Terminals        map[string]*TerminalState `json:"terminals"`
	ActiveTerminalID string                    `json:"activeTerminalId"`

	// Browser state
	Browser *BrowserState `json:"browser"`

	// UI state
	ActiveTab  string  `json:"activeTab"`
	SplitView  bool    `json:"splitView"`
	SplitRatio float64 `json:"splitRatio"`

	// Project notes (markdown)
	Notes string `json:"notes"`

	// Test history
	TestHistory []TestRun `json:"testHistory"`

	// Custom prompts for Claude Code
	Prompts          []Prompt         `json:"prompts"`
	PromptCategories []PromptCategory `json:"promptCategories"`

	// Todo items for dashboard
	Todos []TodoItem `json:"todos"`

	// Metadata
	BrowserTabs []string          `json:"browserTabs"`
	EnvVars     map[string]string `json:"envVars"`
	LastOpened  time.Time         `json:"lastOpened"`
	CreatedAt   time.Time         `json:"createdAt"`
}

// TerminalState represents a terminal session within a project
type TerminalState struct {
	ID        string `json:"id"`
	ProjectID string `json:"projectId"`
	Name      string `json:"name"`
	WorkDir   string `json:"workDir"`
	Running   bool   `json:"running"`

	// Runtime only - not persisted
	ClaudeStatus string `json:"-"`
}

// Bookmark represents a saved browser bookmark
type Bookmark struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	URL   string `json:"url"`
	Order int    `json:"order"`
}

// BrowserTab represents a single browser tab
type BrowserTab struct {
	ID     string `json:"id"`
	URL    string `json:"url"`
	Title  string `json:"title"`
	Active bool   `json:"active"`
}

// BrowserState represents the browser emulator state
type BrowserState struct {
	URL          string       `json:"url"`
	DeviceIndex  int          `json:"deviceIndex"`
	Rotated      bool         `json:"rotated"`
	Scale        int          `json:"scale"`
	Bookmarks    []Bookmark   `json:"bookmarks"`
	Tabs         []BrowserTab `json:"tabs"`
	ActiveTabID  string       `json:"activeTabId"`
}

// TestRun represents a single test run result
type TestRun struct {
	ID         int64     `json:"id"`
	TerminalID string    `json:"terminalId"`
	Runner     string    `json:"runner"`
	Status     string    `json:"status"`
	Passed     int       `json:"passed"`
	Failed     int       `json:"failed"`
	Skipped    int       `json:"skipped"`
	Total      int       `json:"total"`
	Duration   int64     `json:"duration"`
	Timestamp  time.Time `json:"timestamp"`
}

// Prompt represents a custom prompt for Claude Code
type Prompt struct {
	ID         string    `json:"id"`
	Title      string    `json:"title"`
	Content    string    `json:"content"`
	Category   string    `json:"category"`
	UsageCount int       `json:"usageCount"`
	Pinned     bool      `json:"pinned"`
	IsGlobal   bool      `json:"isGlobal"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// PromptCategory represents a category for organizing prompts
type PromptCategory struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Order    int    `json:"order"`
	IsGlobal bool   `json:"isGlobal"`
}

// NewAppState creates a new empty app state
func NewAppState() *AppState {
	return &AppState{
		Version:  1,
		Projects: make(map[string]*ProjectState),
	}
}

// NewProjectState creates a new project state with defaults
func NewProjectState(id, name, path, color, icon string) *ProjectState {
	now := time.Now()
	return &ProjectState{
		ID:         id,
		Name:       name,
		Path:       path,
		Color:      color,
		Icon:       icon,
		Terminals:  make(map[string]*TerminalState),
		Browser: &BrowserState{
			URL:         "",
			DeviceIndex: 0,
			Rotated:     false,
			Scale:       100,
			Bookmarks:   []Bookmark{},
		},
		ActiveTab:        "terminal",
		SplitView:        false,
		SplitRatio:       50,
		BrowserTabs:      []string{},
		EnvVars:          make(map[string]string),
		Prompts:          []Prompt{},
		PromptCategories: []PromptCategory{},
		Todos:            []TodoItem{},
		LastOpened:       now,
		CreatedAt:        now,
	}
}

// NewTerminalState creates a new terminal state
func NewTerminalState(id, projectID, name, workDir string) *TerminalState {
	return &TerminalState{
		ID:        id,
		ProjectID: projectID,
		Name:      name,
		WorkDir:   workDir,
		Running:   false,
	}
}
