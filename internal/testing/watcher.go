package testing

import (
	"log/slog"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ansiPattern matches ANSI escape sequences
var ansiPattern = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)

// stripANSI removes ANSI escape sequences from text
func stripANSI(text string) string {
	return ansiPattern.ReplaceAllString(text, "")
}

// TestStatus represents the current state of test execution
type TestStatus string

const (
	StatusNone    TestStatus = "none"
	StatusRunning TestStatus = "running"
	StatusPassed  TestStatus = "passed"
	StatusFailed  TestStatus = "failed"
	StatusMixed   TestStatus = "mixed" // Some passed, some failed
)

// TestRunner identifies the test framework
type TestRunner string

const (
	RunnerUnknown    TestRunner = "unknown"
	RunnerVitest     TestRunner = "vitest"
	RunnerPlaywright TestRunner = "playwright"
	RunnerJest       TestRunner = "jest"
	RunnerMocha      TestRunner = "mocha"
	RunnerPytest     TestRunner = "pytest"
	RunnerGo         TestRunner = "go"
)

// TestResult represents a single test result
type TestResult struct {
	Name     string     `json:"name"`
	Status   TestStatus `json:"status"`
	Duration float64    `json:"duration"` // in milliseconds
	Error    string     `json:"error,omitempty"`
}

// TestSummary represents the overall test run summary
type TestSummary struct {
	Runner        TestRunner   `json:"runner"`
	Status        TestStatus   `json:"status"`
	Passed        int          `json:"passed"`
	Failed        int          `json:"failed"`
	Skipped       int          `json:"skipped"`
	Total         int          `json:"total"`
	Duration      float64      `json:"duration"` // in milliseconds
	FailedTests   []TestResult `json:"failedTests,omitempty"`
	StartTime     time.Time    `json:"startTime"`
	EndTime       time.Time    `json:"endTime,omitempty"`
	CoveragePercent float64    `json:"coveragePercent,omitempty"`
}

// TerminalTestState tracks test state for a terminal
type TerminalTestState struct {
	Summary      *TestSummary
	IsRunning    bool
	LastActivity time.Time
	OutputBuffer strings.Builder
}

// Watcher analyzes terminal output to detect and parse test results
type Watcher struct {
	terminalStates map[string]*TerminalTestState
	mu             sync.RWMutex

	// Patterns for detection
	runnerPatterns   map[TestRunner][]*regexp.Regexp
	summaryPatterns  map[TestRunner]*regexp.Regexp
	failedPatterns   map[TestRunner]*regexp.Regexp
	coveragePattern  *regexp.Regexp
}

// NewWatcher creates a new test output watcher
func NewWatcher() *Watcher {
	w := &Watcher{
		terminalStates: make(map[string]*TerminalTestState),
		runnerPatterns: make(map[TestRunner][]*regexp.Regexp),
		summaryPatterns: make(map[TestRunner]*regexp.Regexp),
		failedPatterns: make(map[TestRunner]*regexp.Regexp),
	}

	// Runner detection patterns
	w.runnerPatterns[RunnerVitest] = []*regexp.Regexp{
		regexp.MustCompile(`(?i)vitest`),
		regexp.MustCompile(`(?i)vite.*test`),
		regexp.MustCompile(`RUN\s+v\d+\.\d+`), // Vitest version output
	}
	w.runnerPatterns[RunnerPlaywright] = []*regexp.Regexp{
		regexp.MustCompile(`(?i)playwright`),
		regexp.MustCompile(`Running \d+ tests? using \d+ workers?`),
		regexp.MustCompile(`\d+ passed.*\(\d+(\.\d+)?[sm]\)`),
	}
	w.runnerPatterns[RunnerJest] = []*regexp.Regexp{
		regexp.MustCompile(`(?i)jest`),
		regexp.MustCompile(`PASS|FAIL.*\.test\.(js|ts|jsx|tsx)`),
	}
	w.runnerPatterns[RunnerPytest] = []*regexp.Regexp{
		regexp.MustCompile(`(?i)pytest`),
		regexp.MustCompile(`=+ test session starts =+`),
		regexp.MustCompile(`collected \d+ items?`),
	}
	w.runnerPatterns[RunnerGo] = []*regexp.Regexp{
		regexp.MustCompile(`(?i)go test`),
		regexp.MustCompile(`--- PASS:|--- FAIL:`),
		regexp.MustCompile(`PASS\s+\w+/\w+`),
	}

	// Summary patterns (captures passed, failed counts)
	// Vitest: "✓ 17 tests passed" or "Test Files  2 passed (2)"
	w.summaryPatterns[RunnerVitest] = regexp.MustCompile(`(?:Tests?\s+)?(\d+)\s+passed.*?(\d+)?\s*failed?|(\d+)\s+passed`)

	// Playwright: "2 passed (5s)" or "1 failed, 2 passed"
	w.summaryPatterns[RunnerPlaywright] = regexp.MustCompile(`(\d+)\s+failed.*?(\d+)\s+passed|(\d+)\s+passed`)

	// Jest: "Tests: 5 passed, 2 failed, 7 total"
	w.summaryPatterns[RunnerJest] = regexp.MustCompile(`Tests:\s+(\d+)\s+passed.*?(\d+)\s+failed.*?(\d+)\s+total`)

	// Failed test patterns
	w.failedPatterns[RunnerVitest] = regexp.MustCompile(`(?:FAIL|✗|×)\s+(.+?)\s+(?:\d+ms)?`)
	w.failedPatterns[RunnerPlaywright] = regexp.MustCompile(`\d+\)\s+\[.+?\]\s+›\s+(.+)`)
	w.failedPatterns[RunnerJest] = regexp.MustCompile(`FAIL\s+(.+\.test\.\w+)`)

	// Coverage pattern (generic)
	w.coveragePattern = regexp.MustCompile(`(?:All files|Coverage)\s*\|?\s*(\d+(?:\.\d+)?)\s*%`)

	return w
}

// Analyze processes terminal output and returns test summary if detected
// Returns (summary, changed) where changed indicates if the status has changed
func (w *Watcher) Analyze(termID string, data []byte) (*TestSummary, bool) {
	w.mu.Lock()
	defer w.mu.Unlock()

	state, exists := w.terminalStates[termID]
	if !exists {
		state = &TerminalTestState{
			Summary: &TestSummary{
				Runner:    RunnerUnknown,
				Status:    StatusNone,
				StartTime: time.Now(),
			},
		}
		w.terminalStates[termID] = state
	}

	oldStatus := state.Summary.Status
	state.LastActivity = time.Now()

	text := string(data)
	state.OutputBuffer.WriteString(text)

	// Detect test runner if not already detected
	if state.Summary.Runner == RunnerUnknown {
		state.Summary.Runner = w.detectRunner(text)
	}

	// Check if tests are starting
	if w.isTestStarting(text) {
		state.IsRunning = true
		state.Summary.Status = StatusRunning
		state.Summary.StartTime = time.Now()
		state.Summary.Passed = 0
		state.Summary.Failed = 0
		state.Summary.Skipped = 0
		state.Summary.Total = 0
		state.Summary.FailedTests = nil
		return state.Summary, state.Summary.Status != oldStatus
	}

	// Parse test results from current chunk
	w.parseTestOutput(state, text)

	// Check for completion indicators in current chunk OR accumulated buffer
	fullBuffer := state.OutputBuffer.String()
	completeInChunk := w.isTestComplete(text)
	completeInBuffer := w.isTestComplete(fullBuffer)

	if completeInChunk || completeInBuffer {
		slog.Debug("Test completion detected",
			"termID", termID,
			"completeInChunk", completeInChunk,
			"completeInBuffer", completeInBuffer,
			"bufferLen", len(fullBuffer),
			"currentPassed", state.Summary.Passed,
			"currentFailed", state.Summary.Failed)

		// Re-parse the entire accumulated buffer to ensure we capture summary
		// This handles the case where summary and completion come in separate chunks
		w.parseTestOutput(state, fullBuffer)

		slog.Debug("After re-parsing buffer",
			"termID", termID,
			"passed", state.Summary.Passed,
			"failed", state.Summary.Failed,
			"total", state.Summary.Total)

		state.IsRunning = false
		state.Summary.EndTime = time.Now()

		// Determine final status
		if state.Summary.Failed > 0 {
			if state.Summary.Passed > 0 {
				state.Summary.Status = StatusMixed
			} else {
				state.Summary.Status = StatusFailed
			}
		} else if state.Summary.Passed > 0 {
			state.Summary.Status = StatusPassed
		}

		slog.Debug("Final test status",
			"termID", termID,
			"status", state.Summary.Status,
			"passed", state.Summary.Passed,
			"failed", state.Summary.Failed)

		// Clear buffer after completion
		state.OutputBuffer.Reset()
	}

	return state.Summary, state.Summary.Status != oldStatus
}

// detectRunner identifies the test framework from output
func (w *Watcher) detectRunner(text string) TestRunner {
	cleanText := stripANSI(text)
	for runner, patterns := range w.runnerPatterns {
		for _, pattern := range patterns {
			if pattern.MatchString(cleanText) {
				return runner
			}
		}
	}
	return RunnerUnknown
}

// isTestStarting checks if tests are starting
func (w *Watcher) isTestStarting(text string) bool {
	cleanText := stripANSI(text)

	// Use regex for more precise matching to avoid false positives
	// like "rerun" matching "RUN" or help text triggering restart
	startPatterns := []*regexp.Regexp{
		regexp.MustCompile(`(?i)^\s*RUN\s+v\d`),           // Vitest: "RUN  v1.2.3"
		regexp.MustCompile(`(?i)Running \d+ tests?`),      // Playwright: "Running 5 tests"
		regexp.MustCompile(`(?i)^\s*RUNS\s`),              // Jest: "RUNS ..."
		regexp.MustCompile(`test session starts`),         // Pytest
		regexp.MustCompile(`=== RUN\s+Test`),              // Go: "=== RUN   TestFoo"
		regexp.MustCompile(`(?i)^\s*>\s*.*npm\s+(run\s+)?test`), // npm test in terminal
		regexp.MustCompile(`(?i)^\s*>\s*vitest`),          // vitest command
		regexp.MustCompile(`(?i)^\s*>\s*playwright test`), // playwright test command
		regexp.MustCompile(`DEV\s+v\d+\.\d+`),             // Vitest dev mode: "DEV  v1.2.3"
		regexp.MustCompile(`(?i)vitest.*v\d+\.\d+`),       // Vitest version output
	}

	for _, pattern := range startPatterns {
		if pattern.MatchString(cleanText) {
			return true
		}
	}
	return false
}

// isTestComplete checks if tests have finished
func (w *Watcher) isTestComplete(text string) bool {
	cleanText := stripANSI(text)

	// Vitest-specific: look for final indicators that come AFTER test counts
	// The output order is: Test Files -> Tests -> Start at -> Duration -> PASS/Waiting
	vitestFinalPatterns := []string{
		"Waiting for file changes", // Vitest watch mode - definitive end
		"press h to show help",     // Vitest interactive mode
	}
	for _, pattern := range vitestFinalPatterns {
		if strings.Contains(cleanText, pattern) {
			return true
		}
	}

	// Generic completion patterns (non-Vitest or Vitest non-watch mode)
	completePatterns := []string{
		"tests passed",            // Generic
		"Tests:",                  // Jest summary
		"passed, ",                // Generic with comma (Jest style)
		"failed, ",                // Generic with comma
		"=== PASS",                // Go
		"=== FAIL",                // Go
		"passed in",               // Generic
		"PASSED",                  // Pytest
		"FAILED",                  // Generic uppercase
	}

	for _, pattern := range completePatterns {
		if strings.Contains(cleanText, pattern) {
			return true
		}
	}
	return false
}

// parseTestOutput extracts test results from output
func (w *Watcher) parseTestOutput(state *TerminalTestState, text string) {
	// Strip ANSI escape sequences for clean pattern matching
	cleanText := stripANSI(text)

	// First, try to parse summary line - this is the authoritative source
	// The summary line will set the final counts directly
	w.parseSummaryLine(state, cleanText)

	// Extract failed test names
	if state.Summary.Runner != RunnerUnknown {
		if pattern, ok := w.failedPatterns[state.Summary.Runner]; ok {
			matches := pattern.FindAllStringSubmatch(cleanText, -1)
			for _, match := range matches {
				if len(match) > 1 {
					// Avoid duplicates
					testName := strings.TrimSpace(match[1])
					isDuplicate := false
					for _, ft := range state.Summary.FailedTests {
						if ft.Name == testName {
							isDuplicate = true
							break
						}
					}
					if !isDuplicate {
						state.Summary.FailedTests = append(state.Summary.FailedTests, TestResult{
							Name:   testName,
							Status: StatusFailed,
						})
					}
				}
			}
		}
	}

	// Check for coverage
	if matches := w.coveragePattern.FindStringSubmatch(cleanText); len(matches) > 1 {
		if cov, err := strconv.ParseFloat(matches[1], 64); err == nil {
			state.Summary.CoveragePercent = cov
		}
	}
}

// parseSummaryLine extracts counts from summary line
func (w *Watcher) parseSummaryLine(state *TerminalTestState, text string) {
	// Vitest format: "    Tests  809 passed (809)" - note leading whitespace
	// This is the authoritative count, so we reset and use these values
	// Pattern without ^ to match anywhere in buffer, handles pipe-separated or space-separated variants
	// IMPORTANT: Use FindAllStringSubmatch and take the LAST match, because the buffer
	// contains earlier interim results like "Tests 0 passed (0)" from test startup
	vitestTestsPattern := regexp.MustCompile(`Tests\s+(\d+)\s+passed(?:\s*[|]\s*(\d+)\s+failed)?(?:\s*[|]\s*(\d+)\s+skipped)?\s*\((\d+)\)`)
	if allMatches := vitestTestsPattern.FindAllStringSubmatch(text, -1); len(allMatches) > 0 {
		// Take the LAST match - it has the final test count
		matches := allMatches[len(allMatches)-1]
		slog.Debug("Vitest pattern matched (last of all)", "matchCount", len(allMatches), "lastMatch", matches)
		if len(matches) > 4 {
			if total, err := strconv.Atoi(matches[4]); err == nil {
				// Reset and use summary values
				state.Summary.Total = total
				if p, err := strconv.Atoi(matches[1]); err == nil {
					state.Summary.Passed = p
				}
				if len(matches) > 2 && matches[2] != "" {
					if f, err := strconv.Atoi(matches[2]); err == nil {
						state.Summary.Failed = f
					}
				}
				if len(matches) > 3 && matches[3] != "" {
					if s, err := strconv.Atoi(matches[3]); err == nil {
						state.Summary.Skipped = s
					}
				}
				slog.Debug("Vitest summary parsed", "passed", state.Summary.Passed, "failed", state.Summary.Failed, "total", state.Summary.Total)
				return
			}
		}
	}

	// Vitest simpler format: "Tests  17 passed" (without total in parentheses)
	vitestSimplePattern := regexp.MustCompile(`Tests\s+(\d+)\s+passed`)
	if allMatches := vitestSimplePattern.FindAllStringSubmatch(text, -1); len(allMatches) > 0 {
		// Take the LAST match
		matches := allMatches[len(allMatches)-1]
		slog.Debug("Vitest simple pattern matched (last of all)", "matchCount", len(allMatches), "lastMatch", matches)
		if len(matches) > 1 {
			if p, err := strconv.Atoi(matches[1]); err == nil {
				state.Summary.Passed = p
				state.Summary.Total = p + state.Summary.Failed + state.Summary.Skipped
				slog.Debug("Vitest simple summary parsed", "passed", state.Summary.Passed, "total", state.Summary.Total)
				return
			}
		}
	}

	// Playwright: "2 passed (5.2s)" at end of output
	playwrightPattern := regexp.MustCompile(`(\d+)\s+passed(?:,\s*(\d+)\s+failed)?\s+\(\d+`)
	if matches := playwrightPattern.FindStringSubmatch(text); len(matches) > 1 {
		if p, err := strconv.Atoi(matches[1]); err == nil {
			state.Summary.Passed = p
		}
		if len(matches) > 2 && matches[2] != "" {
			if f, err := strconv.Atoi(matches[2]); err == nil {
				state.Summary.Failed = f
			}
		}
		state.Summary.Total = state.Summary.Passed + state.Summary.Failed + state.Summary.Skipped
		return
	}

	// Jest: "Tests: 5 passed, 2 failed, 7 total"
	jestPattern := regexp.MustCompile(`Tests:\s+(\d+)\s+passed,\s+(\d+)\s+failed,\s+(\d+)\s+total`)
	if matches := jestPattern.FindStringSubmatch(text); len(matches) > 3 {
		if p, err := strconv.Atoi(matches[1]); err == nil {
			state.Summary.Passed = p
		}
		if f, err := strconv.Atoi(matches[2]); err == nil {
			state.Summary.Failed = f
		}
		if t, err := strconv.Atoi(matches[3]); err == nil {
			state.Summary.Total = t
		}
		return
	}
}

// GetSummary returns the current test summary for a terminal
func (w *Watcher) GetSummary(termID string) *TestSummary {
	w.mu.RLock()
	defer w.mu.RUnlock()

	if state, exists := w.terminalStates[termID]; exists {
		return state.Summary
	}
	return nil
}

// GetAllSummaries returns test summaries for all terminals
func (w *Watcher) GetAllSummaries() map[string]*TestSummary {
	w.mu.RLock()
	defer w.mu.RUnlock()

	result := make(map[string]*TestSummary)
	for id, state := range w.terminalStates {
		result[id] = state.Summary
	}
	return result
}

// RemoveTerminal removes tracking for a terminal
func (w *Watcher) RemoveTerminal(termID string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	delete(w.terminalStates, termID)
}

// ResetTerminal resets the test state for a terminal
func (w *Watcher) ResetTerminal(termID string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if state, exists := w.terminalStates[termID]; exists {
		state.Summary = &TestSummary{
			Runner:    RunnerUnknown,
			Status:    StatusNone,
			StartTime: time.Now(),
		}
		state.IsRunning = false
		state.OutputBuffer.Reset()
	}
}

// IsRunning returns true if tests are currently running in any terminal
func (w *Watcher) IsRunning() bool {
	w.mu.RLock()
	defer w.mu.RUnlock()

	for _, state := range w.terminalStates {
		if state.IsRunning {
			return true
		}
	}
	return false
}
