package iterm

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"projecthub/internal/logging"
)

// ITermTab represents a tab in iTerm2
type ITermTab struct {
	WindowID int    `json:"windowId"`
	TabIndex int    `json:"tabIndex"`
	Name     string `json:"name"`
	IsActive bool   `json:"isActive"`
}

// ITermStatus represents the current iTerm2 status
type ITermStatus struct {
	Running bool       `json:"running"`
	Tabs    []ITermTab `json:"tabs"`
}

// Controller manages iTerm2 integration via AppleScript
type Controller struct {
	mu            sync.RWMutex
	lastStatus    *ITermStatus
	onStatusChange func(status *ITermStatus)
	pollTicker    *time.Ticker
	stopPolling   chan struct{}
}

// NewController creates a new iTerm2 controller
func NewController() *Controller {
	return &Controller{
		stopPolling: make(chan struct{}),
	}
}

// SetStatusChangeHandler sets the callback for status changes
func (c *Controller) SetStatusChangeHandler(handler func(status *ITermStatus)) {
	c.mu.Lock()
	c.onStatusChange = handler
	c.mu.Unlock()
}

// StartPolling starts polling iTerm2 for status changes
func (c *Controller) StartPolling(interval time.Duration) {
	c.pollTicker = time.NewTicker(interval)
	go func() {
		// Initial fetch
		c.pollStatus()

		for {
			select {
			case <-c.pollTicker.C:
				c.pollStatus()
			case <-c.stopPolling:
				c.pollTicker.Stop()
				return
			}
		}
	}()
	logging.Info("iTerm2 polling started", "interval", interval)
}

// StopPolling stops the polling loop (safe to call multiple times)
func (c *Controller) StopPolling() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.stopPolling != nil {
		close(c.stopPolling)
		c.stopPolling = nil
	}
}

func (c *Controller) pollStatus() {
	status, err := c.GetStatus()
	if err != nil {
		logging.Error("Failed to poll iTerm2 status", "error", err)
		return
	}

	c.mu.Lock()
	changed := c.hasStatusChanged(status)
	c.lastStatus = status
	handler := c.onStatusChange
	c.mu.Unlock()

	if changed && handler != nil {
		handler(status)
	}
}

func (c *Controller) hasStatusChanged(newStatus *ITermStatus) bool {
	if c.lastStatus == nil {
		return true
	}
	if c.lastStatus.Running != newStatus.Running {
		return true
	}
	if len(c.lastStatus.Tabs) != len(newStatus.Tabs) {
		return true
	}
	// Simple comparison - could be more sophisticated
	for i, tab := range newStatus.Tabs {
		if i >= len(c.lastStatus.Tabs) {
			return true
		}
		old := c.lastStatus.Tabs[i]
		if tab.Name != old.Name || tab.IsActive != old.IsActive {
			return true
		}
	}
	return false
}

// IsRunning checks if iTerm2 is running
func (c *Controller) IsRunning() bool {
	script := `tell application "System Events" to (name of processes) contains "iTerm2"`
	output, err := c.runAppleScript(script)
	if err != nil {
		return false
	}
	return strings.TrimSpace(output) == "true"
}

// GetStatus returns the current iTerm2 status including all tabs
func (c *Controller) GetStatus() (*ITermStatus, error) {
	if !c.IsRunning() {
		return &ITermStatus{Running: false, Tabs: []ITermTab{}}, nil
	}

	// AppleScript to get all tabs with their info using quote constant to avoid escape issues
	script := `
set q to quote
tell application "iTerm2"
	set output to "["
	set isFirst to true
	repeat with w in windows
		set windowId to id of w
		set currentSessId to ""
		try
			set currentSessId to id of current session of current tab of w
		end try

		set tabIdx to 0
		repeat with t in tabs of w
			set tabIdx to tabIdx + 1
			set sess to current session of t
			set sessName to name of sess
			set sessId to id of sess

			-- Strip process suffix using offset (avoids text item delimiters issues)
			set cleanName to sessName
			try
				set parenPos to offset of " (" in sessName
				if parenPos > 0 then
					set cleanName to text 1 thru (parenPos - 1) of sessName
				end if
			end try

			-- Replace quotes with apostrophes for JSON safety
			set safeName to ""
			repeat with c in cleanName
				set c to c as text
				if c is q then
					set safeName to safeName & "'"
				else
					set safeName to safeName & c
				end if
			end repeat

			set isActive to (sessId is currentSessId)

			if not isFirst then
				set output to output & ","
			end if
			set isFirst to false

			set output to output & "{" & q & "windowId" & q & ":" & windowId & "," & q & "tabIndex" & q & ":" & tabIdx & "," & q & "name" & q & ":" & q & safeName & q & "," & q & "isActive" & q & ":" & isActive & "}"
		end repeat
	end repeat
	set output to output & "]"
	return output
end tell
`

	output, err := c.runAppleScript(script)
	if err != nil {
		logging.Error("Failed to get iTerm2 tabs", "error", err)
		return &ITermStatus{Running: true, Tabs: []ITermTab{}}, nil
	}

	var tabs []ITermTab
	if err := json.Unmarshal([]byte(output), &tabs); err != nil {
		logging.Error("Failed to parse iTerm2 tabs JSON", "error", err, "output", output)
		return &ITermStatus{Running: true, Tabs: []ITermTab{}}, nil
	}

	return &ITermStatus{Running: true, Tabs: tabs}, nil
}

// LaunchITerm launches iTerm2 application
func (c *Controller) LaunchITerm() error {
	script := `tell application "iTerm2" to activate`
	_, err := c.runAppleScript(script)
	if err != nil {
		logging.Error("Failed to launch iTerm2", "error", err)
		return err
	}
	logging.Info("iTerm2 launched")
	return nil
}

// SwitchTab switches to a specific tab in iTerm2 without stealing focus
func (c *Controller) SwitchTab(windowID, tabIndex int) error {
	script := fmt.Sprintf(`
tell application "iTerm2"
	repeat with w in windows
		if id of w is %d then
			select tab %d of w
			return true
		end if
	end repeat
	return false
end tell
`, windowID, tabIndex)

	output, err := c.runAppleScript(script)
	if err != nil {
		logging.Error("Failed to switch iTerm2 tab", "windowId", windowID, "tabIndex", tabIndex, "error", err)
		return err
	}

	if strings.TrimSpace(output) != "true" {
		return fmt.Errorf("tab not found: window %d, tab %d", windowID, tabIndex)
	}

	logging.Info("Switched iTerm2 tab", "windowId", windowID, "tabIndex", tabIndex)
	return nil
}

// CreateTab creates a new tab in iTerm2 with the specified working directory and name
func (c *Controller) CreateTab(workingDir, tabName string) error {
	// Escape special characters for shell and AppleScript safety
	escapedPath := strings.ReplaceAll(workingDir, "'", "'\\''")

	// Sanitize tab name: remove newlines, escape backslashes and quotes
	escapedName := strings.ReplaceAll(tabName, "\n", "")
	escapedName = strings.ReplaceAll(escapedName, "\r", "")
	escapedName = strings.ReplaceAll(escapedName, "\\", "\\\\")
	escapedName = strings.ReplaceAll(escapedName, "'", "'\\''")
	escapedName = strings.ReplaceAll(escapedName, "\"", "\\\"")

	// Use escape sequences to set both tab title (OSC 1) and window title (OSC 2)
	// This is more reliable than AppleScript's "set name" which can be overridden by profile settings
	script := fmt.Sprintf(`
tell application "iTerm2"
	activate
	if (count of windows) is 0 then
		create window with default profile
	end if
	tell current window
		create tab with default profile
		tell current session
			set name to "%s"
			write text "cd '%s' && clear && printf '\\033]1;%s\\007\\033]2;%s\\007'"
		end tell
	end tell
end tell
`, escapedName, escapedPath, escapedName, escapedName)

	_, err := c.runAppleScript(script)
	if err != nil {
		logging.Error("Failed to create iTerm2 tab", "workingDir", logging.MaskPath(workingDir), "error", err)
		return err
	}

	logging.Info("Created iTerm2 tab", "workingDir", logging.MaskPath(workingDir))
	return nil
}

// CloseTab closes a specific tab in iTerm2
func (c *Controller) CloseTab(windowID, tabIndex int) error {
	script := fmt.Sprintf(`
tell application "iTerm2"
	repeat with w in windows
		if id of w is %d then
			close tab %d of w
			return true
		end if
	end repeat
	return false
end tell
`, windowID, tabIndex)

	output, err := c.runAppleScript(script)
	if err != nil {
		logging.Error("Failed to close iTerm2 tab", "windowId", windowID, "tabIndex", tabIndex, "error", err)
		return err
	}

	if strings.TrimSpace(output) != "true" {
		return fmt.Errorf("tab not found: window %d, tab %d", windowID, tabIndex)
	}

	logging.Info("Closed iTerm2 tab", "windowId", windowID, "tabIndex", tabIndex)
	return nil
}

// RenameTab renames a specific tab in iTerm2
func (c *Controller) RenameTab(windowID, tabIndex int, newName string) error {
	// Sanitize the new name
	escapedName := strings.ReplaceAll(newName, "\n", "")
	escapedName = strings.ReplaceAll(escapedName, "\r", "")
	escapedName = strings.ReplaceAll(escapedName, "\\", "\\\\")
	escapedName = strings.ReplaceAll(escapedName, "\"", "\\\"")

	script := fmt.Sprintf(`
tell application "iTerm2"
	repeat with w in windows
		if id of w is %d then
			tell tab %d of w
				tell current session
					set name to "%s"
				end tell
			end tell
			return true
		end if
	end repeat
	return false
end tell
`, windowID, tabIndex, escapedName)

	output, err := c.runAppleScript(script)
	if err != nil {
		logging.Error("Failed to rename iTerm2 tab", "windowId", windowID, "tabIndex", tabIndex, "error", err)
		return err
	}

	if strings.TrimSpace(output) != "true" {
		return fmt.Errorf("tab not found: window %d, tab %d", windowID, tabIndex)
	}

	logging.Info("Renamed iTerm2 tab", "windowId", windowID, "tabIndex", tabIndex, "newName", newName)
	return nil
}

// FocusITerm brings iTerm2 to the foreground
func (c *Controller) FocusITerm() error {
	script := `tell application "iTerm2" to activate`
	_, err := c.runAppleScript(script)
	return err
}

// WriteText writes text to the active iTerm2 session
func (c *Controller) WriteText(text string, pressEnter bool) error {
	if !c.IsRunning() {
		return fmt.Errorf("iTerm2 is not running")
	}

	// Escape special characters for AppleScript
	escapedText := strings.ReplaceAll(text, "\\", "\\\\")
	escapedText = strings.ReplaceAll(escapedText, "\"", "\\\"")
	escapedText = strings.ReplaceAll(escapedText, "\n", "\\n")
	escapedText = strings.ReplaceAll(escapedText, "\r", "\\r")
	escapedText = strings.ReplaceAll(escapedText, "\t", "\\t")

	var script string
	if pressEnter {
		// Write text and press Enter
		script = fmt.Sprintf(`
tell application "iTerm2"
	tell current session of current window
		write text "%s"
	end tell
end tell
`, escapedText)
	} else {
		// Write text without pressing Enter (using "write text ... without newline")
		script = fmt.Sprintf(`
tell application "iTerm2"
	tell current session of current window
		write text "%s" without newline
	end tell
end tell
`, escapedText)
	}

	_, err := c.runAppleScript(script)
	if err != nil {
		logging.Error("Failed to write text to iTerm2", "error", err)
		return err
	}

	logging.Debug("Wrote text to iTerm2", "length", len(text), "pressEnter", pressEnter)
	return nil
}

func (c *Controller) runAppleScript(script string) (string, error) {
	// Write script to temp file to avoid -e escaping issues
	tmpFile, err := os.CreateTemp("", "applescript-*.scpt")
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %w", err)
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.WriteString(script); err != nil {
		tmpFile.Close()
		return "", fmt.Errorf("failed to write script: %w", err)
	}
	// Ensure data is written to disk before running
	if err := tmpFile.Sync(); err != nil {
		tmpFile.Close()
		return "", fmt.Errorf("failed to sync script: %w", err)
	}
	tmpFile.Close()

	cmd := exec.Command("osascript", tmpFile.Name())
	output, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return "", fmt.Errorf("AppleScript error: %s", string(exitErr.Stderr))
		}
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

// ParseTabIndex parses a tab index from a string (for URL params, etc.)
func ParseTabIndex(s string) (int, error) {
	return strconv.Atoi(s)
}

// SessionInfo contains information about the active iTerm2 session
type SessionInfo struct {
	Name           string `json:"name"`
	ProfileName    string `json:"profileName"`
	Columns        int    `json:"columns"`
	Rows           int    `json:"rows"`
	CurrentCommand string `json:"currentCommand"`
	JobPid         int    `json:"jobPid"`
	IsProcessing   bool   `json:"isProcessing"`
}

// GetSessionContents returns the last N lines from the active iTerm2 session
// Returns raw terminal output - xterm.js handles ANSI codes and formatting
func (c *Controller) GetSessionContents(lines int) (string, error) {
	if !c.IsRunning() {
		return "", fmt.Errorf("iTerm2 is not running")
	}

	if lines <= 0 {
		lines = 50
	}

	script := `
tell application "iTerm2"
	tell current session of current window
		get contents
	end tell
end tell
`

	output, err := c.runAppleScript(script)
	if err != nil {
		logging.Error("Failed to get session contents", "error", err)
		return "", err
	}

	// Only limit lines, preserve all formatting for xterm.js
	allLines := strings.Split(output, "\n")
	if len(allLines) > lines {
		allLines = allLines[len(allLines)-lines:]
	}

	return strings.Join(allLines, "\n"), nil
}

// GetSessionInfo returns information about the active iTerm2 session
func (c *Controller) GetSessionInfo() (*SessionInfo, error) {
	if !c.IsRunning() {
		return nil, fmt.Errorf("iTerm2 is not running")
	}

	script := `
tell application "iTerm2"
	tell current session of current window
		set sessName to name
		set profName to profile name
		set cols to columns
		set rws to rows
		return sessName & "|||" & profName & "|||" & cols & "|||" & rws
	end tell
end tell
`

	output, err := c.runAppleScript(script)
	if err != nil {
		logging.Error("Failed to get session info", "error", err)
		return nil, err
	}

	parts := strings.Split(output, "|||")
	if len(parts) < 4 {
		return nil, fmt.Errorf("unexpected output format: %s", output)
	}

	cols, _ := strconv.Atoi(strings.TrimSpace(parts[2]))
	rows, _ := strconv.Atoi(strings.TrimSpace(parts[3]))
	jobPid := 0
	isProcessing := false

	// Extract current command from session name (usually "command (process)")
	name := strings.TrimSpace(parts[0])
	currentCommand := ""
	if idx := strings.LastIndex(name, " ("); idx > 0 {
		currentCommand = strings.TrimSuffix(name[idx+2:], ")")
	}

	return &SessionInfo{
		Name:           name,
		ProfileName:    strings.TrimSpace(parts[1]),
		Columns:        cols,
		Rows:           rows,
		CurrentCommand: currentCommand,
		JobPid:         jobPid,
		IsProcessing:   isProcessing,
	}, nil
}
