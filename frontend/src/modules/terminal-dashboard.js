// Terminal Dashboard - iTerm2 monitoring and Git status tracking

import { state } from './state.js';
import { registerStateHandler } from './project-switcher.js';
import { GetITermSessionInfo, GetITermStatus, SwitchITermTab, CreateITermTab, RenameITermTab, GetGitStatus, GetGitHistory, GetGitCurrentBranch } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';

// Dashboard state
let dashboardState = {
  sessionInfo: null,
  itermStatus: null,
  gitStatus: null,
  gitHistory: null,
  gitBranch: null,
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

  // Delay polling start to let Wails bindings register (fixes hot reload errors)
  setTimeout(() => startPolling(), 500);
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

// Refresh dashboard data from iTerm2 and Git
async function refreshDashboardData() {
  const projectPath = getActiveProjectPath();

  // Fetch iTerm status first (fast) and render immediately
  try {
    const status = await GetITermStatus();
    dashboardState.itermStatus = status;
    if (status?.running) {
      try {
        dashboardState.sessionInfo = await GetITermSessionInfo();
      } catch (e) {
        // Ignore session info errors
      }
    } else {
      dashboardState.sessionInfo = null;
    }
  } catch (err) {
    // Ignore iTerm errors (including binding registration during hot reload)
  }

  // Render immediately with whatever data we have
  dashboardState.lastUpdate = new Date();
  renderTerminalDashboard();

  // Fetch Git data in background (slower) and update when ready
  if (projectPath) {
    fetchGitDataInBackground(projectPath);
  }
}

// Fetch git data without blocking
async function fetchGitDataInBackground(projectPath) {
  try {
    const [gitStatus, gitBranch, gitHistory] = await Promise.all([
      GetGitStatus(projectPath),
      GetGitCurrentBranch(projectPath),
      GetGitHistory(projectPath, 50)
    ]);

    // Only update if we're still on the same project
    if (getActiveProjectPath() === projectPath) {
      dashboardState.gitStatus = gitStatus;
      dashboardState.gitBranch = gitBranch;
      dashboardState.gitHistory = gitHistory;
      renderTerminalDashboard();
    }
  } catch (err) {
    // Silently ignore git errors
  }
}

// Build activity data from git history (last 12 weeks, aligned to calendar weeks)
function buildActivityData(history) {
  if (!history || history.length === 0) return { weeks: [], months: [] };

  const weeksCount = 12;
  const now = new Date();

  // Find the end of current week (Saturday)
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + (6 - endDate.getDay())); // Go to Saturday
  endDate.setHours(23, 59, 59, 999);

  // Find start of the period (Sunday, 12 weeks ago)
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (weeksCount * 7) + 1);
  startDate.setHours(0, 0, 0, 0);

  // Build commit count map
  const commitMap = new Map();
  history.forEach(commit => {
    if (commit.date) {
      const key = commit.date.split('T')[0];
      commitMap.set(key, (commitMap.get(key) || 0) + 1);
    }
  });

  // Build weeks array (each week is Sun-Sat, displayed as column)
  const weeks = [];
  const currentDate = new Date(startDate);

  for (let w = 0; w < weeksCount; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const isFuture = currentDate > now;
      week.push({
        date: dateStr,
        count: isFuture ? -1 : (commitMap.get(dateStr) || 0), // -1 for future days
        dateObj: new Date(currentDate)
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
    weeks.push(week);
  }

  // Build month labels - show at first week where month appears
  const months = [];
  let lastMonth = -1;
  weeks.forEach((week, weekIndex) => {
    // Check each day in the week for month boundary
    for (const day of week) {
      const month = day.dateObj.getMonth();
      if (month !== lastMonth) {
        // Only add if this is a new month
        months.push({
          weekIndex,
          label: day.dateObj.toLocaleDateString('en', { month: 'short' })
        });
        lastMonth = month;
        break; // Only one label per week max
      }
    }
  });

  return { weeks, months };
}

// Get commits this week
function getCommitsThisWeek(history) {
  if (!history) return 0;
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  return history.filter(c => c.date && new Date(c.date) >= startOfWeek).length;
}

// Get last commit info
function getLastCommit(history) {
  if (!history || history.length === 0) return null;
  return history[0]; // Assuming sorted by date desc
}

// Format relative time
function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

// Get activity level (0-4) for styling, -1 for future days
function getActivityLevel(count) {
  if (count < 0) return 'future'; // Future days
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  return 4;
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

// Render the terminal dashboard
export function renderTerminalDashboard() {
  const panel = document.getElementById('dashboardPanel');
  if (!panel) return;

  const status = dashboardState.itermStatus;
  const gitStatus = dashboardState.gitStatus;
  const gitHistory = dashboardState.gitHistory;
  const gitBranch = dashboardState.gitBranch;
  const activityData = buildActivityData(gitHistory);
  const lastCommit = getLastCommit(gitHistory);
  const commitsThisWeek = getCommitsThisWeek(gitHistory);

  // Get all tabs and filter for project
  const allTabs = status?.tabs || [];
  const projectTabs = getProjectTabs(allTabs);
  const displayTabs = dashboardState.activeTermTab === 'project' ? projectTabs : allTabs;

  // Calculate total commits in last 12 weeks
  const totalCommits = gitHistory?.length || 0;

  panel.innerHTML = `
    <div class="terminal-dashboard">
      <!-- Git Status Card -->
      <div class="dashboard-card git-status-card">
        <div class="card-header">
          <span class="card-icon">📊</span>
          <span class="card-title">Git Activity</span>
          ${gitBranch ? `<span class="branch-badge">⎇ ${escapeHtml(gitBranch)}</span>` : ''}
        </div>
        <div class="card-content">
          ${gitStatus ? `
            <!-- Stats row -->
            <div class="git-stats-row">
              <div class="git-stat">
                <span class="stat-value ${gitStatus.staged > 0 ? 'has-changes' : ''}">${gitStatus.staged}</span>
                <span class="stat-label">Staged</span>
              </div>
              <div class="git-stat">
                <span class="stat-value ${gitStatus.unstaged > 0 ? 'has-changes' : ''}">${gitStatus.unstaged}</span>
                <span class="stat-label">Modified</span>
              </div>
              <div class="git-stat">
                <span class="stat-value ${gitStatus.untracked > 0 ? 'has-changes' : ''}">${gitStatus.untracked}</span>
                <span class="stat-label">Untracked</span>
              </div>
              <div class="git-stat">
                <span class="stat-value">${commitsThisWeek}</span>
                <span class="stat-label">This Week</span>
              </div>
              <div class="git-stat">
                <span class="stat-value">${totalCommits}</span>
                <span class="stat-label">12 Weeks</span>
              </div>
            </div>

            <!-- Activity graph -->
            <div class="activity-graph">
              <div class="activity-months">
                ${activityData.months?.map(m => `<span style="left: ${m.weekIndex * 18}px">${m.label}</span>`).join('') || ''}
              </div>
              <div class="activity-grid">
                ${activityData.weeks?.map(week => `
                  <div class="activity-week">
                    ${week.map(day => `
                      <div class="activity-day level-${getActivityLevel(day.count)}" title="${day.date}: ${day.count} commits"></div>
                    `).join('')}
                  </div>
                `).join('') || ''}
              </div>
              <div class="activity-legend">
                <span>Less</span>
                <div class="activity-day level-0"></div>
                <div class="activity-day level-1"></div>
                <div class="activity-day level-2"></div>
                <div class="activity-day level-3"></div>
                <div class="activity-day level-4"></div>
                <span>More</span>
              </div>
            </div>

            <!-- Last commit -->
            ${lastCommit ? `
              <div class="last-commit">
                <div class="last-commit-header">
                  <span class="commit-icon">⚡</span>
                  <span class="commit-time">${formatRelativeTime(lastCommit.date)}</span>
                </div>
                <div class="commit-message">${escapeHtml(lastCommit.subject || '')}</div>
                <div class="commit-author">${escapeHtml(lastCommit.author || '')}</div>
              </div>
            ` : ''}
          ` : `
            <div class="no-activity">Not a git repository</div>
          `}
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

    /* Git Status Card */
    .git-status-card .card-header {
      gap: 8px;
    }

    .branch-badge {
      font-size: 11px;
      color: #a78bfa;
      background: #7c3aed20;
      padding: 3px 10px;
      border-radius: 12px;
      font-family: 'JetBrains Mono', monospace;
      margin-left: auto;
    }

    .git-stats-row {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }

    .git-stat {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 8px 6px;
      background: #0f172a;
      border-radius: 8px;
      min-width: 0;
    }

    .stat-value {
      font-size: 18px;
      font-weight: 600;
      color: #e2e8f0;
      font-family: 'JetBrains Mono', monospace;
    }

    .stat-value.has-changes {
      color: #fbbf24;
    }

    .stat-label {
      font-size: 10px;
      color: #64748b;
      margin-top: 2px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .activity-graph {
      background: #0f172a;
      border-radius: 8px;
      padding: 12px;
    }

    .activity-label {
      display: none;
    }

    .activity-grid {
      display: flex;
      gap: 4px;
      overflow-x: auto;
      padding-bottom: 4px;
    }

    .activity-week {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .activity-day {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      transition: transform 0.1s;
    }

    .activity-day:hover {
      transform: scale(1.2);
    }

    .level-0 {
      background: #1e293b;
    }

    .level-1 {
      background: #166534;
    }

    .level-2 {
      background: #22c55e;
    }

    .level-3 {
      background: #4ade80;
    }

    .level-4 {
      background: #86efac;
    }

    .activity-legend {
      display: flex;
      align-items: center;
      gap: 4px;
      justify-content: flex-end;
      margin-top: 8px;
      font-size: 10px;
      color: #64748b;
    }

    .activity-legend .activity-day {
      width: 10px;
      height: 10px;
    }

    /* Month labels - use same flex layout as grid */
    .activity-months {
      display: flex;
      font-size: 10px;
      color: #64748b;
      margin-bottom: 4px;
      height: 14px;
      position: relative;
    }

    .activity-months span {
      position: absolute;
      white-space: nowrap;
    }

    /* Future days (not yet reached) */
    .activity-day.level-future {
      background: transparent;
      border: 1px dashed #1e293b;
    }

    /* Last commit section */
    .last-commit {
      margin-top: 12px;
      padding: 10px 12px;
      background: #0f172a;
      border-radius: 8px;
      border-left: 3px solid #3b82f6;
    }

    .last-commit-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
    }

    .commit-icon {
      font-size: 12px;
    }

    .commit-time {
      font-size: 11px;
      color: #64748b;
    }

    .commit-message {
      font-size: 13px;
      color: #e2e8f0;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .commit-author {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
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
      dashboardState.gitStatus = null;
      dashboardState.gitBranch = null;
      dashboardState.gitHistory = null;
    },

    onLoad: (ctx) => {
      // Refresh data for new project (no await, loads in background)
      if (isDashboardVisible()) {
        refreshDashboardData();
      }
    },

    onAfterSwitch: (ctx) => {
      // Re-render if visible (no await needed, data loads in background)
      if (isDashboardVisible()) {
        refreshDashboardData();
      }
    }
  });
}
