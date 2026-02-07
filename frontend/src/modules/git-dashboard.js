import { state } from './state.js';
import { registerStateHandler } from './project-switcher.js';
import { showGitDiff } from './diff.js';
import { escapeHtml } from './utils.js';
import { GetGitStatus, GetGitCurrentBranch } from '../../wailsjs/go/main/App';

// Special tab ID for Git History
export const GIT_TAB_ID = 'tab-git';

// Project commits storage
let projectCommits = new Map(); // projectId -> commits[]
let expandedCommits = new Set(); // Set of expanded commit hashes

// Callbacks for backend operations
let gitDashboardCallbacks = {
  getGitHistory: async () => []
};

export function setGitDashboardCallbacks(callbacks) {
  gitDashboardCallbacks = { ...gitDashboardCallbacks, ...callbacks };
}

// Category detection based on file paths
const CATEGORY_RULES = [
  { category: 'frontend', icon: '🎨', patterns: ['frontend/', 'src/', '.tsx', '.jsx', '.css', '.vue', '.svelte', 'components/'] },
  { category: 'backend', icon: '⚙️', patterns: ['backend/', 'internal/', 'server/', '.go', 'api/', 'cmd/'] },
  { category: 'api', icon: '🔌', patterns: ['api/', 'routes/', 'endpoints/', 'handlers/'] },
  { category: 'database', icon: '🗄️', patterns: ['schema.prisma', 'migrations/', '.sql', 'models/', 'prisma/'] },
  { category: 'config', icon: '⚡', patterns: ['Dockerfile', '.yml', '.yaml', '.json', 'ci/', '.github/', 'config/'] },
  { category: 'docs', icon: '📚', patterns: ['.md', 'docs/', 'README'] },
  { category: 'tests', icon: '🧪', patterns: ['test/', 'tests/', '.test.', '.spec.', '__tests__/'] }
];

// Conventional commit prefixes
const CONVENTIONAL_COMMITS = {
  'feat': { icon: '✨', color: '#22c55e' },
  'fix': { icon: '🐛', color: '#ef4444' },
  'docs': { icon: '📚', color: '#3b82f6' },
  'chore': { icon: '🔧', color: '#6b7280' },
  'refactor': { icon: '♻️', color: '#eab308' },
  'test': { icon: '🧪', color: '#a855f7' },
  'style': { icon: '💅', color: '#ec4899' },
  'perf': { icon: '⚡', color: '#f97316' },
  'ci': { icon: '🔄', color: '#06b6d4' },
  'build': { icon: '📦', color: '#8b5cf6' }
};

// Detect categories from commit files
function detectCategories(files) {
  const categories = new Set();

  for (const file of files) {
    for (const rule of CATEGORY_RULES) {
      if (rule.patterns.some(pattern => file.path.toLowerCase().includes(pattern.toLowerCase()))) {
        categories.add(rule);
        break;
      }
    }
  }

  return Array.from(categories).slice(0, 3); // Max 3 categories
}

// Detect conventional commit type from subject
function detectConventionalCommit(subject) {
  const match = subject.match(/^(\w+)(\(.+\))?:\s*/);
  if (match && CONVENTIONAL_COMMITS[match[1].toLowerCase()]) {
    return {
      type: match[1].toLowerCase(),
      ...CONVENTIONAL_COMMITS[match[1].toLowerCase()]
    };
  }
  return null;
}

// Get file status icon and color
function getFileStatusIcon(status) {
  switch (status.toUpperCase()) {
    case 'A': return { icon: '🟢', label: 'A', color: '#22c55e', title: 'Added' };
    case 'M': return { icon: '🟡', label: 'M', color: '#eab308', title: 'Modified' };
    case 'D': return { icon: '🔴', label: 'D', color: '#ef4444', title: 'Deleted' };
    case 'R': return { icon: '🔵', label: 'R', color: '#3b82f6', title: 'Renamed' };
    default: return { icon: '⚪', label: status, color: '#6b7280', title: status };
  }
}

// Get current project's commits
function getCurrentCommits() {
  if (!state.activeProject) return [];
  return projectCommits.get(state.activeProject.id) || [];
}

// Load commit history from backend
export async function loadGitHistory() {
  if (!state.activeProject) return;

  try {
    const [commits, gitStatus, gitBranch] = await Promise.all([
      gitDashboardCallbacks.getGitHistory(state.activeProject.path, 50),
      GetGitStatus(state.activeProject.path).catch(() => null),
      GetGitCurrentBranch(state.activeProject.path).catch(() => null)
    ]);
    if (commits && Array.isArray(commits)) {
      projectCommits.set(state.activeProject.id, commits);
    } else {
      projectCommits.set(state.activeProject.id, []);
    }
    gitActivityState.gitStatus = gitStatus;
    gitActivityState.gitBranch = gitBranch;
  } catch (err) {
    console.error('Failed to load git history:', err);
    projectCommits.set(state.activeProject.id, []);
  }

  renderGitDashboard();
}

// Toggle commit expansion
function toggleCommitExpand(hash) {
  if (expandedCommits.has(hash)) {
    expandedCommits.delete(hash);
  } else {
    expandedCommits.add(hash);
  }
  renderGitDashboard();
}

// Git activity state
let gitActivityState = {
  gitStatus: null,
  gitBranch: null
};

// Build activity data from git history (last 12 weeks)
function buildActivityData(history) {
  if (!history || history.length === 0) return { weeks: [], months: [] };

  const weeksCount = 12;
  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));
  endDate.setHours(23, 59, 59, 999);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (weeksCount * 7) + 1);
  startDate.setHours(0, 0, 0, 0);

  const commitMap = new Map();
  history.forEach(commit => {
    if (commit.date) {
      const key = commit.date.split('T')[0];
      commitMap.set(key, (commitMap.get(key) || 0) + 1);
    }
  });

  const weeks = [];
  const currentDate = new Date(startDate);
  for (let w = 0; w < weeksCount; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const isFuture = currentDate > now;
      week.push({
        date: dateStr,
        count: isFuture ? -1 : (commitMap.get(dateStr) || 0),
        dateObj: new Date(currentDate)
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
    weeks.push(week);
  }

  const months = [];
  let lastMonth = -1;
  weeks.forEach((week, weekIndex) => {
    for (const day of week) {
      const month = day.dateObj.getMonth();
      if (month !== lastMonth) {
        months.push({ weekIndex, label: day.dateObj.toLocaleDateString('en', { month: 'short' }) });
        lastMonth = month;
        break;
      }
    }
  });

  return { weeks, months };
}

function getCommitsThisWeek(history) {
  if (!history) return 0;
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  return history.filter(c => c.date && new Date(c.date) >= startOfWeek).length;
}

function getActivityLevel(count) {
  if (count < 0) return 'future';
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  return 4;
}

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

function renderActivityCard(commits) {
  const activityData = buildActivityData(commits);
  const lastCommit = commits.length > 0 ? commits[0] : null;
  const commitsThisWeek = getCommitsThisWeek(commits);
  const totalCommits = commits.length;
  const gs = gitActivityState.gitStatus;
  const branch = gitActivityState.gitBranch;

  return `
    <div class="git-activity-card">
      <div class="git-activity-header">
        <span>Git Activity</span>
        ${branch ? `<span class="branch-badge">⎇ ${escapeHtml(branch)}</span>` : ''}
      </div>
      ${gs ? `
        <div class="git-stats-row">
          <div class="git-stat">
            <span class="stat-value ${gs.staged > 0 ? 'has-changes' : ''}">${gs.staged}</span>
            <span class="stat-label">Staged</span>
          </div>
          <div class="git-stat">
            <span class="stat-value ${gs.unstaged > 0 ? 'has-changes' : ''}">${gs.unstaged}</span>
            <span class="stat-label">Modified</span>
          </div>
          <div class="git-stat">
            <span class="stat-value ${gs.untracked > 0 ? 'has-changes' : ''}">${gs.untracked}</span>
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
      ` : ''}
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
      ${lastCommit ? `
        <div class="last-commit">
          <div class="last-commit-header">
            <span class="commit-icon">⚡</span>
            <span class="commit-time">${formatRelativeTime(lastCommit.date)}</span>
          </div>
          <div class="commit-msg">${escapeHtml(lastCommit.subject || '')}</div>
          <div class="commit-auth">${escapeHtml(lastCommit.author || '')}</div>
        </div>
      ` : ''}
    </div>
  `;
}

// Handle file click - show diff
async function onFileClick(commit, filePath) {
  // For committed files, we need to show the diff from that commit
  // The existing showGitDiff is for working directory changes
  // We can still use it as a placeholder - it will show current working directory diff
  showGitDiff(filePath);
}

// Render the Git Dashboard content
export function renderGitDashboard() {
  const panel = document.getElementById('gitHistoryPanel');
  if (!panel) return;

  const commits = getCurrentCommits();

  if (commits.length === 0) {
    panel.innerHTML = `
      <div class="git-dashboard-content">
        <div class="git-dashboard-header">
          <h2>Git History</h2>
          <button class="git-refresh-btn" id="refreshGitHistory" title="Refresh">🔄</button>
        </div>
        <div class="git-empty-state">
          <p>No commits found</p>
          <p class="hint">Make sure this is a git repository with commit history</p>
        </div>
      </div>
    `;
    setupGitDashboardListeners();
    return;
  }

  panel.innerHTML = `
    <div class="git-dashboard-content">
      ${renderActivityCard(commits)}
      <div class="git-dashboard-header">
        <h2>Git History</h2>
        <button class="git-refresh-btn" id="refreshGitHistory" title="Refresh">🔄</button>
      </div>
      <div class="git-commits-grid">
        ${commits.map(commit => renderCommitCard(commit)).join('')}
      </div>
    </div>
  `;

  setupGitDashboardListeners();
}

// Render a single commit card
function renderCommitCard(commit) {
  const isExpanded = expandedCommits.has(commit.hash);
  const categories = detectCategories(commit.files || []);
  const conventional = detectConventionalCommit(commit.subject);

  const categoryIcons = categories.map(c =>
    `<span class="commit-category" title="${c.category.charAt(0).toUpperCase() + c.category.slice(1)}">${c.icon}</span>`
  ).join('');

  const conventionalBadge = conventional
    ? `<span class="commit-type" title="Conventional commit: ${conventional.type}" style="background: ${conventional.color}20; color: ${conventional.color};">${conventional.icon} ${conventional.type}</span>`
    : '';

  const truncatedBody = commit.body && commit.body.length > 150 && !isExpanded
    ? commit.body.substring(0, 150) + '...'
    : commit.body;

  return `
    <div class="commit-card ${isExpanded ? 'expanded' : ''}" data-hash="${commit.hash}">
      <div class="commit-header">
        <div class="commit-categories">${categoryIcons}</div>
        ${conventionalBadge}
        <span class="commit-subject">${escapeHtml(commit.subject)}</span>
      </div>

      ${truncatedBody ? `
        <div class="commit-body">${escapeHtml(truncatedBody)}</div>
      ` : ''}

      <div class="commit-meta">
        <span class="commit-author" title="Author: ${escapeHtml(commit.authorEmail)}"><span title="Author">👤</span> ${escapeHtml(commit.author)}</span>
        <span class="commit-date" title="Date: ${commit.date}"><span title="Date">📅</span> ${escapeHtml(commit.relativeDate)}</span>
        <span class="commit-files" title="Files changed"><span title="Files changed">📁</span> ${commit.stats?.filesChanged || 0} files</span>
        <span class="commit-stats" title="Lines added / removed">
          <span class="stat-add" title="Lines added">+${commit.stats?.insertions || 0}</span>
          <span class="stat-del" title="Lines deleted">-${commit.stats?.deletions || 0}</span>
        </span>
      </div>

      ${isExpanded ? renderExpandedContent(commit) : ''}

      <button class="commit-expand-btn" data-hash="${commit.hash}">
        ${isExpanded ? '▲ Collapse' : '▼ Show files'}
      </button>
    </div>
  `;
}

// Render expanded commit content (files list)
function renderExpandedContent(commit) {
  if (!commit.files || commit.files.length === 0) {
    return '<div class="commit-files-list"><p class="no-files">No files changed</p></div>';
  }

  return `
    <div class="commit-files-list">
      <div class="files-header"><span title="Files changed">📄</span> Files Changed:</div>
      ${commit.files.map(file => {
        const statusInfo = getFileStatusIcon(file.status);
        return `
          <div class="commit-file" data-path="${escapeHtml(file.path)}" data-hash="${commit.hash}">
            <span class="file-status" title="${statusInfo.title}" style="color: ${statusInfo.color}">${statusInfo.label}</span>
            <span class="file-path">${escapeHtml(file.path)}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// Setup event listeners for git dashboard
function setupGitDashboardListeners() {
  // Refresh button
  document.getElementById('refreshGitHistory')?.addEventListener('click', () => {
    loadGitHistory();
  });

  // Expand/collapse buttons
  document.querySelectorAll('.commit-expand-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const hash = btn.dataset.hash;
      toggleCommitExpand(hash);
    });
  });

  // File clicks
  document.querySelectorAll('.commit-file').forEach(fileEl => {
    fileEl.addEventListener('click', (e) => {
      const path = fileEl.dataset.path;
      const hash = fileEl.dataset.hash;
      const commits = getCurrentCommits();
      const commit = commits.find(c => c.hash === hash);
      if (commit) {
        onFileClick(commit, path);
      }
    });
  });

  // Card click to expand (on header area)
  document.querySelectorAll('.commit-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't expand if clicking on buttons or files
      if (e.target.closest('.commit-expand-btn') || e.target.closest('.commit-file')) {
        return;
      }
      const hash = card.dataset.hash;
      toggleCommitExpand(hash);
    });
  });
}

// Show/hide git dashboard panel
export function showGitPanel(show) {
  const gitPanel = document.getElementById('gitHistoryPanel');
  const browserInnerContent = document.getElementById('browserInnerContent');
  const dashboardPanel = document.getElementById('dashboardPanel');
  const qaPanel = document.getElementById('qaPanel');
  const structurePanel = document.getElementById('structurePanel');

  if (gitPanel) {
    gitPanel.style.display = show ? 'flex' : 'none';
  }

  if (show) {
    // Hide other panels when showing git
    if (browserInnerContent) browserInnerContent.style.display = 'none';
    if (dashboardPanel) dashboardPanel.style.display = 'none';
    if (qaPanel) qaPanel.style.display = 'none';
    if (structurePanel) structurePanel.style.display = 'none';

    // Load and render content
    loadGitHistory();
  }
}

// Check if Git tab is active
export function isGitTabActive() {
  return state.browser.activeTabId === GIT_TAB_ID;
}

// Create the git dashboard (called on init)
export function createGitDashboard() {
  addGitDashboardStyles();
}

// Add CSS styles for git dashboard
function addGitDashboardStyles() {
  if (document.getElementById('git-dashboard-styles')) return;

  const style = document.createElement('style');
  style.id = 'git-dashboard-styles';
  style.textContent = `
    /* Git History Panel */
    .git-history-panel {
      background: #0f172a;
      color: #e2e8f0;
      overflow-y: auto;
      flex-direction: column;
    }

    .git-dashboard-content {
      padding: 20px;
      max-width: 1600px;
      margin: 0 auto;
      width: 100%;
    }

    /* Git Activity Card */
    .git-activity-card {
      background: linear-gradient(135deg, #1e293b 0%, #1a2332 100%);
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 20px;
    }

    .git-activity-header {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      font-weight: 600;
      color: #f1f5f9;
      margin-bottom: 12px;
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
    }

    .level-0 { background: #1e293b; }
    .level-1 { background: #166534; }
    .level-2 { background: #22c55e; }
    .level-3 { background: #4ade80; }
    .level-4 { background: #86efac; }
    .activity-day.level-future { background: transparent; border: 1px dashed #1e293b; }

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

    .commit-icon { font-size: 12px; }
    .commit-time { font-size: 11px; color: #64748b; }
    .commit-msg { font-size: 13px; color: #e2e8f0; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .commit-auth { font-size: 11px; color: #64748b; margin-top: 2px; }

    .git-dashboard-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid #334155;
    }

    .git-dashboard-header h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #f1f5f9;
    }

    .git-refresh-btn {
      background: #334155;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.15s;
    }

    .git-refresh-btn:hover {
      background: #475569;
    }

    .git-empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #64748b;
    }

    .git-empty-state .hint {
      font-size: 12px;
      margin-top: 8px;
    }

    /* Commits Grid */
    .git-commits-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 16px;
    }

    /* Commit Card */
    .commit-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 16px;
      cursor: pointer;
      transition: border-color 0.15s, box-shadow 0.15s;
    }

    .commit-card:hover {
      border-color: #475569;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    .commit-card.expanded {
      grid-column: span 1;
    }

    .commit-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }

    .commit-categories {
      display: flex;
      gap: 4px;
    }

    .commit-category {
      font-size: 14px;
    }

    .commit-type {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 500;
    }

    .commit-subject {
      flex: 1;
      font-size: 14px;
      font-weight: 500;
      color: #f1f5f9;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .commit-body {
      font-size: 12px;
      color: #94a3b8;
      margin-bottom: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .commit-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 11px;
      color: #64748b;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }

    .commit-stats {
      display: flex;
      gap: 6px;
    }

    .stat-add {
      color: #22c55e;
      font-weight: 500;
    }

    .stat-del {
      color: #ef4444;
      font-weight: 500;
    }

    .commit-expand-btn {
      background: none;
      border: none;
      color: #64748b;
      font-size: 11px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      transition: background 0.15s, color 0.15s;
      width: 100%;
      text-align: center;
    }

    .commit-expand-btn:hover {
      background: #334155;
      color: #94a3b8;
    }

    /* Files List */
    .commit-files-list {
      background: #0f172a;
      border-radius: 8px;
      padding: 12px;
      margin: 12px 0;
      max-height: 300px;
      overflow-y: auto;
    }

    .files-header {
      font-size: 12px;
      font-weight: 500;
      color: #94a3b8;
      margin-bottom: 8px;
    }

    .commit-file {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .commit-file:hover {
      background: #1e293b;
    }

    .file-status {
      font-weight: 600;
      font-size: 11px;
      width: 14px;
      text-align: center;
    }

    .file-path {
      font-size: 12px;
      color: #e2e8f0;
      font-family: 'SF Mono', 'Fira Code', monospace;
    }

    .no-files {
      color: #64748b;
      font-size: 12px;
      text-align: center;
      padding: 12px;
    }

    /* Responsive */
    @media (max-width: 900px) {
      .git-commits-grid {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);
}

// Initialize git dashboard on load
export function initGitDashboard() {
  createGitDashboard();
}

// ============================================
// Project Switcher Handler
// ============================================

/**
 * Initialize git dashboard handler for project switching
 * Call this during app initialization
 */
export function initGitDashboardHandler() {
  registerStateHandler('gitDashboard', {
    priority: 80,

    onBeforeSwitch: async (ctx) => {
      // Clear expanded commits on project switch
      expandedCommits.clear();
    },

    onSave: async (ctx) => {
      // Git history is read-only, nothing to save
    },

    onLoad: async (ctx) => {
      // Load git history if tab is active
      if (isGitTabActive()) {
        await loadGitHistory();
      }
    },

    onAfterSwitch: async (ctx) => {
      // Refresh dashboard after state is fully loaded
      if (isGitTabActive()) {
        setTimeout(() => renderGitDashboard(), 100);
      }
    }
  });
}
