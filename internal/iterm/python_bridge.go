package iterm

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"time"

	"projecthub/internal/logging"
)

// StyledRun represents a run of text with uniform styling
type StyledRun struct {
	Text          string `json:"t"`
	FgColor       string `json:"fg,omitempty"`
	BgColor       string `json:"bg,omitempty"`
	Bold          bool   `json:"b,omitempty"`
	Italic        bool   `json:"i,omitempty"`
	Underline     bool   `json:"u,omitempty"`
	Strikethrough bool   `json:"s,omitempty"`
	Inverse       bool   `json:"inv,omitempty"`
	Faint         bool   `json:"f,omitempty"`
}

// CursorPos represents cursor position
type CursorPos struct {
	X int `json:"x"`
	Y int `json:"y"`
}

// StyledContent represents a full screen of styled terminal content
type StyledContent struct {
	SessionID string        `json:"sessionId"`
	Lines     [][]StyledRun `json:"lines"`
	Cursor    CursorPos     `json:"cursor"`
	Cols      int           `json:"cols"`
	Rows      int           `json:"rows"`
}

// ProfileColors represents the iTerm2 profile color palette
type ProfileColors struct {
	Fg     string   `json:"fg"`
	Bg     string   `json:"bg"`
	Cursor string   `json:"cursor"`
	Ansi   []string `json:"ansi"`
}

// ProfileData is sent from the Python bridge when a session's profile is read
type ProfileData struct {
	SessionID string        `json:"sessionId"`
	Colors    ProfileColors `json:"colors"`
}

// bridgeMessage is the generic JSON envelope from the Python bridge
type bridgeMessage struct {
	Type      string          `json:"type"`
	SessionID string          `json:"sessionId,omitempty"`
	Message   string          `json:"message,omitempty"`
	Lines     json.RawMessage `json:"lines,omitempty"`
	Cursor    *CursorPos      `json:"cursor,omitempty"`
	Cols      int             `json:"cols,omitempty"`
	Rows      int             `json:"rows,omitempty"`
	Colors    *ProfileColors  `json:"colors,omitempty"`
}

// bridgeCommand is a command sent to the Python bridge via stdin
type bridgeCommand struct {
	Cmd       string `json:"cmd"`
	SessionID string `json:"sessionId,omitempty"`
}

// PythonBridge manages the Python bridge subprocess
type PythonBridge struct {
	mu         sync.Mutex
	cmd        *exec.Cmd
	stdin      io.WriteCloser
	stdout     io.ReadCloser
	running    bool
	ready      bool
	readyCh    chan struct{}
	scriptPath string
	pythonPath string

	onContent func(*StyledContent)
	onProfile func(*ProfileData)
	onHistory func(*StyledContent)
	onError   func(string)
}

// NewPythonBridge creates a new bridge instance
func NewPythonBridge(scriptPath string, pythonPath string) *PythonBridge {
	return &PythonBridge{
		scriptPath: scriptPath,
		pythonPath: pythonPath,
		readyCh:    make(chan struct{}),
	}
}

// SetContentHandler sets the callback for styled content updates
func (b *PythonBridge) SetContentHandler(handler func(*StyledContent)) {
	b.mu.Lock()
	b.onContent = handler
	b.mu.Unlock()
}

// SetProfileHandler sets the callback for profile color data
func (b *PythonBridge) SetProfileHandler(handler func(*ProfileData)) {
	b.mu.Lock()
	b.onProfile = handler
	b.mu.Unlock()
}

// SetHistoryHandler sets the callback for styled scrollback history
func (b *PythonBridge) SetHistoryHandler(handler func(*StyledContent)) {
	b.mu.Lock()
	b.onHistory = handler
	b.mu.Unlock()
}

// RequestHistory asks the bridge to fetch styled scrollback history
func (b *PythonBridge) RequestHistory(sessionID string) error {
	return b.sendCommand(bridgeCommand{Cmd: "history", SessionID: sessionID})
}

// SetErrorHandler sets the callback for bridge errors
func (b *PythonBridge) SetErrorHandler(handler func(string)) {
	b.mu.Lock()
	b.onError = handler
	b.mu.Unlock()
}

// Start launches the Python bridge process
func (b *PythonBridge) Start() error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.running {
		return nil
	}

	b.cmd = exec.Command(b.pythonPath, b.scriptPath)

	var err error
	b.stdin, err = b.cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("stdin pipe: %w", err)
	}

	b.stdout, err = b.cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("stdout pipe: %w", err)
	}

	b.cmd.Stderr = &bridgeStderrWriter{}

	if err := b.cmd.Start(); err != nil {
		return fmt.Errorf("start python bridge: %w", err)
	}

	b.running = true
	b.readyCh = make(chan struct{})

	go b.readOutput()

	go func() {
		err := b.cmd.Wait()
		b.mu.Lock()
		b.running = false
		b.ready = false
		b.mu.Unlock()
		if err != nil {
			logging.Warn("Python bridge exited", "error", err)
		} else {
			logging.Info("Python bridge exited normally")
		}
	}()

	logging.Info("Python bridge started", "script", b.scriptPath, "python", b.pythonPath)
	return nil
}

// WaitReady waits for the bridge to be connected and ready
func (b *PythonBridge) WaitReady(timeout time.Duration) error {
	select {
	case <-b.readyCh:
		return nil
	case <-time.After(timeout):
		return fmt.Errorf("bridge not ready within %s", timeout)
	}
}

// Stop shuts down the Python bridge
func (b *PythonBridge) Stop() {
	b.mu.Lock()
	running := b.running
	b.mu.Unlock()

	if !running {
		return
	}

	b.sendCommand(bridgeCommand{Cmd: "quit"})

	// Give it 2 seconds, then force-kill
	go func() {
		time.Sleep(2 * time.Second)
		b.mu.Lock()
		if b.running && b.cmd != nil && b.cmd.Process != nil {
			b.cmd.Process.Kill()
		}
		b.mu.Unlock()
	}()

	logging.Info("Python bridge stopping")
}

// IsRunning returns whether the bridge process is alive
func (b *PythonBridge) IsRunning() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.running
}

// IsReady returns whether the bridge has connected to iTerm2
func (b *PythonBridge) IsReady() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.running && b.ready
}

// SendWatch sends a watch command for a session
func (b *PythonBridge) SendWatch(sessionID string) error {
	return b.sendCommand(bridgeCommand{Cmd: "watch", SessionID: sessionID})
}

// SendStop sends a stop command
func (b *PythonBridge) SendStop() error {
	return b.sendCommand(bridgeCommand{Cmd: "stop"})
}

func (b *PythonBridge) sendCommand(cmd bridgeCommand) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if !b.running || b.stdin == nil {
		return fmt.Errorf("bridge not running")
	}

	data, err := json.Marshal(cmd)
	if err != nil {
		return fmt.Errorf("marshal command: %w", err)
	}

	logging.Info("Bridge sendCommand", "json", string(data))
	n, err := b.stdin.Write(append(data, '\n'))
	logging.Info("Bridge sendCommand result", "bytesWritten", n, "error", err)
	return err
}

// readOutput reads JSON lines from stdout and dispatches to handlers
func (b *PythonBridge) readOutput() {
	scanner := bufio.NewScanner(b.stdout)
	scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024)

	logging.Info("readOutput: goroutine started, waiting for lines...")
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		logging.Info("Bridge received line", "length", len(line), "type_hint", string(line[:min(50, len(line))]))

		var msg bridgeMessage
		if err := json.Unmarshal(line, &msg); err != nil {
			logging.Debug("Bridge: invalid JSON", "error", err)
			continue
		}

		logging.Info("Bridge parsed message", "type", msg.Type, "sessionId", msg.SessionID)

		switch msg.Type {
		case "ready":
			b.mu.Lock()
			b.ready = true
			close(b.readyCh)
			b.mu.Unlock()
			logging.Info("Python bridge ready (connected to iTerm2)")

		case "content":
			b.mu.Lock()
			handler := b.onContent
			b.mu.Unlock()
			if handler != nil {
				content := &StyledContent{
					SessionID: msg.SessionID,
					Cols:      msg.Cols,
					Rows:      msg.Rows,
				}
				if msg.Cursor != nil {
					content.Cursor = *msg.Cursor
				}
				json.Unmarshal(msg.Lines, &content.Lines)
				handler(content)
			}

		case "profile":
			b.mu.Lock()
			handler := b.onProfile
			b.mu.Unlock()
			if handler != nil && msg.Colors != nil {
				handler(&ProfileData{
					SessionID: msg.SessionID,
					Colors:    *msg.Colors,
				})
			}

		case "history":
			b.mu.Lock()
			handler := b.onHistory
			b.mu.Unlock()
			if handler != nil {
				content := &StyledContent{
					SessionID: msg.SessionID,
				}
				json.Unmarshal(msg.Lines, &content.Lines)
				handler(content)
			}

		case "error":
			b.mu.Lock()
			handler := b.onError
			b.mu.Unlock()
			if handler != nil {
				handler(msg.Message)
			}
			logging.Warn("Python bridge error", "message", msg.Message)

		case "stopped":
			logging.Debug("Python bridge: streaming stopped")
		}
	}

	if err := scanner.Err(); err != nil {
		logging.Error("readOutput: scanner error", "error", err)
	} else {
		logging.Info("readOutput: scanner EOF (bridge process ended)")
	}
}

// bridgeStderrWriter logs Python stderr
type bridgeStderrWriter struct{}

func (w *bridgeStderrWriter) Write(p []byte) (n int, err error) {
	logging.Info("Python bridge stderr", "output", string(p))
	return len(p), nil
}
