import './style.css';
import './app.css';
import '@xterm/xterm/css/xterm.css';
import 'highlight.js/styles/github-dark.css';

// Module imports
import { state, getTerminals } from './modules/state.js';
import { escapeHtml, textToBase64 } from './modules/utils.js';
import {
  createTerminal,
  createTerminalFromInfo,
  renderTerminalTabs,
  renderTerminalList,
  switchTerminal,
  closeTerminal,
  setTerminalCallbacks,
  initTerminalHandler,
  applyTerminalTheme
} from './modules/terminal.js';
import {
  refreshContainers,
  renderContainers,
  showLogsModal,
  setupDockerWindowFunctions
} from './modules/docker.js';
import {
  setupGitSection,
  refreshGitStatus,
  renderGitFileList,
  updateGitDisplay,
  setGitCallbacks,
  initGitHandler
} from './modules/git.js';
import {
  showGitDiff,
  clearDiffSelection,
  setDiffCallbacks
} from './modules/diff.js';
import {
  updateClaudeStatusUI,
  updateProjectClaudeStatus,
  updateAllProjectClaudeStatus
} from './modules/claude-status.js';
import {
  setupToolsPanel,
  renderToolsPanel,
  refreshToolsPanel,
  initToolsPanelHandler,
  toolsState
} from './modules/tools-panel.js';

// New module imports
import {
  setBrowserCallbacks,
  initBrowserTabs,
  renderBrowserTabs,
  loadBrowserTabs,
  initBrowserHandler,
  expandBrowserPanel,
  openInExternalBrowser
} from './modules/browser.js';
import {
  initSplitView,
  updateSplitRatio,
  setSplitViewCallbacks,
  setUIStateCallbacks,
  initUIStateHandler
} from './modules/split-view.js';
import {
  renderProjectTabs,
  selectProject,
  updateWorkspaceInfo,
  setupEditProjectModal
} from './modules/projects.js';
import {
  renderColorPicker,
  renderIconPicker
} from './modules/ui-pickers.js';

// Notes module
import {
  renderNotesSection,
  setNotesCallbacks,
  renderNotesModal,
  setupNotesModal,
  initNotesHandler
} from './modules/notes.js';

// Screenshots module
import {
  captureScreenshot,
  openScreenshotGallery,
  setScreenshotCallbacks,
  renderScreenshotGalleryModal,
  setupScreenshotGalleryModal,
  addCaptureButton
} from './modules/screenshots.js';

// Test dashboard module (QA)
import {
  initTestDashboard,
  updateTestStatus,
  clearTestStatus,
  setTestDashboardCallbacks,
  loadTestHistory,
  updateTestDashboard,
  initTestDashboardHandler
} from './modules/test-dashboard.js';

// Remote access module
import {
  initRemoteAccess
} from './modules/remote-access.js';

// Todo dashboard module
import {
  initTodoDashboard,
  setTodoDashboardCallbacks,
  loadTodos,
  initTodoDashboardHandler
} from './modules/todo-dashboard.js';

// Git dashboard module
import {
  initGitDashboard,
  setGitDashboardCallbacks,
  loadGitHistory,
  initGitDashboardHandler
} from './modules/git-dashboard.js';

// Structure panel module
import {
  initStructurePanel,
  initStructureHandler
} from './modules/structure-panel.jsx';

// DEC mode 2026 markers (sync blocks) - we strip these to prevent buffering freeze
const SYNC_START = new Uint8Array([0x1b, 0x5b, 0x3f, 0x32, 0x30, 0x32, 0x36, 0x68]); // \x1b[?2026h
const SYNC_END = new Uint8Array([0x1b, 0x5b, 0x3f, 0x32, 0x30, 0x32, 0x36, 0x6c]);   // \x1b[?2026l

/**
 * Find a byte sequence in a Uint8Array
 * @param {Uint8Array} haystack - Array to search in
 * @param {Uint8Array} needle - Sequence to find
 * @returns {number} Index of first match, or -1 if not found
 */
function findSequence(haystack, needle) {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Remove DEC mode 2026 sync block markers from terminal output.
 *
 * Problem: Claude Code uses sync blocks (\x1b[?2026h ... \x1b[?2026l) for atomic
 * screen updates. This causes xterm.js to buffer ALL data before rendering,
 * leading to 15+ second freezes during /resume with long history.
 *
 * Solution: Strip sync markers so xterm.js renders incrementally.
 * This may cause minor visual flickering but eliminates freezes.
 *
 * @param {Uint8Array} bytes - Terminal output bytes
 * @returns {Uint8Array} Processed bytes (sync markers removed)
 */
function processTerminalOutput(bytes) {
  // Remove sync block markers to prevent xterm.js from buffering
  // This allows incremental rendering instead of atomic updates
  let result = bytes;

  // Remove SYNC_START marker (\x1b[?2026h)
  let startIdx = findSequence(result, SYNC_START);
  while (startIdx !== -1) {
    const before = result.slice(0, startIdx);
    const after = result.slice(startIdx + SYNC_START.length);
    result = new Uint8Array(before.length + after.length);
    result.set(before, 0);
    result.set(after, before.length);
    startIdx = findSequence(result, SYNC_START);
  }

  // Remove SYNC_END marker (\x1b[?2026l)
  let endIdx = findSequence(result, SYNC_END);
  while (endIdx !== -1) {
    const before = result.slice(0, endIdx);
    const after = result.slice(endIdx + SYNC_END.length);
    result = new Uint8Array(before.length + after.length);
    result.set(before, 0);
    result.set(after, before.length);
    endIdx = findSequence(result, SYNC_END);
  }

  return result;
}

// Backend imports
import {
  GetState,
  GetProject,
  CreateProject,
  DeleteProject,
  UpdateProject,
  SetActiveProject,
  SelectDirectory,
  GetDefaultColors,
  GetDefaultIcons,
  GetProjectTerminals,
  UpdateUIState,
  IsDockerAvailable,
  SaveNotes,
  GetNotes,
  SaveScreenshot,
  GetScreenshots,
  DeleteScreenshot,
  GetTestHistory,
  AddTestRun,
  GetTestDiscovery,
  ScanProjectTests,
  WriteTerminal,
  GetPackageJSONScripts,
  WatchProjectCoverage,
  CheckProjectCoverage,
  GetTodos,
  SaveTodos,
  GetGitHistory,
  PauseTerminal,
  ResumeTerminal,
  GetTerminalTheme
} from '../wailsjs/go/main/App';
import { EventsOn } from '../wailsjs/runtime/runtime';

// Module callbacks will be set up in init()

// Helper to insert text to active terminal
function insertToTerminal(text) {
  if (!state.activeTerminalId) return;
  const terminals = getTerminals();
  const termData = terminals.get(state.activeTerminalId);
  if (termData && termData.terminal) {
    import('../wailsjs/go/main/App').then(({ WriteTerminal }) => {
      WriteTerminal(state.activeTerminalId, textToBase64(text));
    });
  }
}

// Initialize app
async function init() {
  // Setup module callbacks
  setTerminalCallbacks({
    switchTab,
    updateClaudeStatusUI,
    onTerminalActivated: () => {
      // Refresh prompts tab when terminal changes
      if (toolsState.activeTab === 'prompts') {
        renderToolsPanel();
      }
    }
  });
  setGitCallbacks({
    showGitDiff
  });
  setDiffCallbacks({
    switchTab
  });
  setupDockerWindowFunctions();

  // Setup new module callbacks
  setBrowserCallbacks({
    saveBrowserState: saveUIState  // Browser state is now just UI state
  });
  setSplitViewCallbacks({
    saveUIState
  });

  // Setup UI state callbacks (for switchTab)
  setUIStateCallbacks({
    switchTab
  });

  // Initialize project switcher handlers
  initBrowserHandler();
  initTerminalHandler();
  initNotesHandler();
  initTestDashboardHandler();
  initTodoDashboardHandler();
  initGitDashboardHandler();
  initUIStateHandler();
  initGitHandler();
  initToolsPanelHandler();
  initStructureHandler();
  initRemoteAccess();

  // Setup notes callbacks
  setNotesCallbacks({
    saveNotes: SaveNotes,
    getNotes: GetNotes,
    insertToTerminal
  });

  // Setup screenshot callbacks
  setScreenshotCallbacks({
    saveScreenshot: SaveScreenshot,
    getScreenshots: GetScreenshots,
    deleteScreenshot: DeleteScreenshot,
    insertToTerminal
  });

  // Setup test dashboard callbacks
  setTestDashboardCallbacks({
    getTestHistory: GetTestHistory,
    addTestRun: AddTestRun,
    getTestDiscovery: GetTestDiscovery,
    scanProjectTests: ScanProjectTests,
    writeTerminal: WriteTerminal,
    getPackageScripts: GetPackageJSONScripts,
    watchProjectCoverage: WatchProjectCoverage,
    checkProjectCoverage: CheckProjectCoverage
  });

  // Setup todo dashboard callbacks
  setTodoDashboardCallbacks({
    getTodos: GetTodos,
    saveTodos: SaveTodos
  });

  // Setup git dashboard callbacks
  setGitDashboardCallbacks({
    getGitHistory: GetGitHistory
  });

  // Load initial data
  state.colors = await GetDefaultColors();
  state.icons = await GetDefaultIcons();
  state.dockerAvailable = await IsDockerAvailable();

  // Load full state from backend
  const appState = await GetState();
  state.projects = Object.values(appState.projects || {});

  // Load terminal theme
  const terminalTheme = await GetTerminalTheme();
  state.terminalTheme = terminalTheme || 'claude';

  // Setup event listeners for terminal output with project context
  // Flow control using HIGH/LOW watermarks to prevent xterm.js buffer overflow
  // See: https://xtermjs.org/docs/guides/flowcontrol/
  const flowControlState = new Map(); // terminalId -> { watermark, paused }
  const HIGH_WATERMARK = 100000;  // 100KB - pause backend
  const LOW_WATERMARK = 10000;    // 10KB - resume backend

  EventsOn('state:terminal:output', (data) => {
    const { projectId, id, data: base64Data } = data;
    const terminals = state.projectTerminals.get(projectId);
    if (!terminals) return;

    const termData = terminals.get(id);
    if (!termData) return;

    // Decode base64 to bytes
    const binaryString = atob(base64Data);
    let bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Remove sync block markers to prevent xterm.js buffering freeze
    bytes = processTerminalOutput(bytes);

    // Initialize flow control state for this terminal
    if (!flowControlState.has(id)) {
      flowControlState.set(id, { watermark: 0, paused: false });
    }
    const flow = flowControlState.get(id);

    // Track bytes in flight
    flow.watermark += bytes.length;

    // Write with callback for backpressure
    termData.terminal.write(bytes, () => {
      flow.watermark = Math.max(flow.watermark - bytes.length, 0);
      // Resume if we've drained below LOW_WATERMARK
      if (flow.paused && flow.watermark < LOW_WATERMARK) {
        flow.paused = false;
        ResumeTerminal(id);
      }
    });

    // Pause backend if we're overwhelmed
    if (!flow.paused && flow.watermark > HIGH_WATERMARK) {
      flow.paused = true;
      PauseTerminal(id);
    }
  });

  EventsOn('state:terminal:exit', (data) => {
    const { projectId, terminalId } = data;
    const terminals = state.projectTerminals.get(projectId);
    if (terminals) {
      const termData = terminals.get(terminalId);
      if (termData) {
        termData.terminal.write('\r\n\x1b[31m[Process exited]\x1b[0m\r\n');
        termData.info.running = false;
        if (state.activeProject?.id === projectId) {
          renderTerminalTabs();
        }
      }
    }
  });

  EventsOn('state:terminal:theme', (themeName) => {
    // Theme changed externally (e.g., from another window)
    applyTerminalTheme(themeName);
    renderTerminalTabs();
  });

  EventsOn('state:terminal:created', (data) => {
    const { projectId, terminal } = data;
    // Create terminal UI if it doesn't exist (e.g., created via remote client)
    createTerminalFromInfo(terminal, projectId);
  });

  EventsOn('state:terminal:deleted', (data) => {
    const { projectId, terminalId } = data;
    // Clean up if terminal was deleted externally
    const terminals = state.projectTerminals.get(projectId);
    if (terminals && terminals.has(terminalId)) {
      const termData = terminals.get(terminalId);
      if (termData.resizeObserver) {
        termData.resizeObserver.disconnect();
      }
      termData.terminal.dispose();
      terminals.delete(terminalId);

      // Clean up flow control state
      flowControlState.delete(terminalId);

      const wrapper = document.getElementById(`term-wrapper-${terminalId}`);
      if (wrapper) wrapper.remove();

      if (state.activeProject?.id === projectId) {
        renderTerminalTabs();
        renderTerminalList();
      }
    }
  });

  EventsOn('state:activeProject:changed', (data) => {
    const { projectId, state: projectState } = data;
    // Handle external project change (e.g., from another window)
    if (state.activeProject?.id !== projectId) {
      const project = state.projects.find(p => p.id === projectId);
      if (project) {
        state.activeProject = project;
        renderProjectTabs();
        updateWorkspaceInfo();
      }
    }
  });

  // Claude CLI status detection with project context
  EventsOn('state:claude:status', (data) => {
    const { projectId, terminalId, status } = data;
    const oldStatus = state.claudeStatus.get(terminalId);

    if (status === 'none') {
      state.claudeStatus.delete(terminalId);
    } else {
      state.claudeStatus.set(terminalId, status);
    }

    if (oldStatus !== status) {
      updateClaudeStatusUI(terminalId);
    }
  });

  // Test status detection from terminal output
  EventsOn('test-status', (data) => {
    if (data && data.terminalId && data.summary) {
      updateTestStatus(data.terminalId, data.summary);
    }
  });

  // Render UI
  render();

  // Initialize test dashboard (QA)
  initTestDashboard();

  // Initialize todo dashboard
  initTodoDashboard();

  // Initialize git dashboard
  initGitDashboard();

  // Initialize structure panel
  initStructurePanel();

  // Load containers if docker available
  if (state.dockerAvailable) {
    refreshContainers();
  }

  // If we have projects, select the first one or the previously active one
  if (state.projects.length > 0) {
    const activeId = appState.activeProjectId || state.projects[0].id;
    selectProject(activeId);
  }
}

// Render main UI
function render() {
  document.querySelector('#app').innerHTML = `
    <div class="app-container">
      <!-- Project Tabs Bar -->
      <div class="project-tabs-bar">
        <div class="project-tabs" id="projectTabs"></div>
        <button class="add-project-btn" id="addProjectBtn" title="Add Project">+</button>
      </div>

      <!-- Main Content -->
      <div class="main-content">
        <!-- Sidebar -->
        <div class="sidebar">
          <div class="sidebar-section">
            <h3>Workspace</h3>
            <div id="workspaceInfo" class="workspace-info">
              <p class="no-project">No project selected</p>
            </div>
          </div>

          <div class="sidebar-section">
            <h3>Quick Actions</h3>
            <div class="quick-actions">
              <button id="newTerminalBtn" class="action-btn" disabled>
                <span class="icon">⌨️</span> New Terminal
              </button>
              <button id="dockerBtn" class="action-btn ${state.dockerAvailable ? '' : 'disabled'}">
                <span class="icon">🐳</span> Docker
              </button>
            </div>
          </div>

          <div class="sidebar-section terminals-section">
            <h3>Terminals</h3>
            <div id="terminalList" class="terminal-list"></div>
          </div>

          <div class="sidebar-section notes-section" id="notesSection">
            <!-- Notes section rendered by notes.js -->
          </div>

          <div class="sidebar-section git-section">
            <div class="git-section-resizer" id="gitSectionResizer"></div>
            <div class="git-header" id="gitHeader">
              <span class="git-toggle">▶</span>
              <h3>Git</h3>
              <div class="git-stats" id="gitStats"></div>
              <button id="refreshGit" class="small-btn git-refresh" title="Refresh">🔄</button>
            </div>
            <div id="gitContent" class="git-content collapsed">
              <div class="git-branch-bar" id="gitBranchBar"></div>
              <div id="gitFileList" class="git-file-list"></div>
            </div>
          </div>
        </div>

        <!-- Sidebar Resizer -->
        <div class="sidebar-resizer" id="sidebarResizer"></div>

        <!-- Main Panel -->
        <div class="main-panel">
          <!-- Tab Bar (for special tabs like diff/docker) -->
          <div class="panel-tabs">
            <button class="panel-tab diff-tab hidden" data-tab="diff" id="diffTab">
              <span class="diff-tab-name">file.js</span>
              <span class="diff-tab-close" id="closeDiffTab">×</span>
            </button>
            <button class="panel-tab docker-tab hidden" data-tab="docker" id="dockerTab">
              <span class="docker-tab-icon">🐳</span>
              <span>Docker</span>
              <span class="docker-tab-close" id="closeDockerTab">×</span>
            </button>
            <div class="panel-tabs-spacer"></div>
          </div>

          <!-- Tab Content -->
          <div class="panel-content">
            <div id="terminalPanel" class="tab-panel active">
              <div class="terminal-panel-container">
                <div class="terminal-panel-main">
                  <div id="terminalTabsBar" class="terminal-tabs-bar"></div>
                  <div id="terminalContainer" class="terminal-container">
                    <div class="empty-state">
                      <p>No terminal open</p>
                      <button id="createFirstTerminal" class="primary-btn" disabled>Create Terminal</button>
                    </div>
                  </div>
                </div>
                <div id="toolsPanelResizer" class="tools-panel-resizer">
                  <div class="resizer-handle"></div>
                </div>
                <div id="projectToolsPanel" class="project-tools-panel">
                  <div class="project-tools-header">
                    <div class="tools-tabs">
                      <button class="tools-tab active" data-tools-tab="prompts">
                        <span class="tools-tab-icon">💬</span> Prompts
                      </button>
                      <button class="tools-tab" data-tools-tab="agents">
                        <span class="tools-tab-icon">🤖</span> Agents
                      </button>
                      <button class="tools-tab" data-tools-tab="commands">
                        <span class="tools-tab-icon">⌨️</span> Commands
                      </button>
                      <button class="tools-tab" data-tools-tab="skills">
                        <span class="tools-tab-icon">⚡</span> Skills
                      </button>
                      <button class="tools-tab" data-tools-tab="hooks">
                        <span class="tools-tab-icon">🪝</span> Hooks
                      </button>
                      <button class="tools-tab" data-tools-tab="mcp">
                        <span class="tools-tab-icon">🔌</span> MCP
                      </button>
                      <button class="tools-tab" data-tools-tab="libs">
                        <span class="tools-tab-icon">📦</span> Libs
                      </button>
                      <button class="tools-tab" data-tools-tab="claudemd">
                        <span class="tools-tab-icon">📄</span> CLAUDE.MD
                      </button>
                    </div>
                    <button id="collapseToolsPanel" class="tools-collapse-btn" title="Minimize panel">▼</button>
                  </div>
                  <div class="tools-status-bar" id="toolsStatusBar">
                    <span class="status-bar-icon" id="statusBarIcon">💬</span>
                    <span class="status-bar-label" id="statusBarLabel">Prompts</span>
                    <button id="expandToolsPanel" class="tools-expand-btn" title="Expand panel">▲</button>
                  </div>
                  <div class="tools-panel-content">
                    <div id="toolsPromptsTab" class="tools-tab-content active">
                      <div class="prompts-container" id="promptsContainer"></div>
                    </div>
                    <div id="toolsAgentsTab" class="tools-tab-content" style="display:none;">
                      <div class="tools-list" id="agentsList"></div>
                    </div>
                    <div id="toolsCommandsTab" class="tools-tab-content" style="display:none;">
                      <div class="tools-list" id="commandsList"></div>
                    </div>
                    <div id="toolsSkillsTab" class="tools-tab-content" style="display:none;">
                      <div class="tools-list" id="skillsList"></div>
                    </div>
                    <div id="toolsHooksTab" class="tools-tab-content" style="display:none;">
                      <div class="tools-list" id="hooksList"></div>
                    </div>
                    <div id="toolsMcpTab" class="tools-tab-content" style="display:none;">
                      <div class="tools-list" id="mcpList"></div>
                    </div>
                    <div id="toolsLibsTab" class="tools-tab-content" style="display:none;">
                      <div id="libsList"></div>
                    </div>
                    <div id="toolsClaudemdTab" class="tools-tab-content" style="display:none;">
                      <div id="claudemdEditor" class="claudemd-editor-container"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div id="dockerPanel" class="tab-panel">
              <div class="docker-content">
                ${state.dockerAvailable ? `
                  <div class="docker-header">
                    <h3>Containers</h3>
                    <button id="refreshContainers" class="small-btn">🔄 Refresh</button>
                  </div>
                  <div id="containerList" class="container-list"></div>
                ` : `
                  <div class="empty-state">
                    <p>🐳 Docker is not available</p>
                    <p class="hint">Make sure Docker Desktop is running</p>
                  </div>
                `}
              </div>
            </div>

            <div id="browserPanel" class="tab-panel">
              <div class="browser-status-bar" id="browserStatusBar">
                <button id="expandBrowserPanel" class="browser-expand-btn" title="Expand panel">◀</button>
                <span class="browser-status-icon" id="browserStatusBarIcon">📊</span>
                <span class="browser-status-label" id="browserStatusBarLabel">Dashboard</span>
              </div>
              <div class="browser-content">
                <div class="browser-tabs-bar" id="browserTabsBar">
                  <!-- Browser tabs rendered by browser.js -->
                </div>

                <!-- Dashboard Panel - Todo List -->
                <div class="dashboard-panel" id="dashboardPanel" style="display: none;">
                  <!-- Content rendered by todo-dashboard.js -->
                </div>

                <!-- Git History Panel -->
                <div class="git-history-panel" id="gitHistoryPanel" style="display: none;">
                  <!-- Content rendered by git-dashboard.js -->
                </div>

                <!-- QA Panel - Tests (previously testsPanel) -->
                <div class="qa-panel" id="qaPanel" style="display: none;">
                  <!-- Content rendered by test-dashboard.js -->
                </div>

                <!-- Structure Panel - visualizes project file structure -->
                <div class="structure-panel" id="structurePanel" style="display: none;">
                  <!-- Content rendered by structure-panel.js (React) -->
                </div>

                <!-- Remote Access Panel - access terminals from iPhone -->
                <div class="remote-access-panel" id="remoteAccessPanel" style="display: none;">
                  <!-- Content rendered by remote-access.js -->
                </div>
              </div>
            </div>

            <div id="diffPanel" class="tab-panel">
              <div class="diff-panel-content">
                <div class="diff-toolbar">
                  <span class="diff-filename" id="diffFilename">No file selected</span>
                  <button id="refreshDiff" class="small-btn" title="Refresh">🔄</button>
                </div>
                <div class="diff-viewer" id="diffViewer">
                  <div class="diff-empty-state">
                    <p>Select a file from Git Diff to view changes</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Project Modal -->
    <div id="addProjectModal" class="modal hidden">
      <div class="modal-content">
        <h2>Add Project</h2>
        <form id="addProjectForm">
          <div class="form-group">
            <label>Name</label>
            <input type="text" id="projectName" required placeholder="My Project">
          </div>
          <div class="form-group">
            <label>Path</label>
            <div class="path-input">
              <input type="text" id="projectPath" required placeholder="/path/to/project">
              <button type="button" id="browseBtn" class="small-btn">Browse</button>
            </div>
          </div>
          <div class="form-group">
            <label>Color</label>
            <div id="colorPicker" class="color-picker"></div>
          </div>
          <div class="form-group">
            <label>Icon</label>
            <div id="iconPicker" class="icon-picker"></div>
          </div>
          <div class="form-actions">
            <button type="button" id="cancelAddProject" class="secondary-btn">Cancel</button>
            <button type="submit" class="primary-btn">Add Project</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Edit Project Modal -->
    <div id="editProjectModal" class="modal hidden">
      <div class="modal-content">
        <h2>Edit Project</h2>
        <form id="editProjectForm">
          <div class="form-group">
            <label>Name</label>
            <input type="text" id="editProjectName" required placeholder="My Project">
          </div>
          <div class="form-group">
            <label>Path</label>
            <div class="path-input">
              <input type="text" id="editProjectPath" required placeholder="/path/to/project">
              <button type="button" id="editBrowseBtn" class="small-btn">Browse</button>
            </div>
          </div>
          <div class="form-group">
            <label>Color</label>
            <div id="editColorPicker" class="color-picker"></div>
          </div>
          <div class="form-group">
            <label>Icon</label>
            <div id="editIconPicker" class="icon-picker"></div>
          </div>
          <div class="form-actions">
            <button type="button" id="cancelEditProject" class="secondary-btn">Cancel</button>
            <button type="submit" class="primary-btn">Save</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Tools Modal for Agents/Hooks editing and Library info -->
    <div id="toolsModal" class="tools-modal hidden">
      <div class="tools-modal-content">
        <div class="tools-modal-header">
          <h3 id="toolsModalTitle">Edit Agent</h3>
          <div class="tools-modal-header-actions">
            <button id="fullscreenToolsModal" class="tools-modal-fullscreen" title="Toggle fullscreen">⛶</button>
            <button id="closeToolsModal" class="tools-modal-close">×</button>
          </div>
        </div>
        <div class="tools-modal-body" id="toolsModalBody">
          <!-- Content dynamically inserted -->
        </div>
        <div class="tools-modal-footer" id="toolsModalFooter">
          <button id="cancelToolsModal" class="secondary-btn">Cancel</button>
          <button id="saveToolsModal" class="primary-btn">Save</button>
        </div>
      </div>
    </div>

    <!-- Notes Modal -->
    ${renderNotesModal()}

    <!-- Screenshot Gallery Modal -->
    ${renderScreenshotGalleryModal()}
  `;

  // Setup event listeners
  setupEventListeners();
  setupGitSection();
  setupToolsPanel();
  setupEditProjectModal();
  setupNotesModal();
  setupScreenshotGalleryModal();

  // Initialize browser tabs
  initBrowserTabs();

  // Render dynamic parts
  renderProjectTabs();
  renderTerminalList();
  renderNotesSection();
  renderColorPicker();
  renderIconPicker();
}

function setupEventListeners() {
  // Add project button
  document.getElementById('addProjectBtn').addEventListener('click', () => {
    document.getElementById('addProjectModal').classList.remove('hidden');
  });

  // Cancel add project
  document.getElementById('cancelAddProject').addEventListener('click', () => {
    document.getElementById('addProjectModal').classList.add('hidden');
  });

  // Add project form
  document.getElementById('addProjectForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('projectName').value;
    const path = document.getElementById('projectPath').value;

    try {
      const project = await CreateProject(name, path);
      state.projects.push(project);
      renderProjectTabs();
      selectProject(project.id);
      document.getElementById('addProjectModal').classList.add('hidden');
      document.getElementById('addProjectForm').reset();
    } catch (err) {
      alert('Error creating project: ' + err);
    }
  });

  // Browse button
  document.getElementById('browseBtn').addEventListener('click', async () => {
    const path = await SelectDirectory();
    if (path) {
      document.getElementById('projectPath').value = path;
    }
  });

  // New terminal button
  document.getElementById('newTerminalBtn').addEventListener('click', () => {
    if (state.activeProject) {
      createTerminal();
    }
  });

  // Create first terminal button
  document.getElementById('createFirstTerminal').addEventListener('click', () => {
    if (state.activeProject) {
      createTerminal();
    }
  });

  // Panel tabs
  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
    });
  });

  // Docker button
  document.getElementById('dockerBtn').addEventListener('click', () => {
    if (state.dockerAvailable) {
      openDockerTab();
    }
  });

  // Refresh containers
  const refreshBtn = document.getElementById('refreshContainers');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshContainers);
  }

  // Browser panel expand
  document.getElementById('expandBrowserPanel')?.addEventListener('click', expandBrowserPanel);

  // Close modal on outside click
  document.getElementById('addProjectModal').addEventListener('click', (e) => {
    if (e.target.id === 'addProjectModal') {
      document.getElementById('addProjectModal').classList.add('hidden');
    }
  });

  // Initialize split view (always active - terminal + browser side by side)
  initSplitView();

  // Close diff tab
  document.getElementById('closeDiffTab')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeDiffTab();
  });

  // Close docker tab
  document.getElementById('closeDockerTab')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeDockerTab();
  });

  // Sidebar resizer
  setupSidebarResizer();

  // Git section resizer
  setupGitSectionResizer();
}

// Setup sidebar horizontal resizer
function setupSidebarResizer() {
  const resizer = document.getElementById('sidebarResizer');
  const sidebar = document.querySelector('.sidebar');
  if (!resizer || !sidebar) return;

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = sidebar.offsetWidth;
    resizer.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const deltaX = e.clientX - startX;
    const newWidth = Math.min(400, Math.max(180, startWidth + deltaX));
    sidebar.style.width = `${newWidth}px`;
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

// Setup git section vertical resizer
function setupGitSectionResizer() {
  const resizer = document.getElementById('gitSectionResizer');
  const gitSection = document.querySelector('.git-section');
  const sidebar = document.querySelector('.sidebar');
  if (!resizer || !gitSection || !sidebar) return;

  let isResizing = false;
  let startY = 0;
  let startHeight = 0;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    startY = e.clientY;
    startHeight = gitSection.offsetHeight;
    resizer.classList.add('active');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const deltaY = startY - e.clientY;
    const sidebarHeight = sidebar.offsetHeight;
    const maxHeight = sidebarHeight * 0.6;
    const newHeight = Math.min(maxHeight, Math.max(100, startHeight + deltaY));
    gitSection.style.height = `${newHeight}px`;
    gitSection.style.maxHeight = `${newHeight}px`;
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

// Browser state saving is no longer needed since we removed the iframe browser
// The active panel tab (Dashboard/Git/QA/Structure) is saved via UI state

// Save UI state to backend
function saveUIState() {
  if (!state.activeProject) return;
  UpdateUIState(
    state.activeProject.id,
    state.activeTab,
    state.splitView,
    state.splitRatio
  );
}

function closeDiffTab() {
  const diffTab = document.getElementById('diffTab');
  const viewer = document.getElementById('diffViewer');

  if (diffTab) diffTab.classList.add('hidden');
  if (viewer) {
    viewer.innerHTML = `
      <div class="diff-empty-state">
        <p>Select a file from Git Diff to view changes</p>
      </div>
    `;
  }

  state.git.currentDiffFile = null;

  if (state.activeTab === 'diff') {
    switchTab('terminal');
  }
}

function openDockerTab() {
  const dockerTab = document.getElementById('dockerTab');
  if (dockerTab) {
    dockerTab.classList.remove('hidden');
  }
  switchTab('docker');
  refreshContainers();
}

function closeDockerTab() {
  const dockerTab = document.getElementById('dockerTab');
  if (dockerTab) dockerTab.classList.add('hidden');

  if (state.activeTab === 'docker') {
    switchTab('terminal');
  }
}

function switchTab(tabName) {
  state.activeTab = tabName;

  const panelContent = document.querySelector('.panel-content');
  const terminalPanel = document.getElementById('terminalPanel');
  const browserPanel = document.getElementById('browserPanel');
  const dockerPanel = document.getElementById('dockerPanel');
  const diffPanel = document.getElementById('diffPanel');
  const resizer = document.getElementById('splitResizer');

  // Update active state on special tabs (diff, docker)
  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  // Handle special tabs (diff, docker) vs split view
  if (tabName === 'diff' || tabName === 'docker') {
    // Hide split view, show special panel
    panelContent.classList.remove('split-view');
    terminalPanel.classList.remove('active', 'split-left');
    browserPanel.classList.remove('active', 'split-right');
    dockerPanel.classList.remove('active');
    diffPanel.classList.remove('active');
    if (resizer) resizer.style.display = 'none';

    if (tabName === 'diff') {
      diffPanel.classList.add('active');
    } else {
      dockerPanel.classList.add('active');
    }
  } else {
    // Restore split view (always active)
    panelContent.classList.add('split-view');
    terminalPanel.classList.add('active', 'split-left');
    browserPanel.classList.add('active', 'split-right');
    dockerPanel.classList.remove('active');
    diffPanel.classList.remove('active');

    // Respect browser minimized state
    if (state.browser.minimized) {
      browserPanel.classList.add('minimized');
      if (resizer) resizer.style.display = 'none';
    } else {
      browserPanel.classList.remove('minimized');
      if (resizer) resizer.style.display = 'flex';
    }
    updateSplitRatio();

    if (state.activeTerminalId) {
      const termData = getTerminals().get(state.activeTerminalId);
      if (termData) {
        setTimeout(() => termData.fitAddon.fit(), 50);
      }
    }
  }

  saveUIState();
}

// Start the app
init();
