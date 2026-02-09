// Teams Dashboard - Monitor Claude Code Agent Teams
import { GetAllTeams, GetTeamHistory, StartTeamsPolling, StopTeamsPolling } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';

export const TEAMS_TAB_ID = 'teams';

let teamsState = {
  teams: {},
  history: [],
  selectedTeam: null,
  showHistory: false,
};

// ============================================
// Init & Events
// ============================================

let teamsPollingActive = false;

export function initTeamsDashboard() {
  // Real-time updates (listener always registered, data only arrives when polling)
  EventsOn('teams-update', (data) => {
    if (data) {
      teamsState.teams = data;
      renderTeamsDashboard();
    }
  });
}

// Called when Teams tab becomes active
export function startTeamsTab() {
  if (!teamsPollingActive) {
    teamsPollingActive = true;
    StartTeamsPolling();
  }
  loadTeams();
}

// Called when Teams tab becomes inactive
export function stopTeamsTab() {
  if (teamsPollingActive) {
    teamsPollingActive = false;
    StopTeamsPolling();
  }
}

async function loadTeams() {
  try {
    const [teams, history] = await Promise.all([
      GetAllTeams(),
      GetTeamHistory(),
    ]);
    teamsState.teams = teams || {};
    teamsState.history = history || [];
    renderTeamsDashboard();
  } catch (e) {
    console.error('Failed to load teams:', e);
  }
}

// ============================================
// Window functions
// ============================================

window.teamsSelectTeam = function(name) {
  teamsState.selectedTeam = name;
  renderTeamsDashboard();
};

window.teamsBack = function() {
  teamsState.selectedTeam = null;
  renderTeamsDashboard();
};

window.teamsToggleHistory = function() {
  teamsState.showHistory = !teamsState.showHistory;
  teamsState.selectedTeam = null;
  renderTeamsDashboard();
};

// ============================================
// Helpers
// ============================================

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function timeAgo(timestamp) {
  if (!timestamp) return '';
  const ms = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  return days + 'd ago';
}

function truncate(str, len) {
  if (!str || str.length <= len) return str || '';
  return str.substring(0, len) + '...';
}

function statusColor(status) {
  if (status === 'completed') return '#22c55e';
  if (status === 'in_progress') return '#3b82f6';
  return '#f59e0b';
}

function statusLabel(status) {
  if (status === 'completed') return 'Done';
  if (status === 'in_progress') return 'Working';
  return 'Pending';
}

function messageTypeIcon(type) {
  if (type === 'task_assignment') return '📋';
  if (type === 'shutdown_request') return '🛑';
  if (type === 'status_update') return '📊';
  return '💬';
}

// ============================================
// Render
// ============================================

export function renderTeamsDashboard() {
  const container = document.getElementById('teamsDashboardContainer');
  if (!container) return;

  if (teamsState.showHistory) {
    renderHistory(container);
  } else if (teamsState.selectedTeam) {
    renderTeamDetail(container);
  } else {
    renderTeamList(container);
  }
}

function renderTeamList(container) {
  const teamNames = Object.keys(teamsState.teams);
  const hasHistory = teamsState.history && teamsState.history.length > 0;

  container.innerHTML = `
    <style>${getStyles()}</style>
    <div class="teams-header">
      <span class="teams-title">Agent Teams</span>
      ${teamNames.length > 0 ? `<span class="teams-badge">${teamNames.length}</span>` : ''}
      <div class="teams-header-actions">
        ${hasHistory ? `<button class="teams-history-btn" onclick="window.teamsToggleHistory()">History</button>` : ''}
        <button class="teams-refresh-btn" onclick="window.teamsSelectTeam(null)">↻</button>
      </div>
    </div>
    <div class="teams-list">
      ${teamNames.length === 0 ? `
        <div class="teams-empty">
          <div class="teams-empty-icon">👥</div>
          <div class="teams-empty-text">No active teams</div>
          <div class="teams-empty-hint">Teams appear here when spawned via Claude Code</div>
        </div>
      ` : teamNames.map(name => {
        const team = teamsState.teams[name];
        const taskStats = getTaskStats(team.tasks);
        const unreadCount = getUnreadCount(team.inboxes);
        return `
          <div class="teams-card" onclick="window.teamsSelectTeam('${escapeHtml(name).replace(/'/g, "\\'")}')">
            <div class="teams-card-header">
              <span class="teams-card-name">${escapeHtml(team.name)}</span>
              ${unreadCount > 0 ? `<span class="teams-unread-badge">${unreadCount}</span>` : ''}
              <span class="teams-card-time">${timeAgo(team.createdAt)}</span>
            </div>
            <div class="teams-card-desc">${escapeHtml(truncate(team.description, 120))}</div>
            <div class="teams-card-meta">
              <span class="teams-meta-members">
                <span class="teams-meta-icon">👤</span> ${team.members ? team.members.length : 0} members
              </span>
              <span class="teams-meta-model">${getModels(team.members)}</span>
            </div>
            ${taskStats.total > 0 ? `
              <div class="teams-task-bar">
                ${taskStats.completed > 0 ? `<div class="teams-bar-segment" style="width:${taskStats.completed/taskStats.total*100}%;background:#22c55e" title="${taskStats.completed} completed"></div>` : ''}
                ${taskStats.inProgress > 0 ? `<div class="teams-bar-segment" style="width:${taskStats.inProgress/taskStats.total*100}%;background:#3b82f6" title="${taskStats.inProgress} in progress"></div>` : ''}
                ${taskStats.pending > 0 ? `<div class="teams-bar-segment" style="width:${taskStats.pending/taskStats.total*100}%;background:#f59e0b" title="${taskStats.pending} pending"></div>` : ''}
              </div>
              <div class="teams-task-summary">${taskStats.completed}/${taskStats.total} tasks done</div>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderTeamDetail(container) {
  const team = teamsState.teams[teamsState.selectedTeam];
  if (!team) {
    teamsState.selectedTeam = null;
    renderTeamList(container);
    return;
  }

  const allMessages = getAllMessages(team.inboxes);

  container.innerHTML = `
    <style>${getStyles()}</style>
    <div class="teams-header">
      <button class="teams-back-btn" onclick="window.teamsBack()">←</button>
      <span class="teams-title">${escapeHtml(team.name)}</span>
      <span class="teams-card-time">${timeAgo(team.createdAt)}</span>
    </div>
    <div class="teams-detail-desc">${escapeHtml(team.description)}</div>

    <div class="teams-section">
      <div class="teams-section-title">Members (${team.members ? team.members.length : 0})</div>
      <div class="teams-members-list">
        ${(team.members || []).map(m => `
          <div class="teams-member-row">
            <span class="teams-member-name">${escapeHtml(m.name)}</span>
            <span class="teams-member-badge">${escapeHtml(m.agentType)}</span>
            <span class="teams-member-model">${escapeHtml(m.model || '')}</span>
            ${m.cwd ? `<span class="teams-member-cwd" title="${escapeHtml(m.cwd)}">${escapeHtml(truncate(m.cwd.replace(/.*\//, ''), 20))}</span>` : ''}
            <span class="teams-member-time">${timeAgo(m.joinedAt)}</span>
          </div>
        `).join('')}
      </div>
    </div>

    ${team.tasks && team.tasks.length > 0 ? `
      <div class="teams-section">
        <div class="teams-section-title">Tasks (${team.tasks.length})</div>
        <div class="teams-tasks-list">
          ${team.tasks.map(t => `
            <div class="teams-task-row">
              <span class="teams-task-status" style="background:${statusColor(t.status)}">${statusLabel(t.status)}</span>
              <span class="teams-task-subject">${escapeHtml(t.subject)}</span>
              ${t.activeForm && t.status === 'in_progress' ? `<span class="teams-task-active">${escapeHtml(t.activeForm)}</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    ${allMessages.length > 0 ? `
      <div class="teams-section">
        <div class="teams-section-title">Messages (${allMessages.length})</div>
        <div class="teams-messages-list">
          ${allMessages.map(m => `
            <div class="teams-message-row ${m.read ? '' : 'unread'}">
              <span class="teams-message-icon">${messageTypeIcon(m.parsedType)}</span>
              <span class="teams-message-from">${escapeHtml(m.from)}</span>
              <span class="teams-message-arrow">→</span>
              <span class="teams-message-to">${escapeHtml(m.to)}</span>
              <span class="teams-message-subject">${escapeHtml(truncate(m.parsedSubject || m.parsedType || 'message', 60))}</span>
              <span class="teams-message-time">${timeAgo(m.timestamp)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

function renderHistory(container) {
  const entries = teamsState.history || [];

  container.innerHTML = `
    <style>${getStyles()}</style>
    <div class="teams-header">
      <button class="teams-back-btn" onclick="window.teamsToggleHistory()">←</button>
      <span class="teams-title">Team History</span>
      <span class="teams-badge">${entries.length}</span>
    </div>
    <div class="teams-list">
      ${entries.length === 0 ? `
        <div class="teams-empty">
          <div class="teams-empty-text">No archived teams yet</div>
        </div>
      ` : entries.map(e => `
        <div class="teams-card teams-card-archived">
          <div class="teams-card-header">
            <span class="teams-card-name">${escapeHtml(e.name)}</span>
            <span class="teams-card-time">archived ${timeAgo(e.archivedAt)}</span>
          </div>
          <div class="teams-card-desc">${escapeHtml(truncate(e.description, 100))}</div>
          <div class="teams-card-meta">
            <span class="teams-meta-members"><span class="teams-meta-icon">👤</span> ${e.memberCount} members</span>
            <span class="teams-meta-members"><span class="teams-meta-icon">📋</span> ${e.taskCount} tasks</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================
// Data helpers
// ============================================

function getTaskStats(tasks) {
  if (!tasks || !tasks.length) return { total: 0, completed: 0, inProgress: 0, pending: 0 };
  let completed = 0, inProgress = 0, pending = 0;
  for (const t of tasks) {
    if (t.status === 'completed') completed++;
    else if (t.status === 'in_progress') inProgress++;
    else pending++;
  }
  return { total: tasks.length, completed, inProgress, pending };
}

function getUnreadCount(inboxes) {
  if (!inboxes) return 0;
  let count = 0;
  for (const msgs of Object.values(inboxes)) {
    if (Array.isArray(msgs)) {
      count += msgs.filter(m => !m.read).length;
    }
  }
  return count;
}

function getModels(members) {
  if (!members || !members.length) return '';
  const models = [...new Set(members.map(m => m.model).filter(Boolean))];
  return models.map(m => `<span class="teams-model-tag">${escapeHtml(m.replace('claude-', ''))}</span>`).join('');
}

function getAllMessages(inboxes) {
  if (!inboxes) return [];
  const all = [];
  for (const [to, msgs] of Object.entries(inboxes)) {
    if (!Array.isArray(msgs)) continue;
    for (const m of msgs) {
      all.push({ ...m, to });
    }
  }
  all.sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    return tb - ta;
  });
  return all;
}

// ============================================
// Styles
// ============================================

function getStyles() {
  return `
    .teams-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-color, #334155);
      flex-shrink: 0;
    }
    .teams-title {
      font-weight: 600;
      font-size: 13px;
      color: var(--text-primary, #cdd6f4);
    }
    .teams-badge {
      background: var(--accent, #3b82f6);
      color: white;
      font-size: 10px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 10px;
    }
    .teams-header-actions {
      margin-left: auto;
      display: flex;
      gap: 4px;
    }
    .teams-history-btn, .teams-refresh-btn {
      background: none;
      border: 1px solid #334155;
      border-radius: 4px;
      color: #94a3b8;
      font-size: 11px;
      padding: 2px 8px;
      cursor: pointer;
    }
    .teams-history-btn:hover, .teams-refresh-btn:hover {
      color: #e2e8f0;
      border-color: #475569;
    }
    .teams-back-btn {
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 16px;
      cursor: pointer;
      padding: 0 4px;
    }
    .teams-back-btn:hover { color: #e2e8f0; }
    .teams-list {
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .teams-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      gap: 8px;
    }
    .teams-empty-icon { font-size: 32px; opacity: 0.4; }
    .teams-empty-text { font-size: 13px; color: #64748b; }
    .teams-empty-hint { font-size: 11px; color: #475569; }
    .teams-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 10px 12px;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .teams-card:hover { border-color: #475569; }
    .teams-card-archived { opacity: 0.6; cursor: default; }
    .teams-card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }
    .teams-card-name {
      font-weight: 600;
      font-size: 13px;
      color: #e2e8f0;
    }
    .teams-unread-badge {
      background: #ef4444;
      color: white;
      font-size: 10px;
      font-weight: 600;
      padding: 0 5px;
      border-radius: 8px;
      min-width: 16px;
      text-align: center;
    }
    .teams-card-time {
      margin-left: auto;
      font-size: 11px;
      color: #64748b;
    }
    .teams-card-desc {
      font-size: 12px;
      color: #94a3b8;
      margin-bottom: 8px;
      line-height: 1.4;
    }
    .teams-card-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 11px;
      color: #64748b;
    }
    .teams-meta-members { display: flex; align-items: center; gap: 4px; }
    .teams-meta-icon { font-size: 12px; }
    .teams-model-tag {
      background: #334155;
      color: #94a3b8;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-family: monospace;
    }
    .teams-task-bar {
      display: flex;
      height: 4px;
      border-radius: 2px;
      overflow: hidden;
      background: #0f172a;
      margin-top: 8px;
    }
    .teams-bar-segment { height: 100%; transition: width 0.3s; }
    .teams-task-summary {
      font-size: 10px;
      color: #64748b;
      margin-top: 4px;
    }
    .teams-detail-desc {
      padding: 8px 12px;
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.5;
      border-bottom: 1px solid #1e293b;
    }
    .teams-section {
      border-bottom: 1px solid #1e293b;
    }
    .teams-section-title {
      padding: 8px 12px 4px;
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .teams-members-list, .teams-tasks-list, .teams-messages-list {
      padding: 4px 8px 8px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .teams-member-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 6px;
      border-radius: 4px;
      font-size: 12px;
    }
    .teams-member-row:hover { background: #1e293b; }
    .teams-member-name {
      font-weight: 500;
      color: #e2e8f0;
      min-width: 100px;
    }
    .teams-member-badge {
      background: #334155;
      color: #94a3b8;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
    }
    .teams-member-model {
      color: #64748b;
      font-size: 10px;
      font-family: monospace;
    }
    .teams-member-cwd {
      color: #475569;
      font-size: 10px;
      font-family: monospace;
    }
    .teams-member-time {
      margin-left: auto;
      color: #475569;
      font-size: 10px;
    }
    .teams-task-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 6px;
      border-radius: 4px;
      font-size: 12px;
    }
    .teams-task-row:hover { background: #1e293b; }
    .teams-task-status {
      color: white;
      font-size: 10px;
      font-weight: 500;
      padding: 1px 6px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .teams-task-subject {
      color: #e2e8f0;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .teams-task-active {
      color: #64748b;
      font-size: 11px;
      font-style: italic;
    }
    .teams-message-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 6px;
      border-radius: 4px;
      font-size: 11px;
      color: #94a3b8;
    }
    .teams-message-row:hover { background: #1e293b; }
    .teams-message-row.unread { background: rgba(59, 130, 246, 0.05); }
    .teams-message-icon { font-size: 12px; }
    .teams-message-from { color: #e2e8f0; font-weight: 500; }
    .teams-message-arrow { color: #475569; font-size: 10px; }
    .teams-message-to { color: #94a3b8; }
    .teams-message-subject {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #64748b;
    }
    .teams-message-time {
      flex-shrink: 0;
      color: #475569;
      font-size: 10px;
    }
  `;
}
