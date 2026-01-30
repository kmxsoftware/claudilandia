package claude

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Agent represents a Claude Code agent
type Agent struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	IsGlobal bool   `json:"isGlobal"`
	Format   string `json:"format"` // "yaml" | "md"
}

// Skill represents a Claude Code skill
type Skill struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	Description string `json:"description"`
	Installed   bool   `json:"installed"`
}

// Hook represents a Claude Code hook
type Hook struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	Type        string `json:"type"` // "PreToolUse" | "PostToolUse" | "Notification" | "Stop"
	Description string `json:"description"`
	Active      bool   `json:"active"`
	Matcher     string `json:"matcher,omitempty"`
	Command     string `json:"command,omitempty"`
}

// HookEntry represents a detailed hook configuration (for template hooks)
type HookEntry struct {
	EventType   string       `json:"eventType"`   // "PreToolUse", "PostToolUse", etc.
	Matcher     string       `json:"matcher"`     // e.g., "Bash", "tool == \"Write\""
	Description string       `json:"description"` // Human-readable description
	Hooks       []HookAction `json:"hooks"`       // Array of hook actions
	IsInline    bool         `json:"isInline"`    // Whether command is inline script or file path
	ScriptPath  string       `json:"scriptPath"`  // Path to script file if not inline
}

// Command represents a Claude Code slash command
type Command struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	Description string `json:"description"`
	IsGlobal    bool   `json:"isGlobal"`
	Content     string `json:"content,omitempty"`
}

// MCPServer represents an MCP server configuration
type MCPServer struct {
	Name     string            `json:"name"`
	Type     string            `json:"type"`     // "stdio" | "http"
	Command  string            `json:"command"`  // for stdio
	Args     []string          `json:"args"`     // for stdio
	URL      string            `json:"url"`      // for http
	Env      map[string]string `json:"env"`
	Scope    string            `json:"scope"`    // "project" | "user"
	Disabled bool              `json:"disabled"`
}

// MCPConfig represents the .mcp.json configuration
type MCPConfig struct {
	McpServers map[string]MCPServerConfig `json:"mcpServers"`
}

// MCPServerConfig represents a single MCP server in config
type MCPServerConfig struct {
	Type    string            `json:"type,omitempty"`
	Command string            `json:"command,omitempty"`
	Args    []string          `json:"args,omitempty"`
	URL     string            `json:"url,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
}

// HookConfig represents the hooks configuration in settings.json
type HookConfig struct {
	Matcher     string       `json:"matcher,omitempty"`
	Hooks       []HookAction `json:"hooks,omitempty"`
	Description string       `json:"description,omitempty"`
}

// HookAction represents a hook action
type HookAction struct {
	Type    string `json:"type"`
	Command string `json:"command"`
	Timeout int    `json:"timeout,omitempty"`
}

// SettingsConfig represents the .claude/settings.json structure
type SettingsConfig struct {
	Hooks map[string][]HookConfig `json:"hooks,omitempty"`
}

// LibStatus represents the installation status of a library
type LibStatus struct {
	Name      string   `json:"name"`
	Installed bool     `json:"installed"`
	Version   string   `json:"version,omitempty"`
	Apps      []string `json:"apps,omitempty"` // List of apps where this library is installed
}

// ToolsManager handles Claude Code tools (agents, skills, hooks)
type ToolsManager struct {
	homeDir string
}

// NewToolsManager creates a new tools manager
func NewToolsManager() *ToolsManager {
	home, err := os.UserHomeDir()
	if err != nil {
		home = ""
	}
	return &ToolsManager{
		homeDir: home,
	}
}

// GetProjectAgents returns agents from the project's .claude/agents/ directory
func (m *ToolsManager) GetProjectAgents(projectPath string) ([]Agent, error) {
	agentsDir := filepath.Join(projectPath, ".claude", "agents")
	return m.getAgentsFromDir(agentsDir, false)
}

// GetGlobalAgents returns agents from ~/.claude/agents/
func (m *ToolsManager) GetGlobalAgents() ([]Agent, error) {
	if m.homeDir == "" {
		return []Agent{}, nil
	}
	agentsDir := filepath.Join(m.homeDir, ".claude", "agents")
	return m.getAgentsFromDir(agentsDir, true)
}

// getAgentsFromDir reads agents from a directory
func (m *ToolsManager) getAgentsFromDir(dir string, isGlobal bool) ([]Agent, error) {
	agents := []Agent{}

	// Check if directory exists
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return agents, nil
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return agents, err
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		name := entry.Name()
		ext := strings.ToLower(filepath.Ext(name))

		// Support yaml, yml, and md files
		if ext == ".yaml" || ext == ".yml" || ext == ".md" {
			format := "yaml"
			if ext == ".md" {
				format = "md"
			}

			agents = append(agents, Agent{
				Name:     strings.TrimSuffix(name, ext),
				Path:     filepath.Join(dir, name),
				IsGlobal: isGlobal,
				Format:   format,
			})
		}
	}

	return agents, nil
}

// GetAgentContent reads the content of an agent file
func (m *ToolsManager) GetAgentContent(path string) (string, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(content), nil
}

// SaveAgentContent saves content to an agent file
func (m *ToolsManager) SaveAgentContent(path, content string) error {
	// Ensure parent directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(content), 0644)
}

// GetAvailableSkills returns skills from the Claude plugins marketplace
func (m *ToolsManager) GetAvailableSkills() ([]Skill, error) {
	skills := []Skill{}

	if m.homeDir == "" {
		return skills, nil
	}

	// Check marketplace directory
	marketplaceDir := filepath.Join(m.homeDir, ".claude", "plugins", "marketplaces", "claude-plugins-official", "plugins")

	if _, err := os.Stat(marketplaceDir); os.IsNotExist(err) {
		return skills, nil
	}

	entries, err := os.ReadDir(marketplaceDir)
	if err != nil {
		return skills, err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		skillPath := filepath.Join(marketplaceDir, entry.Name())
		description := m.getSkillDescription(skillPath)

		skills = append(skills, Skill{
			Name:        entry.Name(),
			Path:        skillPath,
			Description: description,
			Installed:   false, // Will be updated when checking installed skills
		})
	}

	return skills, nil
}

// getSkillDescription reads the description from a skill's manifest or README
func (m *ToolsManager) getSkillDescription(skillPath string) string {
	// Try to read from package.json or manifest.json
	manifestPaths := []string{
		filepath.Join(skillPath, "manifest.json"),
		filepath.Join(skillPath, "package.json"),
	}

	for _, manifestPath := range manifestPaths {
		if content, err := os.ReadFile(manifestPath); err == nil {
			var manifest map[string]interface{}
			if json.Unmarshal(content, &manifest) == nil {
				if desc, ok := manifest["description"].(string); ok {
					return desc
				}
			}
		}
	}

	// Try README
	readmePaths := []string{
		filepath.Join(skillPath, "README.md"),
		filepath.Join(skillPath, "readme.md"),
	}

	for _, readmePath := range readmePaths {
		if content, err := os.ReadFile(readmePath); err == nil {
			// Return first line as description
			lines := strings.Split(string(content), "\n")
			for _, line := range lines {
				line = strings.TrimSpace(line)
				if line != "" && !strings.HasPrefix(line, "#") {
					if len(line) > 100 {
						return line[:100] + "..."
					}
					return line
				}
			}
		}
	}

	return ""
}

// GetInstalledSkills returns the names of skills installed in the project
func (m *ToolsManager) GetInstalledSkills(projectPath string) ([]string, error) {
	installed := []string{}

	skillsDir := filepath.Join(projectPath, ".claude", "skills")
	if _, err := os.Stat(skillsDir); os.IsNotExist(err) {
		return installed, nil
	}

	entries, err := os.ReadDir(skillsDir)
	if err != nil {
		return installed, err
	}

	for _, entry := range entries {
		if entry.IsDir() {
			installed = append(installed, entry.Name())
		}
	}

	return installed, nil
}

// InstallSkill copies a skill from the marketplace to the project
func (m *ToolsManager) InstallSkill(projectPath, skillName string) error {
	if m.homeDir == "" {
		return fmt.Errorf("cannot determine home directory")
	}

	srcPath := filepath.Join(m.homeDir, ".claude", "plugins", "marketplaces", "claude-plugins-official", "plugins", skillName)
	dstPath := filepath.Join(projectPath, ".claude", "skills", skillName)

	// Check source exists
	if _, err := os.Stat(srcPath); os.IsNotExist(err) {
		return fmt.Errorf("skill %s not found in marketplace", skillName)
	}

	// Create destination directory
	if err := os.MkdirAll(dstPath, 0755); err != nil {
		return err
	}

	// Copy all files from source to destination
	return copyDir(srcPath, dstPath)
}

// copyDir recursively copies a directory
func copyDir(src, dst string) error {
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())

		if entry.IsDir() {
			if err := os.MkdirAll(dstPath, 0755); err != nil {
				return err
			}
			if err := copyDir(srcPath, dstPath); err != nil {
				return err
			}
		} else {
			content, err := os.ReadFile(srcPath)
			if err != nil {
				return err
			}
			if err := os.WriteFile(dstPath, content, 0644); err != nil {
				return err
			}
		}
	}

	return nil
}

// GetProjectHooks returns hooks configured in the project
func (m *ToolsManager) GetProjectHooks(projectPath string) ([]Hook, error) {
	hooks := []Hook{}

	// Read from .claude/settings.json
	settingsPath := filepath.Join(projectPath, ".claude", "settings.json")
	content, err := os.ReadFile(settingsPath)
	if err != nil {
		if os.IsNotExist(err) {
			return hooks, nil
		}
		return hooks, err
	}

	var settings map[string]interface{}
	if err := json.Unmarshal(content, &settings); err != nil {
		return hooks, err
	}

	// Check for hooks configuration
	if hooksConfig, ok := settings["hooks"].(map[string]interface{}); ok {
		for hookType, hookList := range hooksConfig {
			if list, ok := hookList.([]interface{}); ok {
				for _, h := range list {
					if hookMap, ok := h.(map[string]interface{}); ok {
						name := ""
						if n, ok := hookMap["matcher"].(string); ok {
							name = n
						}
						if name == "" {
							if n, ok := hookMap["name"].(string); ok {
								name = n
							}
						}

						hooks = append(hooks, Hook{
							Name:   name,
							Path:   settingsPath,
							Type:   hookType,
							Active: true,
						})
					}
				}
			}
		}
	}

	return hooks, nil
}

// InstallHook adds a hook to the project's settings.json
func (m *ToolsManager) InstallHook(projectPath, hookType string) error {
	settingsPath := filepath.Join(projectPath, ".claude", "settings.json")

	// Read existing settings or create new
	var settings map[string]interface{}

	content, err := os.ReadFile(settingsPath)
	if err != nil {
		if !os.IsNotExist(err) {
			return err
		}
		settings = make(map[string]interface{})
	} else {
		if err := json.Unmarshal(content, &settings); err != nil {
			settings = make(map[string]interface{})
		}
	}

	// Get hook template
	template := m.GetHookTemplate(hookType)
	if template == nil {
		return fmt.Errorf("unknown hook type: %s", hookType)
	}

	// Initialize hooks map if needed
	if settings["hooks"] == nil {
		settings["hooks"] = make(map[string]interface{})
	}

	hooksMap := settings["hooks"].(map[string]interface{})

	// Add to PreToolUse hooks
	if hooksMap["PreToolUse"] == nil {
		hooksMap["PreToolUse"] = []interface{}{}
	}

	preToolUse := hooksMap["PreToolUse"].([]interface{})
	preToolUse = append(preToolUse, template)
	hooksMap["PreToolUse"] = preToolUse

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0755); err != nil {
		return err
	}

	// Write settings back
	output, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(settingsPath, output, 0644)
}

// GetHookTemplate returns a template for a specific hook type
func (m *ToolsManager) GetHookTemplate(hookType string) map[string]interface{} {
	switch hookType {
	case "pre-commit-review":
		return map[string]interface{}{
			"matcher": "Bash",
			"hooks": []map[string]interface{}{
				{
					"type":    "command",
					"command": "python3 .claude/hooks/pre-commit-review.py",
				},
			},
		}
	case "pre-push-confirm":
		return map[string]interface{}{
			"matcher": "Bash",
			"hooks": []map[string]interface{}{
				{
					"type":    "command",
					"command": "python3 .claude/hooks/pre-push-confirm.py",
				},
			},
		}
	default:
		return nil
	}
}

// AppDependencies holds dependencies for a specific app/package
type AppDependencies struct {
	AppName string
	Deps    map[string]string
}

// GetProjectDependencies reads dependencies from package.json (root only, for backward compat)
func (m *ToolsManager) GetProjectDependencies(projectPath string) (map[string]string, error) {
	deps := make(map[string]string)

	packagePath := filepath.Join(projectPath, "package.json")
	content, err := os.ReadFile(packagePath)
	if err != nil {
		if os.IsNotExist(err) {
			return deps, nil
		}
		return deps, err
	}

	var pkg map[string]interface{}
	if err := json.Unmarshal(content, &pkg); err != nil {
		return deps, err
	}

	// Merge dependencies and devDependencies
	for _, key := range []string{"dependencies", "devDependencies"} {
		if depsMap, ok := pkg[key].(map[string]interface{}); ok {
			for name, version := range depsMap {
				if v, ok := version.(string); ok {
					deps[name] = v
				}
			}
		}
	}

	return deps, nil
}

// GetAllProjectDependencies reads dependencies from root and all apps in monorepo structure
func (m *ToolsManager) GetAllProjectDependencies(projectPath string) ([]AppDependencies, error) {
	var allDeps []AppDependencies

	// Read root package.json
	rootDeps, err := m.readPackageJson(filepath.Join(projectPath, "package.json"))
	if err == nil && len(rootDeps) > 0 {
		allDeps = append(allDeps, AppDependencies{
			AppName: "root",
			Deps:    rootDeps,
		})
	}

	// Check for monorepo structures: apps/, packages/, workspaces/
	monorepoFolders := []string{"apps", "packages", "workspaces"}

	for _, folder := range monorepoFolders {
		folderPath := filepath.Join(projectPath, folder)
		if _, err := os.Stat(folderPath); os.IsNotExist(err) {
			continue
		}

		entries, err := os.ReadDir(folderPath)
		if err != nil {
			continue
		}

		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}

			appPath := filepath.Join(folderPath, entry.Name(), "package.json")
			appDeps, err := m.readPackageJson(appPath)
			if err != nil || len(appDeps) == 0 {
				continue
			}

			allDeps = append(allDeps, AppDependencies{
				AppName: entry.Name(),
				Deps:    appDeps,
			})
		}
	}

	return allDeps, nil
}

// readPackageJson reads and parses a package.json file
func (m *ToolsManager) readPackageJson(path string) (map[string]string, error) {
	deps := make(map[string]string)

	content, err := os.ReadFile(path)
	if err != nil {
		return deps, err
	}

	var pkg map[string]interface{}
	if err := json.Unmarshal(content, &pkg); err != nil {
		return deps, err
	}

	// Merge dependencies and devDependencies
	for _, key := range []string{"dependencies", "devDependencies"} {
		if depsMap, ok := pkg[key].(map[string]interface{}); ok {
			for name, version := range depsMap {
				if v, ok := version.(string); ok {
					deps[name] = v
				}
			}
		}
	}

	return deps, nil
}

// CheckLibraryStatus checks which libraries from a list are installed (across all apps)
func (m *ToolsManager) CheckLibraryStatus(projectPath string, libs []string) ([]LibStatus, error) {
	allDeps, err := m.GetAllProjectDependencies(projectPath)
	if err != nil {
		return nil, err
	}

	// Build a map of lib -> apps where it's installed
	libApps := make(map[string][]string)
	libVersions := make(map[string]string)

	for _, appDeps := range allDeps {
		for libName, version := range appDeps.Deps {
			if libApps[libName] == nil {
				libApps[libName] = []string{}
			}
			libApps[libName] = append(libApps[libName], appDeps.AppName)
			// Store the first version found
			if libVersions[libName] == "" {
				libVersions[libName] = version
			}
		}
	}

	// Build status for requested libs
	statuses := make([]LibStatus, len(libs))
	for i, lib := range libs {
		apps := libApps[lib]
		installed := len(apps) > 0
		statuses[i] = LibStatus{
			Name:      lib,
			Installed: installed,
			Version:   libVersions[lib],
			Apps:      apps,
		}
	}

	return statuses, nil
}

// ============================================
// Commands Methods
// ============================================

// GetProjectCommands returns commands from the project's .claude/commands/ directory
func (m *ToolsManager) GetProjectCommands(projectPath string) ([]Command, error) {
	commandsDir := filepath.Join(projectPath, ".claude", "commands")
	return m.getCommandsFromDir(commandsDir, false)
}

// GetGlobalCommands returns commands from ~/.claude/commands/
func (m *ToolsManager) GetGlobalCommands() ([]Command, error) {
	if m.homeDir == "" {
		return []Command{}, nil
	}
	commandsDir := filepath.Join(m.homeDir, ".claude", "commands")
	return m.getCommandsFromDir(commandsDir, true)
}

// getCommandsFromDir reads commands from a directory (supports nested directories)
func (m *ToolsManager) getCommandsFromDir(dir string, isGlobal bool) ([]Command, error) {
	commands := []Command{}

	// Check if directory exists
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return commands, nil
	}

	// Walk directory recursively
	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip errors
		}
		if info.IsDir() {
			return nil
		}

		// Only support .md files
		if strings.ToLower(filepath.Ext(info.Name())) != ".md" {
			return nil
		}

		// Get relative path from commands dir for command name
		relPath, _ := filepath.Rel(dir, path)
		// Remove .md extension
		name := strings.TrimSuffix(relPath, ".md")
		// Replace path separators with : for nested commands
		name = strings.ReplaceAll(name, string(filepath.Separator), ":")

		// Read content to extract description
		content, _ := os.ReadFile(path)
		description := m.extractCommandDescription(string(content))

		commands = append(commands, Command{
			Name:        name,
			Path:        path,
			Description: description,
			IsGlobal:    isGlobal,
		})

		return nil
	})

	return commands, err
}

// extractCommandDescription extracts description from command content (first non-empty line or frontmatter)
func (m *ToolsManager) extractCommandDescription(content string) string {
	lines := strings.Split(content, "\n")

	// Check for frontmatter
	if len(lines) > 0 && strings.TrimSpace(lines[0]) == "---" {
		inFrontmatter := true
		for i := 1; i < len(lines); i++ {
			line := strings.TrimSpace(lines[i])
			if line == "---" {
				inFrontmatter = false
				continue
			}
			if inFrontmatter && strings.HasPrefix(line, "description:") {
				desc := strings.TrimPrefix(line, "description:")
				desc = strings.TrimSpace(desc)
				desc = strings.Trim(desc, "\"'")
				if len(desc) > 100 {
					return desc[:100] + "..."
				}
				return desc
			}
		}
	}

	// Return first non-empty, non-comment line
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") || line == "---" {
			continue
		}
		if len(line) > 100 {
			return line[:100] + "..."
		}
		return line
	}

	return ""
}

// GetCommandContent reads the content of a command file
func (m *ToolsManager) GetCommandContent(path string) (string, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(content), nil
}

// SaveCommandContent saves content to a command file
func (m *ToolsManager) SaveCommandContent(path, content string) error {
	// Ensure parent directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(content), 0644)
}

// CreateCommand creates a new command file
func (m *ToolsManager) CreateCommand(projectPath, name, content string) error {
	commandsDir := filepath.Join(projectPath, ".claude", "commands")
	// Replace : with path separator for nested commands
	filename := strings.ReplaceAll(name, ":", string(filepath.Separator)) + ".md"
	path := filepath.Join(commandsDir, filename)

	return m.SaveCommandContent(path, content)
}

// DeleteCommand deletes a command file
func (m *ToolsManager) DeleteCommand(path string) error {
	return os.Remove(path)
}

// ============================================
// MCP Methods
// ============================================

// GetProjectMCPServers returns MCP servers from the project's .mcp.json
func (m *ToolsManager) GetProjectMCPServers(projectPath string) ([]MCPServer, error) {
	mcpPath := filepath.Join(projectPath, ".mcp.json")
	return m.getMCPServersFromFile(mcpPath, "project")
}

// GetUserMCPServers returns MCP servers from ~/.claude.json
func (m *ToolsManager) GetUserMCPServers() ([]MCPServer, error) {
	if m.homeDir == "" {
		return []MCPServer{}, nil
	}
	mcpPath := filepath.Join(m.homeDir, ".claude.json")
	return m.getMCPServersFromFile(mcpPath, "user")
}

// getMCPServersFromFile reads MCP servers from a config file
func (m *ToolsManager) getMCPServersFromFile(path, scope string) ([]MCPServer, error) {
	servers := []MCPServer{}

	content, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return servers, nil
		}
		return servers, err
	}

	var config MCPConfig
	if err := json.Unmarshal(content, &config); err != nil {
		return servers, err
	}

	for name, serverConfig := range config.McpServers {
		serverType := serverConfig.Type
		if serverType == "" {
			if serverConfig.Command != "" {
				serverType = "stdio"
			} else if serverConfig.URL != "" {
				serverType = "http"
			}
		}

		servers = append(servers, MCPServer{
			Name:    name,
			Type:    serverType,
			Command: serverConfig.Command,
			Args:    serverConfig.Args,
			URL:     serverConfig.URL,
			Env:     serverConfig.Env,
			Scope:   scope,
		})
	}

	return servers, nil
}

// SaveProjectMCPConfig saves MCP servers to the project's .mcp.json
func (m *ToolsManager) SaveProjectMCPConfig(projectPath string, servers []MCPServer) error {
	mcpPath := filepath.Join(projectPath, ".mcp.json")

	config := MCPConfig{
		McpServers: make(map[string]MCPServerConfig),
	}

	for _, server := range servers {
		if server.Scope != "project" {
			continue
		}
		config.McpServers[server.Name] = MCPServerConfig{
			Type:    server.Type,
			Command: server.Command,
			Args:    server.Args,
			URL:     server.URL,
			Env:     server.Env,
		}
	}

	content, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(mcpPath, content, 0644)
}

// AddMCPServer adds a new MCP server to project config
func (m *ToolsManager) AddMCPServer(projectPath string, server MCPServer) error {
	servers, err := m.GetProjectMCPServers(projectPath)
	if err != nil {
		servers = []MCPServer{}
	}

	// Check if server already exists
	for i, s := range servers {
		if s.Name == server.Name {
			servers[i] = server
			return m.SaveProjectMCPConfig(projectPath, servers)
		}
	}

	server.Scope = "project"
	servers = append(servers, server)
	return m.SaveProjectMCPConfig(projectPath, servers)
}

// RemoveMCPServer removes an MCP server from project config
func (m *ToolsManager) RemoveMCPServer(projectPath, name string) error {
	servers, err := m.GetProjectMCPServers(projectPath)
	if err != nil {
		return err
	}

	filtered := []MCPServer{}
	for _, s := range servers {
		if s.Name != name {
			filtered = append(filtered, s)
		}
	}

	return m.SaveProjectMCPConfig(projectPath, filtered)
}

// ============================================
// Enhanced Hooks Methods
// ============================================

// GetProjectHooksDetailed returns hooks with full configuration
func (m *ToolsManager) GetProjectHooksDetailed(projectPath string) ([]HookEntry, error) {
	hooks := []HookEntry{}

	// Read from .claude/settings.json
	settingsPath := filepath.Join(projectPath, ".claude", "settings.json")
	content, err := os.ReadFile(settingsPath)
	if err != nil {
		if os.IsNotExist(err) {
			return hooks, nil
		}
		return hooks, err
	}

	var settings SettingsConfig
	if err := json.Unmarshal(content, &settings); err != nil {
		return hooks, err
	}

	// Parse hooks from all hook types
	hookTypes := []string{"PreToolUse", "PostToolUse", "PreCompact", "PostCompact", "Notification", "Stop", "UserPromptSubmit", "SessionStart"}

	for _, hookType := range hookTypes {
		if hookConfigs, ok := settings.Hooks[hookType]; ok {
			for _, hc := range hookConfigs {
				command := ""
				isInline := true
				scriptPath := ""

				if len(hc.Hooks) > 0 {
					command = hc.Hooks[0].Command
					// Check if command is a script path vs inline
					if !strings.HasPrefix(command, "#!") && !strings.Contains(command, "\n") {
						// Looks like a script path
						isInline = false
						scriptPath = command
						// Check common patterns
						if strings.HasPrefix(command, "bash ") {
							scriptPath = strings.TrimPrefix(command, "bash ")
						} else if strings.HasPrefix(command, "python3 ") {
							scriptPath = strings.TrimPrefix(command, "python3 ")
						} else if strings.HasPrefix(command, "~/") || strings.HasPrefix(command, ".claude/") || strings.HasPrefix(command, "./") {
							scriptPath = command
						}
					}
				}

				hooks = append(hooks, HookEntry{
					EventType:   hookType,
					Matcher:     hc.Matcher,
					Description: hc.Description,
					Hooks:       hc.Hooks,
					IsInline:    isInline,
					ScriptPath:  scriptPath,
				})
			}
		}
	}

	return hooks, nil
}

// SaveProjectHooksEntries saves hooks to the project's settings.json
func (m *ToolsManager) SaveProjectHooksEntries(projectPath string, hooks []HookEntry) error {
	settingsPath := filepath.Join(projectPath, ".claude", "settings.json")

	// Read existing settings
	var settings map[string]interface{}
	content, err := os.ReadFile(settingsPath)
	if err != nil {
		if !os.IsNotExist(err) {
			return err
		}
		settings = make(map[string]interface{})
	} else {
		if err := json.Unmarshal(content, &settings); err != nil {
			settings = make(map[string]interface{})
		}
	}

	// Build hooks map
	hooksMap := make(map[string][]map[string]interface{})

	for _, hook := range hooks {
		hookActions := []map[string]interface{}{}
		for _, action := range hook.Hooks {
			actionMap := map[string]interface{}{
				"type":    action.Type,
				"command": action.Command,
			}
			if action.Timeout > 0 {
				actionMap["timeout"] = action.Timeout
			}
			hookActions = append(hookActions, actionMap)
		}

		hookConfig := map[string]interface{}{
			"matcher": hook.Matcher,
			"hooks":   hookActions,
		}
		if hook.Description != "" {
			hookConfig["description"] = hook.Description
		}

		if hooksMap[hook.EventType] == nil {
			hooksMap[hook.EventType] = []map[string]interface{}{}
		}
		hooksMap[hook.EventType] = append(hooksMap[hook.EventType], hookConfig)
	}

	settings["hooks"] = hooksMap

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0755); err != nil {
		return err
	}

	// Write settings
	output, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(settingsPath, output, 0644)
}

// SaveProjectHooks saves hooks to the project's settings.json (legacy, for backward compat)
func (m *ToolsManager) SaveProjectHooks(projectPath string, hooks []Hook) error {
	entries := make([]HookEntry, len(hooks))
	for i, h := range hooks {
		entries[i] = HookEntry{
			EventType:   h.Type,
			Matcher:     h.Matcher,
			Description: h.Description,
			Hooks: []HookAction{
				{Type: "command", Command: h.Command},
			},
		}
	}
	return m.SaveProjectHooksEntries(projectPath, entries)
}

// AddHookEntry adds a new hook entry to project settings
func (m *ToolsManager) AddHookEntry(projectPath string, hook HookEntry) error {
	hooks, err := m.GetProjectHooksDetailed(projectPath)
	if err != nil {
		hooks = []HookEntry{}
	}

	hooks = append(hooks, hook)
	return m.SaveProjectHooksEntries(projectPath, hooks)
}

// AddHook adds a new hook to project settings (legacy)
func (m *ToolsManager) AddHook(projectPath string, hook Hook) error {
	entry := HookEntry{
		EventType:   hook.Type,
		Matcher:     hook.Matcher,
		Description: hook.Description,
		Hooks: []HookAction{
			{Type: "command", Command: hook.Command},
		},
	}
	return m.AddHookEntry(projectPath, entry)
}

// RemoveHook removes a hook from project settings
func (m *ToolsManager) RemoveHook(projectPath, hookType, matcher string) error {
	hooks, err := m.GetProjectHooksDetailed(projectPath)
	if err != nil {
		return err
	}

	filtered := []HookEntry{}
	for _, h := range hooks {
		if !(h.EventType == hookType && h.Matcher == matcher) {
			filtered = append(filtered, h)
		}
	}

	return m.SaveProjectHooksEntries(projectPath, filtered)
}

// InstallTemplateHook installs a hook from template repo to project
func (m *ToolsManager) InstallTemplateHook(projectPath string, hook HookEntry, repoPath string) error {
	// Check if hook uses external script files
	if !hook.IsInline && hook.ScriptPath != "" {
		// Copy script file if it references repo path
		if strings.HasPrefix(hook.ScriptPath, "~/.claude/hooks/") {
			// These need to be copied to user's home ~/.claude/hooks/
			srcPath := filepath.Join(repoPath, "hooks", strings.TrimPrefix(hook.ScriptPath, "~/.claude/hooks/"))
			destPath := filepath.Join(m.homeDir, ".claude", "hooks", strings.TrimPrefix(hook.ScriptPath, "~/.claude/hooks/"))

			if _, err := os.Stat(srcPath); err == nil {
				if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
					return err
				}
				content, err := os.ReadFile(srcPath)
				if err != nil {
					return err
				}
				if err := os.WriteFile(destPath, content, 0755); err != nil {
					return err
				}
			}
		}
	}

	// Add hook to project settings
	return m.AddHookEntry(projectPath, hook)
}

// CreateHookScript creates a new hook script file in .claude/hooks/
func (m *ToolsManager) CreateHookScript(projectPath, scriptName, content string) error {
	hooksDir := filepath.Join(projectPath, ".claude", "hooks")
	if err := os.MkdirAll(hooksDir, 0755); err != nil {
		return err
	}

	scriptPath := filepath.Join(hooksDir, scriptName)
	return os.WriteFile(scriptPath, []byte(content), 0755)
}

// DeleteHookScript deletes a hook script file
func (m *ToolsManager) DeleteHookScript(projectPath, scriptName string) error {
	scriptPath := filepath.Join(projectPath, ".claude", "hooks", scriptName)
	return os.Remove(scriptPath)
}

// ============================================
// Template Repository Methods
// ============================================

// TemplateItem represents a template from the everything-claude-code repo
type TemplateItem struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	Description string `json:"description"`
	Category    string `json:"category"` // "agents", "commands", "skills", "hooks", "rules"
	Content     string `json:"content,omitempty"`
}

// GetTemplateRepoPath returns the path to the everything-claude-code repo
func (m *ToolsManager) GetTemplateRepoPath() string {
	// Look for repos folder relative to the executable or in common locations
	possiblePaths := []string{
		"repos/everything-claude-code",
		"../repos/everything-claude-code",
		filepath.Join(m.homeDir, ".projecthub", "repos", "everything-claude-code"),
	}

	for _, p := range possiblePaths {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}

	return ""
}

// GetTemplateAgents returns agents from the template repo
func (m *ToolsManager) GetTemplateAgents(repoPath string) ([]TemplateItem, error) {
	agentsDir := filepath.Join(repoPath, "agents")
	return m.getTemplatesFromDir(agentsDir, "agents")
}

// GetTemplateCommands returns commands from the template repo
func (m *ToolsManager) GetTemplateCommands(repoPath string) ([]TemplateItem, error) {
	commandsDir := filepath.Join(repoPath, "commands")
	return m.getTemplatesFromDir(commandsDir, "commands")
}

// GetTemplateSkills returns skills from the template repo
func (m *ToolsManager) GetTemplateSkills(repoPath string) ([]TemplateItem, error) {
	skillsDir := filepath.Join(repoPath, "skills")
	return m.getTemplatesFromDir(skillsDir, "skills")
}

// GetTemplateRules returns rules from the template repo
func (m *ToolsManager) GetTemplateRules(repoPath string) ([]TemplateItem, error) {
	rulesDir := filepath.Join(repoPath, "rules")
	return m.getTemplatesFromDir(rulesDir, "rules")
}

// GetTemplateHooks returns hooks config from the template repo (parsed into individual entries)
func (m *ToolsManager) GetTemplateHooks(repoPath string) ([]HookEntry, error) {
	hooksFile := filepath.Join(repoPath, "hooks", "hooks.json")
	content, err := os.ReadFile(hooksFile)
	if err != nil {
		return []HookEntry{}, nil
	}

	var settings SettingsConfig
	if err := json.Unmarshal(content, &settings); err != nil {
		return []HookEntry{}, err
	}

	hooks := []HookEntry{}
	hookTypes := []string{"PreToolUse", "PostToolUse", "PreCompact", "PostCompact", "Notification", "Stop", "UserPromptSubmit", "SessionStart"}

	for _, hookType := range hookTypes {
		if hookConfigs, ok := settings.Hooks[hookType]; ok {
			for _, hc := range hookConfigs {
				command := ""
				isInline := true
				scriptPath := ""

				if len(hc.Hooks) > 0 {
					command = hc.Hooks[0].Command
					// Check if command is a script path vs inline
					if !strings.HasPrefix(command, "#!") && !strings.Contains(command, "\n") {
						isInline = false
						scriptPath = command
					}
				}

				hooks = append(hooks, HookEntry{
					EventType:   hookType,
					Matcher:     hc.Matcher,
					Description: hc.Description,
					Hooks:       hc.Hooks,
					IsInline:    isInline,
					ScriptPath:  scriptPath,
				})
			}
		}
	}

	return hooks, nil
}

// GetHookScriptContent reads the content of a hook script file
func (m *ToolsManager) GetHookScriptContent(projectPath, scriptPath string) (string, error) {
	// Resolve script path
	var fullPath string

	if strings.HasPrefix(scriptPath, "~/") {
		fullPath = filepath.Join(m.homeDir, scriptPath[2:])
	} else if strings.HasPrefix(scriptPath, "./") || strings.HasPrefix(scriptPath, ".claude/") {
		fullPath = filepath.Join(projectPath, scriptPath)
	} else if strings.HasPrefix(scriptPath, "bash ") {
		scriptPath = strings.TrimPrefix(scriptPath, "bash ")
		if strings.HasPrefix(scriptPath, ".claude/") || strings.HasPrefix(scriptPath, "./") {
			fullPath = filepath.Join(projectPath, scriptPath)
		} else {
			fullPath = scriptPath
		}
	} else if strings.HasPrefix(scriptPath, "python3 ") || strings.HasPrefix(scriptPath, "python ") {
		scriptPath = strings.TrimPrefix(scriptPath, "python3 ")
		scriptPath = strings.TrimPrefix(scriptPath, "python ")
		if strings.HasPrefix(scriptPath, ".claude/") || strings.HasPrefix(scriptPath, "./") {
			fullPath = filepath.Join(projectPath, scriptPath)
		} else {
			fullPath = scriptPath
		}
	} else {
		fullPath = scriptPath
	}

	content, err := os.ReadFile(fullPath)
	if err != nil {
		return "", err
	}
	return string(content), nil
}

// GetProjectHookScripts returns list of hook scripts in .claude/hooks/ folder
func (m *ToolsManager) GetProjectHookScripts(projectPath string) ([]string, error) {
	hooksDir := filepath.Join(projectPath, ".claude", "hooks")
	scripts := []string{}

	if _, err := os.Stat(hooksDir); os.IsNotExist(err) {
		return scripts, nil
	}

	entries, err := os.ReadDir(hooksDir)
	if err != nil {
		return scripts, err
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		scripts = append(scripts, entry.Name())
	}

	return scripts, nil
}

// GetTemplateMCPServers returns MCP server configs from the template repo
func (m *ToolsManager) GetTemplateMCPServers(repoPath string) ([]MCPServer, error) {
	mcpFile := filepath.Join(repoPath, "mcp-configs", "mcp-servers.json")
	content, err := os.ReadFile(mcpFile)
	if err != nil {
		return []MCPServer{}, nil
	}

	var config MCPConfig
	if err := json.Unmarshal(content, &config); err != nil {
		return []MCPServer{}, err
	}

	servers := []MCPServer{}
	for name, serverConfig := range config.McpServers {
		serverType := serverConfig.Type
		if serverType == "" {
			if serverConfig.Command != "" {
				serverType = "stdio"
			} else if serverConfig.URL != "" {
				serverType = "http"
			}
		}

		servers = append(servers, MCPServer{
			Name:    name,
			Type:    serverType,
			Command: serverConfig.Command,
			Args:    serverConfig.Args,
			URL:     serverConfig.URL,
			Env:     serverConfig.Env,
			Scope:   "template",
		})
	}

	return servers, nil
}

// getTemplatesFromDir reads template files from a directory
func (m *ToolsManager) getTemplatesFromDir(dir, category string) ([]TemplateItem, error) {
	templates := []TemplateItem{}

	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return templates, nil
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return templates, err
	}

	for _, entry := range entries {
		if entry.IsDir() {
			// Check for SKILL.md in subdirectory
			skillPath := filepath.Join(dir, entry.Name(), "SKILL.md")
			if _, err := os.Stat(skillPath); err == nil {
				content, _ := os.ReadFile(skillPath)
				desc := m.extractDescriptionFromContent(string(content))
				templates = append(templates, TemplateItem{
					Name:        entry.Name(),
					Path:        skillPath,
					Description: desc,
					Category:    category,
				})
			}
			continue
		}

		name := entry.Name()
		ext := strings.ToLower(filepath.Ext(name))

		if ext == ".md" || ext == ".yaml" || ext == ".yml" || ext == ".json" {
			path := filepath.Join(dir, name)
			content, _ := os.ReadFile(path)
			desc := m.extractDescriptionFromContent(string(content))

			templates = append(templates, TemplateItem{
				Name:        strings.TrimSuffix(name, ext),
				Path:        path,
				Description: desc,
				Category:    category,
			})
		}
	}

	return templates, nil
}

// extractDescriptionFromContent extracts description from file content
func (m *ToolsManager) extractDescriptionFromContent(content string) string {
	lines := strings.Split(content, "\n")

	// Check for YAML frontmatter
	if len(lines) > 0 && strings.TrimSpace(lines[0]) == "---" {
		for i := 1; i < len(lines); i++ {
			line := strings.TrimSpace(lines[i])
			if line == "---" {
				break
			}
			if strings.HasPrefix(line, "description:") {
				desc := strings.TrimPrefix(line, "description:")
				desc = strings.TrimSpace(desc)
				desc = strings.Trim(desc, "\"'")
				return desc
			}
		}
	}

	// Look for first heading or paragraph
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || line == "---" {
			continue
		}
		// Skip headings, return first content line
		if strings.HasPrefix(line, "#") {
			continue
		}
		if len(line) > 100 {
			return line[:100] + "..."
		}
		return line
	}

	return ""
}

// GetTemplateContent reads the full content of a template file
func (m *ToolsManager) GetTemplateContent(path string) (string, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(content), nil
}

// InstallTemplateAgent copies an agent from template repo to project
func (m *ToolsManager) InstallTemplateAgent(projectPath, templatePath string) error {
	content, err := os.ReadFile(templatePath)
	if err != nil {
		return err
	}

	// Get filename from template path
	filename := filepath.Base(templatePath)
	destDir := filepath.Join(projectPath, ".claude", "agents")
	destPath := filepath.Join(destDir, filename)

	if err := os.MkdirAll(destDir, 0755); err != nil {
		return err
	}

	return os.WriteFile(destPath, content, 0644)
}

// InstallTemplateCommand copies a command from template repo to project
func (m *ToolsManager) InstallTemplateCommand(projectPath, templatePath string) error {
	content, err := os.ReadFile(templatePath)
	if err != nil {
		return err
	}

	filename := filepath.Base(templatePath)
	destDir := filepath.Join(projectPath, ".claude", "commands")
	destPath := filepath.Join(destDir, filename)

	if err := os.MkdirAll(destDir, 0755); err != nil {
		return err
	}

	return os.WriteFile(destPath, content, 0644)
}

// InstallTemplateSkill copies a skill from template repo to project
func (m *ToolsManager) InstallTemplateSkill(projectPath, templatePath string) error {
	// Check if it's a directory (skill with SKILL.md) or single file
	info, err := os.Stat(templatePath)
	if err != nil {
		return err
	}

	destDir := filepath.Join(projectPath, ".claude", "skills")

	if info.IsDir() {
		// Copy entire directory
		skillName := filepath.Base(templatePath)
		return copyDir(templatePath, filepath.Join(destDir, skillName))
	}

	// Single file - get parent directory name as skill name
	parentDir := filepath.Dir(templatePath)
	skillName := filepath.Base(parentDir)

	if skillName == "skills" {
		// It's a top-level skill file
		skillName = strings.TrimSuffix(filepath.Base(templatePath), filepath.Ext(templatePath))
	}

	destSkillDir := filepath.Join(destDir, skillName)
	if err := os.MkdirAll(destSkillDir, 0755); err != nil {
		return err
	}

	content, err := os.ReadFile(templatePath)
	if err != nil {
		return err
	}

	return os.WriteFile(filepath.Join(destSkillDir, "SKILL.md"), content, 0644)
}

// InstallTemplateRule copies a rule from template repo to project
func (m *ToolsManager) InstallTemplateRule(projectPath, templatePath string) error {
	content, err := os.ReadFile(templatePath)
	if err != nil {
		return err
	}

	filename := filepath.Base(templatePath)
	destDir := filepath.Join(projectPath, ".claude", "rules")
	destPath := filepath.Join(destDir, filename)

	if err := os.MkdirAll(destDir, 0755); err != nil {
		return err
	}

	return os.WriteFile(destPath, content, 0644)
}
