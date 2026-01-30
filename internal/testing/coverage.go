package testing

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// CoverageSummary represents parsed coverage data
type CoverageSummary struct {
	Total       CoverageMetrics            `json:"total"`
	ByFile      map[string]CoverageMetrics `json:"byFile,omitempty"`
	LastUpdated time.Time                  `json:"lastUpdated"`
	ProjectPath string                     `json:"projectPath"`
}

// CoverageMetrics represents coverage percentages
type CoverageMetrics struct {
	Lines      CoverageDetail `json:"lines"`
	Statements CoverageDetail `json:"statements"`
	Functions  CoverageDetail `json:"functions"`
	Branches   CoverageDetail `json:"branches"`
}

// CoverageDetail represents a single coverage metric
type CoverageDetail struct {
	Total   int     `json:"total"`
	Covered int     `json:"covered"`
	Skipped int     `json:"skipped"`
	Pct     float64 `json:"pct"`
}

// CoverageHistory represents coverage over time for trending
type CoverageHistory struct {
	Entries []CoverageHistoryEntry `json:"entries"`
}

// CoverageHistoryEntry represents a point in coverage history
type CoverageHistoryEntry struct {
	Timestamp time.Time `json:"timestamp"`
	Lines     float64   `json:"lines"`
	Functions float64   `json:"functions"`
	Branches  float64   `json:"branches"`
}

// CoverageWatcher watches for coverage file changes
type CoverageWatcher struct {
	mu              sync.RWMutex
	projectCoverage map[string]*CoverageSummary
	projectHistory  map[string]*CoverageHistory
	watchedPaths    map[string]time.Time // path -> last mod time
	onUpdate        func(projectPath string, summary *CoverageSummary)
}

// NewCoverageWatcher creates a new coverage watcher
func NewCoverageWatcher() *CoverageWatcher {
	return &CoverageWatcher{
		projectCoverage: make(map[string]*CoverageSummary),
		projectHistory:  make(map[string]*CoverageHistory),
		watchedPaths:    make(map[string]time.Time),
	}
}

// SetUpdateHandler sets the callback for coverage updates
func (w *CoverageWatcher) SetUpdateHandler(handler func(projectPath string, summary *CoverageSummary)) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.onUpdate = handler
}

// WatchProject starts watching a project's coverage directory
func (w *CoverageWatcher) WatchProject(projectPath string) {
	w.mu.Lock()
	w.watchedPaths[projectPath] = time.Time{}
	w.mu.Unlock()

	// Initial check
	w.checkCoverage(projectPath)
}

// UnwatchProject stops watching a project
func (w *CoverageWatcher) UnwatchProject(projectPath string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	delete(w.watchedPaths, projectPath)
	delete(w.projectCoverage, projectPath)
}

// CheckAll checks all watched projects for coverage updates
func (w *CoverageWatcher) CheckAll() {
	w.mu.RLock()
	paths := make([]string, 0, len(w.watchedPaths))
	for path := range w.watchedPaths {
		paths = append(paths, path)
	}
	w.mu.RUnlock()

	for _, path := range paths {
		w.checkCoverage(path)
	}
}

// checkCoverage checks for coverage file updates in a project
func (w *CoverageWatcher) checkCoverage(projectPath string) {
	coveragePaths := []string{
		filepath.Join(projectPath, "coverage", "coverage-summary.json"),
		filepath.Join(projectPath, "coverage", "coverage-final.json"),
		filepath.Join(projectPath, ".nyc_output", "coverage-summary.json"),
	}

	for _, coveragePath := range coveragePaths {
		info, err := os.Stat(coveragePath)
		if err != nil {
			continue
		}

		w.mu.RLock()
		lastMod, exists := w.watchedPaths[projectPath]
		w.mu.RUnlock()

		// Check if file was modified since last check
		if exists && !info.ModTime().After(lastMod) {
			continue
		}

		// Parse coverage file
		summary, err := w.parseCoverageFile(coveragePath, projectPath)
		if err != nil {
			continue
		}

		w.mu.Lock()
		w.watchedPaths[projectPath] = info.ModTime()
		w.projectCoverage[projectPath] = summary

		// Add to history
		if w.projectHistory[projectPath] == nil {
			w.projectHistory[projectPath] = &CoverageHistory{
				Entries: make([]CoverageHistoryEntry, 0),
			}
		}
		history := w.projectHistory[projectPath]
		history.Entries = append(history.Entries, CoverageHistoryEntry{
			Timestamp: time.Now(),
			Lines:     summary.Total.Lines.Pct,
			Functions: summary.Total.Functions.Pct,
			Branches:  summary.Total.Branches.Pct,
		})
		// Keep only last 50 entries
		if len(history.Entries) > 50 {
			history.Entries = history.Entries[len(history.Entries)-50:]
		}

		onUpdate := w.onUpdate
		w.mu.Unlock()

		// Notify handler
		if onUpdate != nil {
			onUpdate(projectPath, summary)
		}

		break // Found and processed coverage file
	}
}

// parseCoverageFile parses a coverage summary JSON file
func (w *CoverageWatcher) parseCoverageFile(path, projectPath string) (*CoverageSummary, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	// Try to parse as Istanbul/NYC format first
	var istanbulFormat struct {
		Total map[string]struct {
			Total   int     `json:"total"`
			Covered int     `json:"covered"`
			Skipped int     `json:"skipped"`
			Pct     float64 `json:"pct"`
		} `json:"total"`
	}

	if err := json.Unmarshal(data, &istanbulFormat); err == nil && istanbulFormat.Total != nil {
		summary := &CoverageSummary{
			LastUpdated: time.Now(),
			ProjectPath: projectPath,
		}

		if lines, ok := istanbulFormat.Total["lines"]; ok {
			summary.Total.Lines = CoverageDetail{
				Total:   lines.Total,
				Covered: lines.Covered,
				Skipped: lines.Skipped,
				Pct:     lines.Pct,
			}
		}
		if statements, ok := istanbulFormat.Total["statements"]; ok {
			summary.Total.Statements = CoverageDetail{
				Total:   statements.Total,
				Covered: statements.Covered,
				Skipped: statements.Skipped,
				Pct:     statements.Pct,
			}
		}
		if functions, ok := istanbulFormat.Total["functions"]; ok {
			summary.Total.Functions = CoverageDetail{
				Total:   functions.Total,
				Covered: functions.Covered,
				Skipped: functions.Skipped,
				Pct:     functions.Pct,
			}
		}
		if branches, ok := istanbulFormat.Total["branches"]; ok {
			summary.Total.Branches = CoverageDetail{
				Total:   branches.Total,
				Covered: branches.Covered,
				Skipped: branches.Skipped,
				Pct:     branches.Pct,
			}
		}

		return summary, nil
	}

	// Try V8/c8 format
	var v8Format map[string]interface{}
	if err := json.Unmarshal(data, &v8Format); err == nil {
		if total, ok := v8Format["total"].(map[string]interface{}); ok {
			summary := &CoverageSummary{
				LastUpdated: time.Now(),
				ProjectPath: projectPath,
			}

			if lines, ok := total["lines"].(map[string]interface{}); ok {
				summary.Total.Lines = parseCoverageDetail(lines)
			}
			if statements, ok := total["statements"].(map[string]interface{}); ok {
				summary.Total.Statements = parseCoverageDetail(statements)
			}
			if functions, ok := total["functions"].(map[string]interface{}); ok {
				summary.Total.Functions = parseCoverageDetail(functions)
			}
			if branches, ok := total["branches"].(map[string]interface{}); ok {
				summary.Total.Branches = parseCoverageDetail(branches)
			}

			return summary, nil
		}
	}

	return nil, os.ErrNotExist
}

func parseCoverageDetail(data map[string]interface{}) CoverageDetail {
	detail := CoverageDetail{}
	if v, ok := data["total"].(float64); ok {
		detail.Total = int(v)
	}
	if v, ok := data["covered"].(float64); ok {
		detail.Covered = int(v)
	}
	if v, ok := data["skipped"].(float64); ok {
		detail.Skipped = int(v)
	}
	if v, ok := data["pct"].(float64); ok {
		detail.Pct = v
	}
	return detail
}

// GetCoverage returns the current coverage summary for a project
func (w *CoverageWatcher) GetCoverage(projectPath string) *CoverageSummary {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.projectCoverage[projectPath]
}

// GetHistory returns coverage history for a project
func (w *CoverageWatcher) GetHistory(projectPath string) *CoverageHistory {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.projectHistory[projectPath]
}

// GetAllCoverage returns coverage for all watched projects
func (w *CoverageWatcher) GetAllCoverage() map[string]*CoverageSummary {
	w.mu.RLock()
	defer w.mu.RUnlock()

	result := make(map[string]*CoverageSummary)
	for path, summary := range w.projectCoverage {
		result[path] = summary
	}
	return result
}

// StartPolling starts a background goroutine that periodically checks for coverage updates
func (w *CoverageWatcher) StartPolling(interval time.Duration, stop <-chan struct{}) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			w.CheckAll()
		case <-stop:
			return
		}
	}
}
