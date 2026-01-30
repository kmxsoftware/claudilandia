package testing

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// TestDiscovery represents the results of scanning a project for tests
type TestDiscovery struct {
	TotalTests       int            `json:"totalTests"`
	UnitTests        int            `json:"unitTests"`
	E2ETests         int            `json:"e2eTests"`
	IntegrationTests int            `json:"integrationTests"`
	TestFiles        []TestFileInfo `json:"testFiles"`
	ScannedAt        time.Time      `json:"scannedAt"`
	ProjectPath      string         `json:"projectPath"`
}

// TestFileInfo represents information about a single test file
type TestFileInfo struct {
	Path      string `json:"path"`
	TestCount int    `json:"testCount"`
	Type      string `json:"type"` // unit, e2e, integration
}

// TestScanner handles scanning projects for test files
type TestScanner struct {
	mu    sync.RWMutex
	cache map[string]*TestDiscovery // projectPath -> discovery
}

// NewTestScanner creates a new test scanner
func NewTestScanner() *TestScanner {
	return &TestScanner{
		cache: make(map[string]*TestDiscovery),
	}
}

// Test file patterns to match
var testFilePatterns = []string{
	"*.test.ts",
	"*.test.tsx",
	"*.test.js",
	"*.test.jsx",
	"*.spec.ts",
	"*.spec.tsx",
	"*.spec.js",
	"*.spec.jsx",
	"*_test.go",
	"test_*.py",
	"*_test.py",
}

// Directories to skip
var skipDirs = map[string]bool{
	"node_modules":   true,
	".git":           true,
	"dist":           true,
	"build":          true,
	"coverage":       true,
	".next":          true,
	".nuxt":          true,
	"vendor":         true,
	"__pycache__":    true,
	".pytest_cache":  true,
	".venv":          true,
	"venv":           true,
}

// Regex patterns for counting tests
var jsTestPattern = regexp.MustCompile(`(?m)^\s*(?:it|test)\s*\(`)
var goTestPattern = regexp.MustCompile(`(?m)^func\s+Test\w+\s*\(`)
var pyTestPattern = regexp.MustCompile(`(?m)^def\s+test_\w+\s*\(`)

// ScanProjectTests scans a project directory for test files and counts tests
func (s *TestScanner) ScanProjectTests(projectPath string) (*TestDiscovery, error) {
	discovery := &TestDiscovery{
		TestFiles:   make([]TestFileInfo, 0),
		ScannedAt:   time.Now(),
		ProjectPath: projectPath,
	}

	err := filepath.Walk(projectPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip errors, continue walking
		}

		// Skip directories
		if info.IsDir() {
			if skipDirs[info.Name()] {
				return filepath.SkipDir
			}
			return nil
		}

		// Check if file matches test patterns
		if !isTestFile(info.Name()) {
			return nil
		}

		// Read file content
		content, err := os.ReadFile(path)
		if err != nil {
			return nil // Skip files we can't read
		}

		// Count tests in file
		testCount := countTests(info.Name(), string(content))
		if testCount == 0 {
			return nil
		}

		// Determine test type based on path
		testType := classifyTestType(path, projectPath)

		// Create relative path for display
		relPath, _ := filepath.Rel(projectPath, path)
		if relPath == "" {
			relPath = path
		}

		fileInfo := TestFileInfo{
			Path:      relPath,
			TestCount: testCount,
			Type:      testType,
		}

		discovery.TestFiles = append(discovery.TestFiles, fileInfo)
		discovery.TotalTests += testCount

		// Add to category totals
		switch testType {
		case "e2e":
			discovery.E2ETests += testCount
		case "integration":
			discovery.IntegrationTests += testCount
		default:
			discovery.UnitTests += testCount
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// Cache the result
	s.mu.Lock()
	s.cache[projectPath] = discovery
	s.mu.Unlock()

	return discovery, nil
}

// GetCachedDiscovery returns cached discovery if valid (< 5 min old)
func (s *TestScanner) GetCachedDiscovery(projectPath string) *TestDiscovery {
	s.mu.RLock()
	defer s.mu.RUnlock()

	discovery, exists := s.cache[projectPath]
	if !exists {
		return nil
	}

	// Check if cache is still valid (less than 5 minutes old)
	if time.Since(discovery.ScannedAt) > 5*time.Minute {
		return nil
	}

	return discovery
}

// GetTestDiscovery returns cached discovery or scans if needed
func (s *TestScanner) GetTestDiscovery(projectPath string) (*TestDiscovery, error) {
	// Check cache first
	if cached := s.GetCachedDiscovery(projectPath); cached != nil {
		return cached, nil
	}

	// Scan and cache
	return s.ScanProjectTests(projectPath)
}

// isTestFile checks if a filename matches test file patterns
func isTestFile(filename string) bool {
	lowerName := strings.ToLower(filename)

	// Check common test file patterns
	testPatterns := []string{
		".test.ts", ".test.tsx", ".test.js", ".test.jsx",
		".spec.ts", ".spec.tsx", ".spec.js", ".spec.jsx",
		"_test.go", "_test.py",
	}

	for _, pattern := range testPatterns {
		if strings.HasSuffix(lowerName, pattern) {
			return true
		}
	}

	// Check for test_ prefix (Python)
	if strings.HasPrefix(lowerName, "test_") && strings.HasSuffix(lowerName, ".py") {
		return true
	}

	return false
}

// countTests counts the number of test cases in a file
func countTests(filename, content string) int {
	lowerName := strings.ToLower(filename)

	// JavaScript/TypeScript tests
	if strings.HasSuffix(lowerName, ".ts") || strings.HasSuffix(lowerName, ".tsx") ||
		strings.HasSuffix(lowerName, ".js") || strings.HasSuffix(lowerName, ".jsx") {
		return len(jsTestPattern.FindAllString(content, -1))
	}

	// Go tests
	if strings.HasSuffix(lowerName, ".go") {
		return len(goTestPattern.FindAllString(content, -1))
	}

	// Python tests
	if strings.HasSuffix(lowerName, ".py") {
		return len(pyTestPattern.FindAllString(content, -1))
	}

	return 0
}

// classifyTestType determines the type of test based on file path
func classifyTestType(filePath, projectPath string) string {
	lowerPath := strings.ToLower(filePath)

	// E2E tests
	e2eIndicators := []string{"/e2e/", "/playwright/", "/cypress/", "\\e2e\\", "\\playwright\\", "\\cypress\\"}
	for _, indicator := range e2eIndicators {
		if strings.Contains(lowerPath, indicator) {
			return "e2e"
		}
	}

	// Integration tests
	integrationIndicators := []string{"/integration/", "\\integration\\", ".integration."}
	for _, indicator := range integrationIndicators {
		if strings.Contains(lowerPath, indicator) {
			return "integration"
		}
	}

	// Default to unit tests
	return "unit"
}

// ClearCache clears the discovery cache for a project
func (s *TestScanner) ClearCache(projectPath string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.cache, projectPath)
}

// ClearAllCache clears all cached discoveries
func (s *TestScanner) ClearAllCache() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cache = make(map[string]*TestDiscovery)
}

// PackageJSONScripts represents scripts from package.json
type PackageJSONScripts struct {
	Scripts map[string]string `json:"scripts"`
}

// GetPackageJSONScripts reads scripts from package.json
func GetPackageJSONScripts(projectPath string) (map[string]string, error) {
	packagePath := filepath.Join(projectPath, "package.json")
	data, err := os.ReadFile(packagePath)
	if err != nil {
		return nil, err
	}

	var pkg struct {
		Scripts map[string]string `json:"scripts"`
	}
	if err := json.Unmarshal(data, &pkg); err != nil {
		return nil, err
	}

	return pkg.Scripts, nil
}
