// Terminal Dashboard - iTerm2 monitoring and Claude session tracking

import { state } from './state.js';
import { registerStateHandler } from './project-switcher.js';
import { GetITermSessionInfo, GetITermStatus, SwitchITermTab, CreateITermTab, RenameITermTab } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';

// Dashboard state
let dashboardState = {
  sessionInfo: null,
  itermStatus: null,
  claudeStatus: 'idle', // idle, thinking, working
  lastUpdate: null,
  pollInterval: null,
  activeTermTab: 'project' // 'project' or 'all'
};

// Get current project name
function getActiveProjectName() {
  return state.activeProject?.name || '';
}

// Get current project path
function getActiveProjectPath() {
  return state.activeProject?.path || '';
}

// Filter tabs for current project
function getProjectTabs(allTabs) {
  const projectName = getActiveProjectName();
  if (!projectName) return [];
  return allTabs.filter(tab => tab.name.startsWith(projectName + ' ') || tab.name === projectName);
}

// Get next tab number for project
function getNextTabNumber(allTabs) {
  const projectName = getActiveProjectName();
  if (!projectName) return 1;

  const projectTabs = allTabs.filter(tab => tab.name.startsWith(projectName + ' '));
  let maxNum = 0;
  projectTabs.forEach(tab => {
    const match = tab.name.match(new RegExp(`^${projectName} (\\d+)$`));
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  });
  return maxNum + 1;
}

// Global functions for onclick handlers
window.setTerminalTab = function(tab) {
  dashboardState.activeTermTab = tab;
  renderTerminalDashboard();
};

window.itermSwitchTab = async function(windowId, tabIndex) {
  try {
    await SwitchITermTab(windowId, tabIndex);
    // Update local state
    if (dashboardState.itermStatus?.tabs) {
      dashboardState.itermStatus.tabs.forEach(tab => {
        tab.isActive = (tab.windowId === windowId && tab.tabIndex === tabIndex);
      });
      renderTerminalDashboard();
    }
  } catch (err) {
    console.error('Failed to switch tab:', err);
  }
};

window.itermCreateTab = async function() {
  const projectPath = getActiveProjectPath();
  const projectName = getActiveProjectName();
  if (!projectPath || !projectName) return;

  const allTabs = dashboardState.itermStatus?.tabs || [];
  const tabNumber = getNextTabNumber(allTabs);
  const tabName = `${projectName} ${tabNumber}`;

  try {
    await CreateITermTab(projectPath, tabName);
    setTimeout(() => refreshDashboardData(), 500);
  } catch (err) {
    console.error('Failed to create tab:', err);
  }
};

window.itermRenameTab = async function(windowId, tabIndex, currentName) {
  const newName = prompt('Rename terminal:', currentName);
  if (newName && newName !== currentName) {
    try {
      await RenameITermTab(windowId, tabIndex, newName);
      setTimeout(() => refreshDashboardData(), 300);
    } catch (err) {
      console.error('Failed to rename tab:', err);
    }
  }
};

// Initialize terminal dashboard
export function initTerminalDashboard() {
  addTerminalDashboardStyles();

  // Listen for iTerm status changes
  EventsOn('iterm-status-changed', (status) => {
    dashboardState.itermStatus = status;
    if (isDashboardVisible()) {
      renderTerminalDashboard();
    }
  });

  // Start polling when dashboard is visible
  startPolling();
}

// Start polling for terminal data
function startPolling() {
  if (dashboardState.pollInterval) return;

  dashboardState.pollInterval = setInterval(async () => {
    if (isDashboardVisible()) {
      await refreshDashboardData();
    }
  }, 2000); // Poll every 2 seconds
}

// Stop polling
function stopPolling() {
  if (dashboardState.pollInterval) {
    clearInterval(dashboardState.pollInterval);
    dashboardState.pollInterval = null;
  }
}

// Check if dashboard is visible
function isDashboardVisible() {
  const panel = document.getElementById('dashboardPanel');
  return panel && panel.style.display !== 'none';
}

// Refresh dashboard data from iTerm2
async function refreshDashboardData() {
  try {
    // Get iTerm status
    const status = await GetITermStatus();
    dashboardState.itermStatus = status;

    if (!status?.running) {
      dashboardState.sessionInfo = null;
      renderTerminalDashboard();
      return;
    }

    // Get session info
    const info = await GetITermSessionInfo();
    dashboardState.sessionInfo = info;

    // Detect Claude status from session info
    detectClaudeStatusFromInfo(info);

    dashboardState.lastUpdate = new Date();
    renderTerminalDashboard();
  } catch (err) {
    console.error('Failed to refresh dashboard data:', err);
  }
}

// Detect Claude Code status from session info
function detectClaudeStatusFromInfo(info) {
  if (!info) {
    dashboardState.claudeStatus = 'idle';
    return;
  }

  // Check if session is processing
  if (info.isProcessing) {
    // Check session name for Claude indicators
    const name = (info.name || '').toLowerCase();
    if (name.includes('claude') || name.includes('thinking')) {
      dashboardState.claudeStatus = 'thinking';
    } else {
      dashboardState.claudeStatus = 'working';
    }
  } else {
    dashboardState.claudeStatus = 'idle';
  }
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Format time ago
function formatTimeAgo(date) {
  if (!date) return '';
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// Get status indicator
function getStatusIndicator(status) {
  switch (status) {
    case 'thinking': return { icon: '🤔', color: '#f9e2af', text: 'Thinking...' };
    case 'working': return { icon: '⚡', color: '#89b4fa', text: 'Working...' };
    case 'done': return { icon: '✅', color: '#a6e3a1', text: 'Done' };
    default: return { icon: '💤', color: '#6c7086', text: 'Idle' };
  }
}

// Render the terminal dashboard
export function renderTerminalDashboard() {
  const panel = document.getElementById('dashboardPanel');
  if (!panel) return;

  const status = dashboardState.itermStatus;
  const info = dashboardState.sessionInfo;
  const claudeIndicator = getStatusIndicator(dashboardState.claudeStatus);

  // If iTerm2 not running
  if (!status?.running) {
    panel.innerHTML = `
      <div class="terminal-dashboard">
        <div class="dashboard-empty-state">
          <div class="empty-icon">🖥️</div>
          <h3>iTerm2 Not Running</h3>
          <p>Start iTerm2 to see terminal activity</p>
        </div>
      </div>
    `;
    return;
  }

  // Get all tabs and filter for project
  const allTabs = status.tabs || [];
  const projectTabs = getProjectTabs(allTabs);
  const displayTabs = dashboardState.activeTermTab === 'project' ? projectTabs : allTabs;

  panel.innerHTML = `
    <div class="terminal-dashboard">
      <!-- Claude Status Card -->
      <div class="dashboard-card claude-status-card">
        <div class="card-header">
          <span class="card-icon">🤖</span>
          <span class="card-title">Claude Session</span>
          <div class="status-badge" style="background: ${claudeIndicator.color}20; color: ${claudeIndicator.color}">
            <span class="status-icon">${claudeIndicator.icon}</span>
            <span class="status-text">${claudeIndicator.text}</span>
          </div>
        </div>
        <div class="card-content">
          <div class="claude-info">
            ${info ? `
              <div class="info-row">
                <span class="info-label">Session</span>
                <span class="info-value">${escapeHtml(info.name || 'Unknown')}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Profile</span>
                <span class="info-value">${escapeHtml(info.profileName || 'Default')}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Size</span>
                <span class="info-value">${info.columns}x${info.rows}</span>
              </div>
            ` : `
              <div class="no-activity">Select a terminal to see details</div>
            `}
          </div>
        </div>
      </div>

      <!-- iTerm2 Terminals Card -->
      <div class="dashboard-card terminals-card">
        <div class="card-header">
          <span class="card-icon">📍</span>
          <span class="card-title">iTerm2 Terminals</span>
          <span class="card-count">${allTabs.length}</span>
        </div>
        <div class="terminals-tabs">
          <button class="term-tab ${dashboardState.activeTermTab === 'project' ? 'active' : ''}" onclick="window.setTerminalTab('project')">This Project</button>
          <button class="term-tab ${dashboardState.activeTermTab === 'all' ? 'active' : ''}" onclick="window.setTerminalTab('all')">All</button>
          <span class="tab-spacer"></span>
          ${dashboardState.activeTermTab === 'project' ? `
            <button class="term-add-btn" onclick="window.itermCreateTab()" title="New Terminal">+</button>
          ` : ''}
        </div>
        <div class="card-content">
          ${displayTabs.length > 0 ? `
            <div class="terminals-list">
              ${displayTabs.map(tab => `
                <div class="terminal-item ${tab.isActive ? 'active' : ''}" onclick="window.itermSwitchTab(${tab.windowId}, ${tab.tabIndex})">
                  <div class="terminal-status ${tab.isActive ? 'running' : 'idle'}"></div>
                  <div class="terminal-info">
                    <span class="terminal-name">${escapeHtml(tab.name)}</span>
                  </div>
                  <button class="terminal-edit-btn" onclick="event.stopPropagation(); window.itermRenameTab(${tab.windowId}, ${tab.tabIndex}, '${escapeHtml(tab.name).replace(/'/g, "\\'")}')" title="Rename">✎</button>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="no-terminals">${dashboardState.activeTermTab === 'project' ? 'No terminals for this project' : 'No terminals open'}</div>
          `}
        </div>
      </div>
    </div>
  `;
}

// Show terminal dashboard
export function showTerminalDashboard() {
  refreshDashboardData();
}

// Add CSS styles
function addTerminalDashboardStyles() {
  if (document.getElementById('terminal-dashboard-styles')) return;

  const style = document.createElement('style');
  style.id = 'terminal-dashboard-styles';
  style.textContent = `
    /* Terminal Dashboard */
    .terminal-dashboard {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 16px;
      padding: 20px;
      height: 100%;
      overflow-y: auto;
      align-content: start;
    }

    /* Dashboard Card */
    .dashboard-card {
      background: linear-gradient(135deg, #1e293b 0%, #1a2332 100%);
      border: 1px solid #334155;
      border-radius: 16px;
      overflow: hidden;
      transition: all 0.2s ease;
    }

    .dashboard-card:hover {
      border-color: #475569;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 16px 20px;
      background: rgba(255, 255, 255, 0.02);
      border-bottom: 1px solid #334155;
    }

    .card-icon {
      font-size: 18px;
    }

    .card-title {
      font-size: 14px;
      font-weight: 600;
      color: #f1f5f9;
      flex: 1;
    }

    .card-count {
      font-size: 12px;
      color: #64748b;
      background: #334155;
      padding: 2px 10px;
      border-radius: 12px;
    }

    .card-time {
      font-size: 11px;
      color: #64748b;
    }

    .card-content {
      padding: 16px 20px;
    }

    /* Status Badge */
    .status-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
    }

    .status-icon {
      font-size: 12px;
    }

    /* Claude Info */
    .claude-info {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .info-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: #0f172a;
      border-radius: 8px;
      font-size: 12px;
    }

    .info-label {
      color: #64748b;
    }

    .info-value {
      color: #e2e8f0;
      font-family: 'JetBrains Mono', monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 200px;
    }

    .no-activity {
      color: #64748b;
      font-size: 13px;
      text-align: center;
      padding: 20px;
    }

    /* Terminals List */
    .terminals-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .terminal-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      background: #0f172a;
      border-radius: 10px;
      transition: all 0.15s ease;
    }

    .terminal-item:hover {
      background: #1e293b;
    }

    .terminal-item.active {
      background: linear-gradient(135deg, #22c55e15 0%, #0f172a 100%);
      border: 1px solid #22c55e40;
    }

    .terminal-status {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .terminal-status.running {
      background: #22c55e;
      box-shadow: 0 0 8px #22c55e80;
      animation: pulse 2s infinite;
    }

    .terminal-status.idle {
      background: #64748b;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .terminal-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow: hidden;
    }

    .terminal-name {
      font-size: 13px;
      color: #e2e8f0;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .terminal-command {
      font-size: 11px;
      color: #64748b;
    }

    .active-badge {
      font-size: 10px;
      color: #22c55e;
      background: #22c55e20;
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 500;
    }

    .no-terminals {
      color: #64748b;
      font-size: 13px;
      text-align: center;
      padding: 20px;
    }

    /* Empty State */
    .dashboard-empty-state {
      grid-column: 1 / -1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      text-align: center;
    }

    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .dashboard-empty-state h3 {
      font-size: 18px;
      color: #e2e8f0;
      margin: 0 0 8px 0;
    }

    .dashboard-empty-state p {
      font-size: 14px;
      color: #64748b;
      margin: 0;
    }

    /* Scrollbar styling */
    .terminal-output-preview::-webkit-scrollbar,
    .terminal-dashboard::-webkit-scrollbar {
      width: 6px;
    }

    .terminal-output-preview::-webkit-scrollbar-track,
    .terminal-dashboard::-webkit-scrollbar-track {
      background: transparent;
    }

    .terminal-output-preview::-webkit-scrollbar-thumb,
    .terminal-dashboard::-webkit-scrollbar-thumb {
      background: #334155;
      border-radius: 3px;
    }

    .terminal-output-preview::-webkit-scrollbar-thumb:hover,
    .terminal-dashboard::-webkit-scrollbar-thumb:hover {
      background: #475569;
    }

    /* Terminal tabs bar */
    .terminals-tabs {
      display: flex;
      gap: 4px;
      padding: 8px 12px;
      border-bottom: 1px solid #334155;
      align-items: center;
    }

    .term-tab {
      padding: 4px 12px;
      font-size: 12px;
      background: transparent;
      border: none;
      color: #64748b;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.15s;
    }

    .term-tab.active {
      background: #334155;
      color: #f1f5f9;
    }

    .term-tab:hover:not(.active) {
      background: #1e293b;
    }

    .tab-spacer {
      flex: 1;
    }

    .term-add-btn {
      width: 24px;
      height: 24px;
      padding: 0;
      border: none;
      border-radius: 4px;
      background: #3b82f6;
      color: white;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
    }

    .term-add-btn:hover {
      background: #2563eb;
    }

    /* Terminal item clickable */
    .terminal-item {
      cursor: pointer;
    }

    /* Edit button */
    .terminal-edit-btn {
      opacity: 0;
      background: transparent;
      border: none;
      color: #64748b;
      cursor: pointer;
      padding: 4px 6px;
      font-size: 12px;
      transition: opacity 0.15s;
      flex-shrink: 0;
    }

    .terminal-item:hover .terminal-edit-btn {
      opacity: 1;
    }

    .terminal-edit-btn:hover {
      color: #3b82f6;
    }
  `;
  document.head.appendChild(style);
}

// Project switcher handler
export function initTerminalDashboardHandler() {
  registerStateHandler('terminalDashboard', {
    priority: 80,

    onBeforeSwitch: async (ctx) => {
      // Clear dashboard state when switching projects
      dashboardState.sessionInfo = null;
    },

    onLoad: async (ctx) => {
      // Refresh data for new project
      if (isDashboardVisible()) {
        await refreshDashboardData();
      }
    },

    onAfterSwitch: async (ctx) => {
      // Re-render if visible
      if (isDashboardVisible()) {
        setTimeout(() => refreshDashboardData(), 200);
      }
    }
  });
}
