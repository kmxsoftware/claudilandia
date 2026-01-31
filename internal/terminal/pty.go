package terminal

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"

	"projecthub/internal/logging"

	"github.com/creack/pty"
	"github.com/google/uuid"
)

// Terminal represents a PTY terminal session
type Terminal struct {
	ID       string
	Name     string
	Pty      *os.File
	Cmd      *exec.Cmd
	WorkDir  string
	running  bool
	mu       sync.Mutex
	onOutput func(id string, data []byte)
	onExit   func(id string)
	// Flow control with condition variable for true blocking
	pauseCond *sync.Cond
	isPaused  bool
}

// Manager manages multiple terminal sessions
type Manager struct {
	terminals map[string]*Terminal
	mu        sync.RWMutex
	onOutput  func(id string, data []byte)
	onExit    func(id string)
}

// NewManager creates a new terminal manager
func NewManager() *Manager {
	return &Manager{
		terminals: make(map[string]*Terminal),
	}
}

// SetOutputHandler sets the callback for terminal output
func (m *Manager) SetOutputHandler(handler func(id string, data []byte)) {
	m.onOutput = handler
}

// SetExitHandler sets the callback for terminal exit
func (m *Manager) SetExitHandler(handler func(id string)) {
	m.onExit = handler
}

// Create creates a new terminal session with auto-generated ID
func (m *Manager) Create(name, workDir string) (*Terminal, error) {
	return m.CreateWithID(uuid.New().String(), name, workDir)
}

// CreateWithID creates a new terminal session with a specific ID
func (m *Manager) CreateWithID(id, name, workDir string) (*Terminal, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Get default shell
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/zsh"
	}

	// Create command
	cmd := exec.Command(shell, "-l")
	cmd.Dir = workDir
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
	)

	// Start with PTY
	ptmx, err := pty.Start(cmd)
	if err != nil {
		logging.Error("Failed to start PTY", "id", id, "workDir", workDir, "error", err)
		return nil, err
	}

	// Set initial size
	pty.Setsize(ptmx, &pty.Winsize{
		Rows: 24,
		Cols: 80,
	})

	term := &Terminal{
		ID:       id,
		Name:     name,
		Pty:      ptmx,
		Cmd:      cmd,
		WorkDir:  workDir,
		running:  true,
		onOutput: m.onOutput,
		onExit:   m.onExit,
		isPaused: false,
	}
	term.pauseCond = sync.NewCond(&term.mu)

	m.terminals[term.ID] = term

	// Start reading output
	go term.readOutput()

	// Wait for process to exit
	go term.waitForExit()

	logging.Info("Terminal created", "id", term.ID, "name", name, "workDir", logging.MaskPath(workDir))
	return term, nil
}

// Get returns a terminal by ID
func (m *Manager) Get(id string) *Terminal {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.terminals[id]
}

// List returns all terminals
func (m *Manager) List() []*Terminal {
	m.mu.RLock()
	defer m.mu.RUnlock()

	list := make([]*Terminal, 0, len(m.terminals))
	for _, t := range m.terminals {
		list = append(list, t)
	}
	return list
}

// Close closes a terminal session
func (m *Manager) Close(id string) error {
	m.mu.Lock()
	term, exists := m.terminals[id]
	if !exists {
		m.mu.Unlock()
		return nil
	}
	delete(m.terminals, id)
	m.mu.Unlock()

	logging.Info("Terminal closed", "id", id)
	return term.Close()
}

// CloseAll closes all terminal sessions
func (m *Manager) CloseAll() {
	m.mu.Lock()
	terms := make([]*Terminal, 0, len(m.terminals))
	for _, t := range m.terminals {
		terms = append(terms, t)
	}
	m.terminals = make(map[string]*Terminal)
	m.mu.Unlock()

	for _, t := range terms {
		t.Close()
	}
}

// Write writes data to a terminal
func (m *Manager) Write(id string, data []byte) error {
	term := m.Get(id)
	if term == nil {
		return fmt.Errorf("terminal not found: %s", id)
	}
	return term.Write(data)
}

// Resize resizes a terminal
func (m *Manager) Resize(id string, rows, cols uint16) error {
	term := m.Get(id)
	if term == nil {
		return fmt.Errorf("terminal not found: %s", id)
	}
	return term.Resize(rows, cols)
}

// Pause pauses PTY output reading (flow control)
func (m *Manager) Pause(id string) {
	term := m.Get(id)
	if term != nil {
		term.Pause()
	}
}

// Resume resumes PTY output reading (flow control)
func (m *Manager) Resume(id string) {
	term := m.Get(id)
	if term != nil {
		term.Resume()
	}
}

// Terminal methods

// Pause pauses the terminal output reading (flow control)
func (t *Terminal) Pause() {
	t.mu.Lock()
	t.isPaused = true
	t.mu.Unlock()
}

// Resume resumes the terminal output reading (flow control)
func (t *Terminal) Resume() {
	t.mu.Lock()
	t.isPaused = false
	t.pauseCond.Signal() // Wake up readOutput goroutine
	t.mu.Unlock()
}

// IsPaused returns whether the terminal is currently paused
func (t *Terminal) IsPaused() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.isPaused
}

func (t *Terminal) readOutput() {
	buf := make([]byte, 4096)
	for {
		// Block while paused - true blocking with sync.Cond
		t.mu.Lock()
		for t.isPaused {
			t.pauseCond.Wait() // Releases lock, waits for Signal(), reacquires lock
		}
		t.mu.Unlock()

		n, err := t.Pty.Read(buf)
		if err != nil {
			if err != io.EOF {
				// Log error but don't crash
			}
			return
		}
		if n > 0 && t.onOutput != nil {
			data := make([]byte, n)
			copy(data, buf[:n])
			t.onOutput(t.ID, data)
		}
	}
}

func (t *Terminal) waitForExit() {
	t.Cmd.Wait()
	t.mu.Lock()
	t.running = false
	t.mu.Unlock()
	if t.onExit != nil {
		t.onExit(t.ID)
	}
}

// Write writes data to the terminal
func (t *Terminal) Write(data []byte) error {
	_, err := t.Pty.Write(data)
	return err
}

// Resize resizes the terminal
func (t *Terminal) Resize(rows, cols uint16) error {
	return pty.Setsize(t.Pty, &pty.Winsize{
		Rows: rows,
		Cols: cols,
	})
}

// Close closes the terminal
func (t *Terminal) Close() error {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.Cmd != nil && t.Cmd.Process != nil {
		t.Cmd.Process.Kill()
	}
	if t.Pty != nil {
		t.Pty.Close()
	}
	t.running = false
	return nil
}

// IsRunning returns whether the terminal is running
func (t *Terminal) IsRunning() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.running
}

// TerminalInfo is the info sent to frontend
type TerminalInfo struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	WorkDir string `json:"workDir"`
	Running bool   `json:"running"`
}

// Info returns terminal info for frontend
func (t *Terminal) Info() TerminalInfo {
	return TerminalInfo{
		ID:      t.ID,
		Name:    t.Name,
		WorkDir: t.WorkDir,
		Running: t.IsRunning(),
	}
}
