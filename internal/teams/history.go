package teams

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// TeamHistoryEntry stores summary of an archived team
type TeamHistoryEntry struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	CreatedAt   int64  `json:"createdAt"`
	ArchivedAt  int64  `json:"archivedAt"`
	MemberCount int    `json:"memberCount"`
	TaskCount   int    `json:"taskCount"`
}

// History manages team history persistence
type History struct {
	mu      sync.RWMutex
	entries []TeamHistoryEntry
	path    string
}

// NewHistory creates a new history manager
func NewHistory() *History {
	homeDir, _ := os.UserHomeDir()
	historyDir := filepath.Join(homeDir, ".projecthub")
	os.MkdirAll(historyDir, 0755)

	h := &History{
		path: filepath.Join(historyDir, "teams-history.json"),
	}
	h.load()
	return h
}

// GetEntries returns all history entries
func (h *History) GetEntries() []TeamHistoryEntry {
	h.mu.RLock()
	defer h.mu.RUnlock()

	result := make([]TeamHistoryEntry, len(h.entries))
	copy(result, h.entries)
	return result
}

// Archive saves a team snapshot as a history entry
func (h *History) Archive(snapshot *TeamSnapshot) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Check if already archived
	for _, e := range h.entries {
		if e.Name == snapshot.Name && e.CreatedAt == snapshot.CreatedAt {
			return
		}
	}

	entry := TeamHistoryEntry{
		Name:        snapshot.Name,
		Description: snapshot.Description,
		CreatedAt:   snapshot.CreatedAt,
		ArchivedAt:  time.Now().UnixMilli(),
		MemberCount: len(snapshot.Members),
		TaskCount:   len(snapshot.Tasks),
	}

	h.entries = append(h.entries, entry)
	h.save()
}

func (h *History) load() {
	data, err := os.ReadFile(h.path)
	if err != nil {
		return
	}
	json.Unmarshal(data, &h.entries)
}

func (h *History) save() {
	data, err := json.MarshalIndent(h.entries, "", "  ")
	if err != nil {
		return
	}
	os.WriteFile(h.path, data, 0644)
}
