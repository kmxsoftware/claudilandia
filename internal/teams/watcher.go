package teams

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"projecthub/internal/logging"
)

// TeamConfig mirrors ~/.claude/teams/{name}/config.json
type TeamConfig struct {
	Name          string       `json:"name"`
	Description   string       `json:"description"`
	CreatedAt     int64        `json:"createdAt"`
	LeadAgentID   string       `json:"leadAgentId"`
	LeadSessionID string       `json:"leadSessionId"`
	Members       []TeamMember `json:"members"`
}

// TeamMember represents a team member
type TeamMember struct {
	AgentID       string   `json:"agentId"`
	Name          string   `json:"name"`
	AgentType     string   `json:"agentType"`
	Model         string   `json:"model"`
	JoinedAt      int64    `json:"joinedAt"`
	TmuxPaneID    string   `json:"tmuxPaneId"`
	CWD           string   `json:"cwd"`
	Subscriptions []string `json:"subscriptions"`
}

// InboxMessage represents a message in an agent's inbox
type InboxMessage struct {
	From      string `json:"from"`
	Text      string `json:"text"`
	Timestamp string `json:"timestamp"`
	Read      bool   `json:"read"`
	Color     string `json:"color,omitempty"`
	// Parsed fields from the JSON-encoded Text
	ParsedType    string `json:"parsedType,omitempty"`
	ParsedSubject string `json:"parsedSubject,omitempty"`
	ParsedTaskID  string `json:"parsedTaskId,omitempty"`
}

// Task represents a task from ~/.claude/tasks/{sessionId}/{id}.json
type Task struct {
	ID          string   `json:"id"`
	Subject     string   `json:"subject"`
	Description string   `json:"description"`
	ActiveForm  string   `json:"activeForm"`
	Status      string   `json:"status"`
	Blocks      []string `json:"blocks"`
	BlockedBy   []string `json:"blockedBy"`
}

// TeamSnapshot is the full state of a team
type TeamSnapshot struct {
	Name          string                    `json:"name"`
	Description   string                    `json:"description"`
	CreatedAt     int64                     `json:"createdAt"`
	LeadAgentID   string                    `json:"leadAgentId"`
	LeadSessionID string                    `json:"leadSessionId"`
	Members       []TeamMember              `json:"members"`
	Inboxes       map[string][]InboxMessage `json:"inboxes"`
	Tasks         []Task                    `json:"tasks"`
	LastModified  int64                     `json:"lastModified"`
}

// Watcher watches ~/.claude/teams/ for team data
type Watcher struct {
	teamsDir       string
	tasksDir       string
	teams          map[string]*TeamSnapshot
	history        *History
	mu             sync.RWMutex
	updateCallback func(teams map[string]*TeamSnapshot)
	lastHash       string // simple change detection
}

// NewWatcher creates a new teams watcher
func NewWatcher() *Watcher {
	homeDir, _ := os.UserHomeDir()
	return &Watcher{
		teamsDir: filepath.Join(homeDir, ".claude", "teams"),
		tasksDir: filepath.Join(homeDir, ".claude", "tasks"),
		teams:    make(map[string]*TeamSnapshot),
		history:  NewHistory(),
	}
}

// SetUpdateCallback sets the callback for team updates
func (w *Watcher) SetUpdateCallback(fn func(map[string]*TeamSnapshot)) {
	w.updateCallback = fn
}

// StartPolling starts polling for team changes
func (w *Watcher) StartPolling(interval time.Duration, stopChan chan struct{}) {
	// Initial scan
	w.scan()

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			w.scan()
		case <-stopChan:
			return
		}
	}
}

// GetAllTeams returns all current team snapshots
func (w *Watcher) GetAllTeams() map[string]*TeamSnapshot {
	w.mu.RLock()
	defer w.mu.RUnlock()

	result := make(map[string]*TeamSnapshot, len(w.teams))
	for k, v := range w.teams {
		result[k] = v
	}
	return result
}

// GetTeam returns a single team by name
func (w *Watcher) GetTeam(name string) *TeamSnapshot {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.teams[name]
}

// GetHistory returns team history
func (w *Watcher) GetHistory() []TeamHistoryEntry {
	return w.history.GetEntries()
}

func (w *Watcher) scan() {
	entries, err := os.ReadDir(w.teamsDir)
	if err != nil {
		return // teams dir doesn't exist yet
	}

	newTeams := make(map[string]*TeamSnapshot)
	var hashParts []string

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		teamName := entry.Name()
		teamDir := filepath.Join(w.teamsDir, teamName)
		snapshot := w.readTeamSnapshot(teamDir)
		if snapshot == nil {
			continue
		}

		newTeams[teamName] = snapshot

		// Build hash for change detection
		info, _ := entry.Info()
		if info != nil {
			hashParts = append(hashParts, teamName+":"+info.ModTime().String())
		}

		// Check inbox mod times for change detection
		inboxDir := filepath.Join(teamDir, "inboxes")
		if inboxEntries, err := os.ReadDir(inboxDir); err == nil {
			for _, ie := range inboxEntries {
				if ii, err := ie.Info(); err == nil {
					hashParts = append(hashParts, ie.Name()+":"+ii.ModTime().String())
				}
			}
		}

		// Check task mod times
		if snapshot.LeadSessionID != "" {
			taskDir := filepath.Join(w.tasksDir, snapshot.LeadSessionID)
			if taskEntries, err := os.ReadDir(taskDir); err == nil {
				for _, te := range taskEntries {
					if ti, err := te.Info(); err == nil {
						hashParts = append(hashParts, te.Name()+":"+ti.ModTime().String())
					}
				}
			}
		}
	}

	// Archive teams that disappeared
	w.mu.RLock()
	for name, old := range w.teams {
		if _, exists := newTeams[name]; !exists {
			w.history.Archive(old)
		}
	}
	w.mu.RUnlock()

	// Check if anything changed
	sort.Strings(hashParts)
	newHash := strings.Join(hashParts, "|")
	if newHash == w.lastHash {
		return
	}
	w.lastHash = newHash

	w.mu.Lock()
	w.teams = newTeams
	w.mu.Unlock()

	if w.updateCallback != nil {
		w.updateCallback(newTeams)
	}
}

func (w *Watcher) readTeamSnapshot(teamDir string) *TeamSnapshot {
	configPath := filepath.Join(teamDir, "config.json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil
	}

	var config TeamConfig
	if err := json.Unmarshal(data, &config); err != nil {
		logging.Error("Failed to parse team config", "path", configPath, "error", err)
		return nil
	}

	snapshot := &TeamSnapshot{
		Name:          config.Name,
		Description:   config.Description,
		CreatedAt:     config.CreatedAt,
		LeadAgentID:   config.LeadAgentID,
		LeadSessionID: config.LeadSessionID,
		Members:       config.Members,
		Inboxes:       make(map[string][]InboxMessage),
	}

	// Read inboxes
	inboxDir := filepath.Join(teamDir, "inboxes")
	if inboxEntries, err := os.ReadDir(inboxDir); err == nil {
		for _, entry := range inboxEntries {
			if !strings.HasSuffix(entry.Name(), ".json") {
				continue
			}
			memberName := strings.TrimSuffix(entry.Name(), ".json")
			messages := w.readInbox(filepath.Join(inboxDir, entry.Name()))
			snapshot.Inboxes[memberName] = messages
		}
	}

	// Read tasks linked to lead session
	if config.LeadSessionID != "" {
		snapshot.Tasks = w.readTasks(config.LeadSessionID)
	}

	// Determine last modified from dir stat
	if info, err := os.Stat(teamDir); err == nil {
		snapshot.LastModified = info.ModTime().UnixMilli()
	}

	return snapshot
}

func (w *Watcher) readInbox(path string) []InboxMessage {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	var messages []InboxMessage
	if err := json.Unmarshal(data, &messages); err != nil {
		return nil
	}

	// Parse the nested JSON in Text field
	for i := range messages {
		var parsed map[string]interface{}
		if err := json.Unmarshal([]byte(messages[i].Text), &parsed); err == nil {
			if t, ok := parsed["type"].(string); ok {
				messages[i].ParsedType = t
			}
			if s, ok := parsed["subject"].(string); ok {
				messages[i].ParsedSubject = s
			}
			if id, ok := parsed["taskId"].(string); ok {
				messages[i].ParsedTaskID = id
			}
		}
	}

	return messages
}

func (w *Watcher) readTasks(sessionID string) []Task {
	taskDir := filepath.Join(w.tasksDir, sessionID)
	entries, err := os.ReadDir(taskDir)
	if err != nil {
		return nil
	}

	var tasks []Task
	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".json") || strings.HasPrefix(entry.Name(), ".") {
			continue
		}

		data, err := os.ReadFile(filepath.Join(taskDir, entry.Name()))
		if err != nil {
			continue
		}

		var task Task
		if err := json.Unmarshal(data, &task); err != nil {
			continue
		}

		if task.ID != "" {
			tasks = append(tasks, task)
		}
	}

	// Sort by ID
	sort.Slice(tasks, func(i, j int) bool {
		return tasks[i].ID < tasks[j].ID
	})

	return tasks
}
