// Terminal Dashboard - iTerm2 monitoring with inline output viewer

import { state } from './state.js';
import { registerStateHandler } from './project-switcher.js';
import { GetITermSessionInfo, GetITermStatus, SwitchITermTabBySessionID, CreateITermTab, RenameITermTabBySessionID, WatchITermSession, UnwatchITermSession, WriteITermTextBySessionID, SendITermSpecialKey } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';

// Dashboard state
let dashboardState = {
  itermStatus: null,
  lastUpdate: null,
  selectedProjectName: null, // project selected on the left
  viewingSessionId: null,    // terminal being viewed on the right
  sessionContents: '',       // output text (plain fallback)
  styledLines: null,         // styled line data (array of arrays of runs)
  cursorPos: null,           // {x, y}
  termSize: null,            // {cols, rows}
  profileColors: null,       // {fg, bg, cursor, ansi: [...]}
  useStyledMode: false,      // whether styled content is active
};

// ============================================
// Helpers
// ============================================

// Stores sessionId → projectName for tabs WE created
const tabProjectMap = {};

// Get tabs matching a project name
function getTabsForProject(allTabs, projectName, projectPath) {
  if (!projectName) return [];
  return allTabs.filter(tab => {
    // Match by our own mapping (most reliable - tabs we created)
    if (tabProjectMap[tab.sessionId] === projectName) return true;
    // Match by name
    if (tab.name === projectName || tab.name.startsWith(projectName + ' ')) return true;
    // Match by exact working directory path
    if (projectPath && tab.path && tab.path === projectPath) return true;
    return false;
  });
}

// Build project groups from all iTerm tabs + Claudilandia projects
function buildProjectGroups(allTabs) {
  const groups = []; // { name, path, tabs[], icon, color }
  const matched = new Set();

  // Show ALL Claudilandia projects (same order as top tabs)
  const projects = state.projects || [];
  for (const proj of projects) {
    const tabs = getTabsForProject(allTabs.filter(t => !matched.has(t.sessionId)), proj.name, proj.path);
    tabs.forEach(t => matched.add(t.sessionId));
    groups.push({
      name: proj.name,
      path: proj.path,
      icon: proj.icon || '',
      color: proj.color || '',
      tabs,
    });
  }

  // Collect unmatched tabs under "Other"
  const otherTabs = allTabs.filter(t => !matched.has(t.sessionId));
  if (otherTabs.length > 0) {
    groups.push({
      name: 'Other',
      path: '',
      icon: '',
      color: '',
      tabs: otherTabs,
    });
  }

  return groups;
}

// Get next tab number for a project
function getNextTabNumber(allTabs, projectName) {
  if (!projectName) return 1;
  const projectTabs = allTabs.filter(tab => tab.name.startsWith(projectName + ' '));
  let maxNum = 0;
  projectTabs.forEach(tab => {
    const match = tab.name.match(new RegExp(`^${escapeRegex(projectName)} (\\d+)$`));
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  });
  return maxNum + 1;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// Window handlers
// ============================================

// Select a project on the left
window.itermSelectProject = function(projectName) {
  if (dashboardState.selectedProjectName === projectName) return;
  stopViewing();
  dashboardState.selectedProjectName = projectName;
  renderTerminalDashboard();
};

// Select a terminal tab on the right (starts viewing)
window.itermSelectTerminal = async function(sessionId) {
  if (dashboardState.viewingSessionId === sessionId) return;
  stopViewing();

  dashboardState.viewingSessionId = sessionId;
  dashboardState.sessionContents = '';
  dashboardState.useStyledMode = true;
  renderTerminalDashboard();

  try {
    const result = await WatchITermSession(sessionId);
    if (result && result.startsWith('ERROR:')) {
      dashboardState.sessionContents = result;
      dashboardState.useStyledMode = false;
      renderTerminalDashboard();
    }
  } catch (err) {
    dashboardState.sessionContents = 'ERROR: ' + (err.message || err);
    dashboardState.useStyledMode = false;
    renderTerminalDashboard();
  }
};

// Focus iTerm2 on a specific session
window.itermFocusSession = async function(sessionId) {
  try {
    await SwitchITermTabBySessionID(sessionId);
  } catch (err) {
    console.error('Failed to focus session:', err);
  }
};

// Rename terminal (double-click on tab)
window.itermRenameTab = async function(sessionId, currentName) {
  const newName = prompt('Rename terminal:', currentName);
  if (newName && newName !== currentName) {
    try {
      await RenameITermTabBySessionID(sessionId, newName);
      const tab = dashboardState.itermStatus?.tabs?.find(t => t.sessionId === sessionId);
      if (tab) {
        tab.name = newName;
        renderTerminalDashboard();
      }
    } catch (err) {
      console.error('Failed to rename tab:', err);
    }
  }
};

// Create new terminal for the selected project
window.itermCreateTab = async function() {
  const projectName = dashboardState.selectedProjectName;
  if (!projectName || projectName === 'Other') return;

  const proj = (state.projects || []).find(p => p.name === projectName);
  if (!proj) return;

  const allTabs = dashboardState.itermStatus?.tabs || [];
  const previousSessionIds = new Set(allTabs.map(t => t.sessionId));
  const tabNumber = getNextTabNumber(allTabs, projectName);
  const tabName = `${projectName} ${tabNumber}`;

  try {
    await CreateITermTab(proj.path, tabName);

    // Wait for iTerm2 to create the session, then find it
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise(r => setTimeout(r, 500));
      const status = await GetITermStatus();
      dashboardState.itermStatus = status;
      const newTab = (status?.tabs || []).find(t => !previousSessionIds.has(t.sessionId));
      if (newTab) {
        tabProjectMap[newTab.sessionId] = projectName;
        renderTerminalDashboard();
        window.itermSelectTerminal(newTab.sessionId);
        return;
      }
    }
    // Tab not found after retries - just refresh to show whatever state we have
    renderTerminalDashboard();
  } catch (err) {
    console.error('Failed to create terminal:', err);
  }
};

window.itermRefreshDashboard = function() {
  refreshDashboardData();
};

// Send command to viewed session
window.itermSendCommand = async function() {
  const input = document.getElementById('itermCommandInput');
  if (!input || !dashboardState.viewingSessionId) return;

  const text = input.value.trim();
  if (!text) return;

  try {
    await WriteITermTextBySessionID(dashboardState.viewingSessionId, text, true);
    input.value = '';
  } catch (err) {
    console.error('Failed to send command:', err);
  }
};

window.itermSendKey = async function(key) {
  if (!dashboardState.viewingSessionId) return;
  try {
    await SendITermSpecialKey(dashboardState.viewingSessionId, key);
  } catch (err) {
    console.error('Failed to send key:', err);
  }
};

window.itermStopViewing = function() {
  stopViewing();
  renderTerminalDashboard();
};

// ============================================
// Core logic
// ============================================

export function stopViewing() {
  if (!dashboardState.viewingSessionId) return;
  dashboardState.viewingSessionId = null;
  dashboardState.sessionContents = '';
  dashboardState.styledLines = null;
  dashboardState.cursorPos = null;
  dashboardState.termSize = null;
  dashboardState.profileColors = null;
  dashboardState.useStyledMode = false;
  try {
    UnwatchITermSession();
  } catch (err) {
    // Ignore
  }
}

export function initTerminalDashboard() {
  addTerminalDashboardStyles();

  EventsOn('iterm-status-changed', (status) => {
    dashboardState.itermStatus = status;
    if (dashboardState.viewingSessionId && status?.tabs) {
      const stillExists = status.tabs.some(t => t.sessionId === dashboardState.viewingSessionId);
      if (!stillExists) {
        stopViewing();
      }
    }
    if (isDashboardVisible()) {
      renderTerminalDashboard();
    }
  });

  EventsOn('iterm-session-styled-content', (data) => {
    if (!data || data.sessionId !== dashboardState.viewingSessionId) return;
    try {
      dashboardState.styledLines = typeof data.lines === 'string' ? JSON.parse(data.lines) : data.lines;
      dashboardState.cursorPos = data.cursor;
      dashboardState.termSize = { cols: data.cols, rows: data.rows };
      dashboardState.useStyledMode = true;
      updateStyledOutputViewer();
    } catch (e) {
      console.error('Failed to parse styled content:', e);
    }
  });

  EventsOn('iterm-session-profile', (data) => {
    if (!data || data.sessionId !== dashboardState.viewingSessionId) return;
    dashboardState.profileColors = data.colors;
    applyProfileColors();
    if (dashboardState.styledLines) {
      updateStyledOutputViewer();
    }
  });

  setTimeout(() => refreshDashboardData(), 500);
}

function isDashboardVisible() {
  const panel = document.getElementById('dashboardPanel');
  return panel && panel.style.display !== 'none';
}

async function refreshDashboardData() {
  try {
    const status = await GetITermStatus();
    dashboardState.itermStatus = status;
  } catch (err) {
    // Ignore
  }

  dashboardState.lastUpdate = new Date();
  renderTerminalDashboard();
}

function updateStyledOutputViewer() {
  const viewer = document.getElementById('itermOutputViewer');
  if (!viewer) return;

  // Update bridge indicator to green
  const indicator = document.querySelector('.bridge-indicator');
  if (indicator && !indicator.classList.contains('active')) {
    indicator.classList.add('active');
    indicator.title = 'Python bridge (styled)';
  }

  const allLines = dashboardState.styledLines;
  if (!allLines) {
    viewer.textContent = '';
    return;
  }

  // Trim trailing empty lines so the viewer doesn't scroll past actual content
  let lastNonEmpty = allLines.length - 1;
  while (lastNonEmpty >= 0 && (!allLines[lastNonEmpty] || allLines[lastNonEmpty].length === 0)) {
    lastNonEmpty--;
  }
  const lines = allLines.slice(0, lastNonEmpty + 1);

  const wasAtBottom = viewer.scrollHeight - viewer.scrollTop - viewer.clientHeight < 30;
  const defaultFg = dashboardState.profileColors?.fg || '#c7c7c7';
  const defaultBg = dashboardState.profileColors?.bg || '#000000';

  const fragment = document.createDocumentFragment();

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineRuns = lines[lineIdx];
    const lineDiv = document.createElement('div');
    lineDiv.className = 'term-line';

    if (!lineRuns || lineRuns.length === 0) {
      lineDiv.textContent = '\u00A0';
      fragment.appendChild(lineDiv);
      continue;
    }

    for (const run of lineRuns) {
      const span = document.createElement('span');
      let style = '';

      if (run.inv) {
        // Inverse: swap fg/bg
        const fg = run.fg || defaultFg;
        const bg = run.bg || defaultBg;
        style += `color:${bg};background-color:${fg};`;
      } else {
        if (run.fg) style += `color:${run.fg};`;
        if (run.bg) style += `background-color:${run.bg};`;
      }

      if (run.b) style += 'font-weight:bold;';
      if (run.i) style += 'font-style:italic;';
      if (run.u && run.s) {
        style += 'text-decoration:underline line-through;';
      } else if (run.u) {
        style += 'text-decoration:underline;';
      } else if (run.s) {
        style += 'text-decoration:line-through;';
      }
      if (run.f) style += 'opacity:0.5;';

      if (style) span.setAttribute('style', style);
      span.textContent = run.t;
      lineDiv.appendChild(span);
    }

    fragment.appendChild(lineDiv);
  }

  viewer.innerHTML = '';
  viewer.appendChild(fragment);

  if (wasAtBottom) {
    viewer.scrollTop = viewer.scrollHeight;
  }
}

function applyProfileColors() {
  const viewer = document.getElementById('itermOutputViewer');
  if (!viewer || !dashboardState.profileColors) return;

  const colors = dashboardState.profileColors;
  viewer.style.backgroundColor = colors.bg;
  viewer.style.color = colors.fg;
}

// ============================================
// Render
// ============================================

export function renderTerminalDashboard() {
  const panel = document.getElementById('dashboardPanel');
  if (!panel) return;

  const allTabs = dashboardState.itermStatus?.tabs || [];
  const groups = buildProjectGroups(allTabs);

  // Auto-select first project if nothing selected yet
  if (!dashboardState.selectedProjectName && groups.length > 0) {
    dashboardState.selectedProjectName = groups[0].name;
  }

  const selectedGroup = groups.find(g => g.name === dashboardState.selectedProjectName);
  const selectedTabs = selectedGroup?.tabs || [];
  const isRealProject = selectedGroup && selectedGroup.name !== 'Other';

  // Stop viewing only if the session no longer exists at all (tab closed in iTerm2)
  if (dashboardState.viewingSessionId && !allTabs.some(t => t.sessionId === dashboardState.viewingSessionId)) {
    stopViewing();
  }

  const viewingTab = allTabs.find(t => t.sessionId === dashboardState.viewingSessionId);

  panel.innerHTML = `
    <div class="terminal-dashboard split-view">
      <!-- Left: Project list -->
      <div class="dashboard-card projects-card">
        <div class="card-header">
          <span class="card-title">Projects</span>
          <button class="term-refresh-btn" onclick="window.itermRefreshDashboard()" title="Refresh">↻</button>
        </div>
        <div class="card-content terminal-list-content">
          ${groups.length > 0 ? `
            <div class="terminal-list">
              ${groups.map(g => `
                <div class="terminal-list-item ${g.name === dashboardState.selectedProjectName ? 'viewing' : ''}"
                     onclick="window.itermSelectProject('${escapeHtml(g.name).replace(/'/g, "\\'")}')">
                  ${g.icon ? `<span class="project-icon">${g.icon}</span>` : ''}
                  <span class="terminal-list-name">${escapeHtml(g.name)}</span>
                  ${g.tabs.length > 0 ? `<span class="card-count">${g.tabs.length}</span>` : ''}
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="no-terminals">No terminals open in iTerm2</div>
          `}
        </div>
      </div>

      <!-- Right: Terminal tabs + output -->
      <div class="dashboard-card output-card">
        ${selectedGroup ? `
          <!-- Terminal tabs bar -->
          <div class="terminal-tabs-bar">
            <div class="terminal-tabs-scroll">
              ${selectedTabs.map(tab => `
                <button class="term-tab-btn ${tab.sessionId === dashboardState.viewingSessionId ? 'active' : ''}"
                        onclick="window.itermSelectTerminal('${tab.sessionId}')"
                        ondblclick="event.preventDefault(); window.itermRenameTab('${tab.sessionId}', '${escapeHtml(tab.name).replace(/'/g, "\\'")}')"
                        title="Click to view, double-click to rename">
                  ${escapeHtml(tab.name)}
                  <span class="term-tab-focus" onclick="event.stopPropagation(); window.itermFocusSession('${tab.sessionId}')" title="Focus in iTerm2">⤴</span>
                </button>
              `).join('')}
            </div>
            ${isRealProject ? `<button class="term-add-btn" onclick="window.itermCreateTab()" title="New Terminal">+</button>` : ''}
          </div>

          <!-- Output viewer -->
          ${dashboardState.viewingSessionId ? (
            dashboardState.sessionContents?.startsWith('ERROR:') ? `
            <div class="output-viewer-container">
              <div class="bridge-error">
                <div class="bridge-error-title">Python Bridge Error</div>
                <div class="bridge-error-msg">${escapeHtml(dashboardState.sessionContents.slice(7))}</div>
                <div class="bridge-error-help">
                  Setup:<br>
                  1. cd scripts && python3 -m venv venv && source venv/bin/activate && pip install iterm2<br>
                  2. iTerm2 → Settings → General → Magic → Enable Python API<br>
                  3. Restart Claudilandia
                </div>
              </div>
            </div>
          ` : `
            <div class="output-viewer-container">
              <div class="iterm-output-viewer" id="itermOutputViewer"></div>
              <div class="keyboard-helper">
                <button class="key-btn" onclick="window.itermSendKey('enter')">Enter</button>
                <button class="key-btn" onclick="window.itermSendKey('shift-tab')">Shift+Tab</button>
                <button class="key-btn" onclick="window.itermSendKey('esc')">ESC</button>
                <button class="key-btn" onclick="window.itermSendKey('tab')">Tab</button>
                <button class="key-btn" onclick="window.itermSendKey('up')">↑</button>
                <button class="key-btn" onclick="window.itermSendKey('down')">↓</button>
                <span class="bridge-indicator ${dashboardState.useStyledMode ? 'active' : ''}" title="${dashboardState.useStyledMode ? 'Python bridge (styled)' : 'Not connected'}"></span>
              </div>
              <div class="command-input-bar">
                <input type="text" id="itermCommandInput" class="command-input"
                       placeholder="Type command and press Enter..." autocomplete="off" spellcheck="false"
                       onkeydown="if(event.key==='Enter'){event.preventDefault();window.itermSendCommand();}">
              </div>
            </div>
          `) : `
            <div class="output-placeholder">
              ${selectedTabs.length === 0 && isRealProject ? `
                <span>No terminals for this project</span>
                <button class="create-first-btn" onclick="window.itermCreateTab()">Create Terminal</button>
              ` : `
                <span>Select a terminal tab to view its output</span>
              `}
            </div>
          `}
        ` : `
          <div class="output-placeholder">
            <span>Select a project</span>
          </div>
        `}
      </div>
    </div>
  `;

  // Populate and scroll output on initial render
  if (dashboardState.viewingSessionId) {
    if (dashboardState.useStyledMode && dashboardState.styledLines) {
      applyProfileColors();
      updateStyledOutputViewer();
    } else if (dashboardState.sessionContents) {
      const viewer = document.getElementById('itermOutputViewer');
      if (viewer) {
        viewer.textContent = dashboardState.sessionContents;
        viewer.scrollTop = viewer.scrollHeight;
      }
    }
  }

  // Auto-focus command input when a terminal is active
  if (dashboardState.viewingSessionId) {
    const cmdInput = document.getElementById('itermCommandInput');
    if (cmdInput) cmdInput.focus();
  }
}

export function showTerminalDashboard() {
  refreshDashboardData();
}

// ============================================
// Styles
// ============================================

function addTerminalDashboardStyles() {
  if (document.getElementById('terminal-dashboard-styles')) return;

  const style = document.createElement('style');
  style.id = 'terminal-dashboard-styles';
  style.textContent = `
    .terminal-dashboard {
      display: grid;
      gap: 16px;
      padding: 20px;
      height: 100%;
      overflow: hidden;
    }

    .terminal-dashboard.split-view {
      grid-template-columns: 220px 1fr;
    }

    /* Cards */
    .dashboard-card {
      background: linear-gradient(135deg, #1e293b 0%, #1a2332 100%);
      border: 1px solid #334155;
      border-radius: 16px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.02);
      border-bottom: 1px solid #334155;
      flex-shrink: 0;
    }

    .card-title {
      font-size: 13px;
      font-weight: 600;
      color: #f1f5f9;
      flex: 1;
    }

    .card-count {
      font-size: 11px;
      color: #64748b;
      background: #334155;
      padding: 2px 8px;
      border-radius: 12px;
      flex-shrink: 0;
    }

    .card-content { padding: 12px; }

    /* Project list (left) */
    .projects-card {
      min-height: 0;
    }

    .terminal-list-content {
      overflow-y: auto;
      flex: 1;
      min-height: 0;
    }

    .terminal-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .terminal-list-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #0f172a;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s;
    }

    .terminal-list-item:hover {
      background: #1e293b;
      border-color: #475569;
    }

    .terminal-list-item.viewing {
      background: #1e3a5f;
      border-color: #3b82f6;
    }

    .terminal-list-name {
      flex: 1;
      font-size: 13px;
      color: #e2e8f0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .project-icon {
      font-size: 14px;
      flex-shrink: 0;
    }

    .no-terminals {
      color: #64748b;
      font-size: 13px;
      text-align: center;
      padding: 20px;
    }

    /* Terminal tabs bar (right, top) */
    .terminal-tabs-bar {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      border-bottom: 1px solid #334155;
      flex-shrink: 0;
      overflow: hidden;
    }

    .terminal-tabs-scroll {
      display: flex;
      gap: 4px;
      flex: 1;
      overflow-x: auto;
      min-width: 0;
    }

    .terminal-tabs-scroll::-webkit-scrollbar { height: 0; }

    .term-tab-btn {
      appearance: none;
      border: none;
      background: #0f172a;
      color: #94a3b8;
      padding: 5px 12px;
      font-size: 12px;
      border-radius: 6px;
      cursor: pointer;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s;
      flex-shrink: 0;
    }

    .term-tab-btn:hover {
      background: #1e293b;
      color: #e2e8f0;
    }

    .term-tab-btn.active {
      background: #3b82f6;
      color: white;
    }

    .term-tab-focus {
      font-size: 12px;
      opacity: 0;
      cursor: pointer;
      transition: opacity 0.15s;
    }

    .term-tab-btn:hover .term-tab-focus { opacity: 0.6; }
    .term-tab-focus:hover { opacity: 1 !important; }

    .no-tabs-hint {
      color: #475569;
      font-size: 12px;
      padding: 4px 8px;
    }

    .term-add-btn {
      width: 26px;
      height: 26px;
      padding: 0;
      border: none;
      border-radius: 6px;
      background: #3b82f6;
      color: white;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.15s;
    }

    .term-add-btn:hover { background: #2563eb; }

    .term-refresh-btn {
      width: 24px;
      height: 24px;
      padding: 0;
      border: none;
      border-radius: 4px;
      background: #475569;
      color: white;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .term-refresh-btn:hover { background: #64748b; }

    /* Output card (right) */
    .output-card { min-height: 0; }

    .output-placeholder {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #475569;
      font-size: 13px;
    }

    .output-viewer-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .iterm-output-viewer {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overflow-x: auto;
      margin: 0;
      padding: 8px 12px;
      background: #000000;
      color: #c7c7c7;
      font-family: 'Menlo', 'Monaco', 'JetBrains Mono', monospace;
      font-size: 12px;
      line-height: 1.35;
      border: none;
    }

    .term-line {
      min-height: 1.35em;
      white-space: pre;
    }

    .term-line span {
      white-space: pre;
    }

    .keyboard-helper {
      display: flex;
      gap: 4px;
      padding: 6px 12px;
      background: #0f172a;
      border-top: 1px solid #334155;
      flex-wrap: wrap;
      flex-shrink: 0;
      align-items: center;
    }

    .key-btn {
      background: #1e293b;
      color: #94a3b8;
      border: 1px solid #334155;
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 11px;
      font-family: 'Menlo', 'Monaco', monospace;
      cursor: pointer;
      transition: all 0.1s;
      line-height: 1.4;
    }

    .key-btn:hover {
      background: #334155;
      color: #e2e8f0;
      border-color: #475569;
    }

    .key-btn:active {
      background: #3b82f6;
      color: white;
      border-color: #3b82f6;
    }

    .command-input-bar {
      display: flex;
      gap: 8px;
      padding: 8px 12px;
      background: #0f172a;
      border-top: 1px solid #334155;
      flex-shrink: 0;
    }

    .command-input {
      flex: 1;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 6px 10px;
      color: #e2e8f0;
      font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
      font-size: 12px;
      outline: none;
    }

    .command-input:focus { border-color: #3b82f6; }
    .command-input::placeholder { color: #475569; }

    .create-first-btn {
      margin-top: 12px;
      appearance: none;
      border: none;
      background: #3b82f6;
      color: white;
      padding: 8px 20px;
      font-size: 13px;
      font-weight: 500;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .create-first-btn:hover { background: #2563eb; }

    .bridge-error {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      text-align: center;
      gap: 12px;
    }

    .bridge-error-title {
      font-size: 15px;
      font-weight: 600;
      color: #ef4444;
    }

    .bridge-error-msg {
      font-size: 13px;
      color: #94a3b8;
      max-width: 500px;
    }

    .bridge-error-help {
      font-size: 12px;
      color: #64748b;
      background: #0f172a;
      padding: 12px 16px;
      border-radius: 8px;
      text-align: left;
      line-height: 1.8;
      font-family: 'Menlo', 'Monaco', monospace;
    }

    .bridge-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ef4444;
      flex-shrink: 0;
      opacity: 0.7;
    }

    .bridge-indicator.active {
      background: #22c55e;
    }

    /* Scrollbars */
    .iterm-output-viewer::-webkit-scrollbar,
    .terminal-list-content::-webkit-scrollbar {
      width: 6px;
    }

    .iterm-output-viewer::-webkit-scrollbar-track,
    .terminal-list-content::-webkit-scrollbar-track {
      background: transparent;
    }

    .iterm-output-viewer::-webkit-scrollbar-thumb,
    .terminal-list-content::-webkit-scrollbar-thumb {
      background: #334155;
      border-radius: 3px;
    }

    .iterm-output-viewer::-webkit-scrollbar-thumb:hover,
    .terminal-list-content::-webkit-scrollbar-thumb:hover {
      background: #475569;
    }
  `;
  document.head.appendChild(style);
}

// ============================================
// Project switcher handler
// ============================================

export function initTerminalDashboardHandler() {
  registerStateHandler('terminalDashboard', {
    priority: 80,

    onLoad: (ctx) => {
      // Auto-select active project only if nothing is selected yet
      if (!dashboardState.selectedProjectName && state.activeProject?.name) {
        dashboardState.selectedProjectName = state.activeProject.name;
      }
    },
  });
}
