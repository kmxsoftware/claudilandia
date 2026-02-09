import './style.css';
import './app.css';
import 'highlight.js/styles/github-dark.css';

// Module imports
import { state } from './modules/state.js';
import { escapeHtml, textToBase64 } from './modules/utils.js';
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
  updateClaudeStatusUI
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
  openInExternalBrowser,
  setUIStateCallbacks
} from './modules/browser.js';
import {
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

// Pomodoro module
import {
  initPomodoro,
  setPomodoroCallbacks,
  renderPomodoro
} from './modules/pomodoro.js';

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
  renderTodoDashboard,
  initTodoDashboardHandler
} from './modules/todo-dashboard.js';

// Terminal dashboard module (center panel)
import {
  initTerminalDashboard,
  initTerminalDashboardHandler
} from './modules/terminal-dashboard.js';

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

// Teams dashboard module (tools panel tab)
import {
  initTeamsDashboard,
  renderTeamsDashboard
} from './modules/teams-dashboard.js';

// iTerm2 integration module (managed in sidebar)
import {
  initITermPanel
} from './modules/iterm-panel.js';

// NOTE: xterm.js terminal removed - using iTerm2 integration instead

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
  GetPomodoroSettings,
  SavePomodoroSettings
} from '../wailsjs/go/main/App';
import { EventsOn, WindowToggleMaximise } from '../wailsjs/runtime/runtime';

// Module callbacks will be set up in init()

// Helper to insert text to terminal (no-op: xterm.js removed, using iTerm2)
function insertToTerminal(text) {
  // TODO: Could implement iTerm2 paste via AppleScript in the future
  console.log('insertToTerminal: iTerm2 integration - text not inserted:', text.substring(0, 50));
}

// Initialize app
async function init() {
  // Setup module callbacks
  setGitCallbacks({
    showGitDiff
  });
  setDiffCallbacks({
    switchTab
  });
  setupDockerWindowFunctions();

  // Setup new module callbacks
  setBrowserCallbacks({
    saveBrowserState: saveUIState
  });

  // Setup UI state callbacks (for switchTab on project change)
  setUIStateCallbacks({
    switchTab
  });

  // Initialize project switcher handlers
  initBrowserHandler();
  initNotesHandler();
  initTestDashboardHandler();
  initTodoDashboardHandler();
  initTerminalDashboardHandler();
  initGitDashboardHandler();
  initGitHandler();
  initToolsPanelHandler();
  initStructureHandler();
  initRemoteAccess();
  initITermPanel();

  // Setup notes callbacks
  setNotesCallbacks({
    saveNotes: SaveNotes,
    getNotes: GetNotes,
    insertToTerminal
  });

  // Setup pomodoro callbacks (init called after render)
  setPomodoroCallbacks({
    saveSettings: SavePomodoroSettings,
    loadSettings: GetPomodoroSettings
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

  // NOTE: Terminal theme and xterm.js event handlers removed - using iTerm2 integration

  EventsOn('state:activeProject:changed', (data) => {
    const { projectId, state: projectState } = data;
    // Handle external project change (e.g., from another window)
    if (state.activeProject?.id !== projectId) {
      const project = state.projects.find(p => p.id === projectId);
      if (project) {
        state.activeProject = project;
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

  // Initialize pomodoro (after render, NOT project specific)
  initPomodoro();

  // Initialize test dashboard (QA)
  initTestDashboard();

  // Initialize todo dashboard (right sidebar)
  initTodoDashboard();

  // Initialize terminal dashboard (center panel)
  initTerminalDashboard();

  // Initialize git dashboard
  initGitDashboard();

  // Initialize structure panel
  initStructurePanel();

  // Initialize teams dashboard (tools panel)
  initTeamsDashboard();

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
      <!-- Titlebar Drag Region -->
      <div class="titlebar-drag-region"></div>

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
              <button id="dockerBtn" class="action-btn ${state.dockerAvailable ? '' : 'disabled'}">
                <span class="icon">🐳</span> Docker
              </button>
            </div>
          </div>

          <div class="sidebar-section git-section">
            <div class="git-section-resizer" id="gitSectionResizer"></div>
            <div class="git-header" id="gitHeader">
              <span class="git-toggle">▼</span>
              <h3>Git</h3>
              <div class="git-stats" id="gitStats"></div>
              <button id="refreshGit" class="small-btn git-refresh" title="Refresh">🔄</button>
            </div>
            <div id="gitContent" class="git-content">
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
            <!-- Browser/Dashboard Panel (main content area) -->
            <div id="browserPanel" class="tab-panel active">
              <div class="browser-content">
                <div class="browser-tabs-bar" id="browserTabsBar">
                  <!-- Browser tabs rendered by browser.js -->
                </div>

                <!-- Dashboard Panel - Todo List -->
                <div class="dashboard-panel" id="dashboardPanel" style="display: flex;">
                  <!-- Todo content rendered by todo-dashboard.js -->
                </div>

                <!-- Git History Panel -->
                <div class="git-history-panel" id="gitHistoryPanel" style="display: none;">
                  <!-- Content rendered by git-dashboard.js -->
                </div>

                <!-- QA Panel - Tests -->
                <div class="qa-panel" id="qaPanel" style="display: none;">
                  <!-- Content rendered by test-dashboard.js -->
                </div>

                <!-- Structure Panel -->
                <div class="structure-panel" id="structurePanel" style="display: none;">
                  <!-- Content rendered by structure-panel.js -->
                </div>

                <!-- Remote Access Panel -->
                <div class="remote-access-panel" id="remoteAccessPanel" style="display: none;">
                  <!-- Content rendered by remote-access.js -->
                </div>
              </div>
            </div>

            <!-- NOTE: Terminal panel removed - using iTerm2 integration -->

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

          <!-- Tools Panel (Bottom) -->
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
                <button class="tools-tab" data-tools-tab="teams">
                  <span class="tools-tab-icon">👥</span> Teams
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
              <div id="toolsTeamsTab" class="tools-tab-content" style="display:none;">
                <div id="teamsDashboardContainer"></div>
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

        <!-- Right Sidebar Resizer -->
        <div class="sidebar-resizer right-sidebar-resizer" id="rightSidebarResizer"></div>

        <!-- Right Sidebar -->
        <div class="sidebar right-sidebar" id="rightSidebar">
          <div class="sidebar-section todo-section" id="todoSidebarSection">
            <!-- Todo section rendered by todo-dashboard.js -->
          </div>
          <div class="sidebar-section pomodoro-section" id="pomodoroSection">
            <!-- Pomodoro timer rendered by pomodoro.js - NOT project specific -->
          </div>
          <div class="sidebar-section notes-section" id="notesSection">
            <!-- Notes section rendered by notes.js -->
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
  renderNotesSection();
  renderColorPicker();
  renderIconPicker();
}

function setupEventListeners() {
  // Double-click on titlebar to toggle maximize/restore
  document.querySelector('.titlebar-drag-region')?.addEventListener('dblclick', () => {
    WindowToggleMaximise();
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

  // Split view no longer used - main panel is full width now
  // initSplitView();

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

  // Sidebar resizers
  setupSidebarResizer();
  setupRightSidebarResizer();

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

// Setup right sidebar horizontal resizer
function setupRightSidebarResizer() {
  const resizer = document.getElementById('rightSidebarResizer');
  const sidebar = document.getElementById('rightSidebar');
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
    // For right sidebar, dragging left increases width
    const deltaX = startX - e.clientX;
    const newWidth = Math.min(500, Math.max(200, startWidth + deltaX));
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

  const browserPanel = document.getElementById('browserPanel');
  const dockerPanel = document.getElementById('dockerPanel');
  const diffPanel = document.getElementById('diffPanel');

  // Update active state on special tabs (diff, docker)
  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  // Handle special tabs (diff, docker) vs main browser panel
  if (tabName === 'diff') {
    browserPanel.classList.remove('active');
    dockerPanel.classList.remove('active');
    diffPanel.classList.add('active');
  } else if (tabName === 'docker') {
    browserPanel.classList.remove('active');
    diffPanel.classList.remove('active');
    dockerPanel.classList.add('active');
  } else {
    // Show browser panel (full width)
    browserPanel.classList.add('active');
    dockerPanel.classList.remove('active');
    diffPanel.classList.remove('active');
  }

  saveUIState();
}

// Terminal Search Bar (Cmd+F / Ctrl+F)
// NOTE: Terminal search removed - using iTerm2's native search

// Start the app
init();
