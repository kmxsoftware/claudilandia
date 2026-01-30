import { state } from './state.js';
import {
  IsGitRepo,
  GetGitChangedFiles,
  GetGitCurrentBranch
} from '../../wailsjs/go/main/App';
import { registerStateHandler } from './project-switcher.js';

// Callback for showing diff
let onShowGitDiff = null;

export function setGitCallbacks(callbacks) {
  onShowGitDiff = callbacks.showGitDiff;
}

export function setupGitSection() {
  const header = document.getElementById('gitHeader');
  const refreshBtn = document.getElementById('refreshGit');
  const refreshDiffBtn = document.getElementById('refreshDiff');

  if (header) {
    header.addEventListener('click', (e) => {
      if (e.target.id === 'refreshGit' || e.target.closest('#refreshGit')) return;
      toggleGitSection();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      refreshGitStatus();
    });
  }

  if (refreshDiffBtn) {
    refreshDiffBtn.addEventListener('click', () => {
      if (state.git.currentDiffFile && onShowGitDiff) {
        onShowGitDiff(state.git.currentDiffFile);
      }
    });
  }
}

export function toggleGitSection() {
  state.git.expanded = !state.git.expanded;
  const content = document.getElementById('gitContent');
  const toggle = document.querySelector('.git-toggle');

  if (content && toggle) {
    if (state.git.expanded) {
      content.classList.remove('collapsed');
      toggle.textContent = '▼';
      if (state.activeProject) {
        refreshGitStatus();
      }
    } else {
      content.classList.add('collapsed');
      toggle.textContent = '▶';
    }
  }
}

export async function refreshGitStatus() {
  if (!state.activeProject) {
    state.git.isRepo = false;
    state.git.changedFiles = [];
    state.git.branch = '';
    renderGitFileList();
    return;
  }

  const path = state.activeProject.path;

  try {
    state.git.isRepo = await IsGitRepo(path);

    if (state.git.isRepo) {
      state.git.branch = await GetGitCurrentBranch(path);
      state.git.changedFiles = await GetGitChangedFiles(path) || [];
    } else {
      state.git.branch = '';
      state.git.changedFiles = [];
    }
  } catch (err) {
    console.error('Failed to get git status:', err);
    state.git.isRepo = false;
    state.git.changedFiles = [];
    state.git.branch = '';
  }

  renderGitFileList();
  updateGitDisplay();
}

export function updateGitDisplay() {
  const statsEl = document.getElementById('gitStats');
  const branchBar = document.getElementById('gitBranchBar');

  if (!state.git.isRepo) {
    if (statsEl) statsEl.innerHTML = '<span class="git-no-repo-badge">No repo</span>';
    if (branchBar) branchBar.innerHTML = '';
    return;
  }

  const staged = state.git.changedFiles.filter(f => f.staged).length;
  const modified = state.git.changedFiles.filter(f => !f.staged && f.status !== '?').length;
  const untracked = state.git.changedFiles.filter(f => f.status === '?').length;
  const total = state.git.changedFiles.length;

  if (statsEl) {
    if (total === 0) {
      statsEl.innerHTML = '<span class="git-clean-badge">✓</span>';
    } else {
      let badges = '';
      if (staged > 0) badges += `<span class="git-badge staged">${staged}</span>`;
      if (modified > 0) badges += `<span class="git-badge modified">${modified}</span>`;
      if (untracked > 0) badges += `<span class="git-badge untracked">${untracked}</span>`;
      statsEl.innerHTML = badges;
    }
  }

  if (branchBar) {
    if (state.git.branch) {
      branchBar.innerHTML = `<span class="git-branch-icon">⎇</span> ${state.git.branch}`;
    } else {
      branchBar.innerHTML = '';
    }
  }
}

export function renderGitFileList() {
  const container = document.getElementById('gitFileList');
  if (!container) return;

  if (!state.git.isRepo) {
    container.innerHTML = '<p class="git-no-repo">Not a git repository</p>';
    return;
  }

  if (state.git.changedFiles.length === 0) {
    container.innerHTML = '<p class="git-no-changes">No changes</p>';
    return;
  }

  const stagedFiles = state.git.changedFiles.filter(f => f.staged);
  const unstagedFiles = state.git.changedFiles.filter(f => !f.staged && f.status !== '?');
  const untrackedFiles = state.git.changedFiles.filter(f => f.status === '?');

  let html = '';

  if (stagedFiles.length > 0) {
    html += '<div class="git-file-group"><div class="git-group-header">Staged Changes</div>';
    html += stagedFiles.map(f => renderGitFileItem(f)).join('');
    html += '</div>';
  }

  if (unstagedFiles.length > 0) {
    html += '<div class="git-file-group"><div class="git-group-header">Changes</div>';
    html += unstagedFiles.map(f => renderGitFileItem(f)).join('');
    html += '</div>';
  }

  if (untrackedFiles.length > 0) {
    html += '<div class="git-file-group"><div class="git-group-header">Untracked</div>';
    html += untrackedFiles.map(f => renderGitFileItem(f)).join('');
    html += '</div>';
  }

  container.innerHTML = html;

  container.querySelectorAll('.git-file-item').forEach(item => {
    item.addEventListener('click', () => {
      if (onShowGitDiff) {
        onShowGitDiff(item.dataset.path);
      }
    });
  });
}

function renderGitFileItem(file) {
  const statusIcon = getStatusIcon(file.status);
  const fileName = file.path.split('/').pop();
  const dirPath = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) + '/' : '';

  return `
    <div class="git-file-item" data-path="${file.path}" title="${file.path}">
      <span class="git-status ${getStatusClass(file.status)}">${statusIcon}</span>
      <span class="git-file-name">${fileName}</span>
      <span class="git-file-dir">${dirPath}</span>
    </div>
  `;
}

function getStatusIcon(status) {
  switch (status) {
    case 'M': return 'M';
    case 'A': return 'A';
    case 'D': return 'D';
    case 'R': return 'R';
    case '?': return 'U';
    default: return status;
  }
}

function getStatusClass(status) {
  switch (status) {
    case 'M': return 'modified';
    case 'A': return 'added';
    case 'D': return 'deleted';
    case 'R': return 'renamed';
    case '?': return 'untracked';
    default: return '';
  }
}

// ============================================
// Project Switcher Handler
// ============================================

/**
 * Initialize git handler for project switching
 * Call this during app initialization
 */
export function initGitHandler() {
  registerStateHandler('git', {
    priority: 100,

    onBeforeSwitch: async (ctx) => {
      // Nothing to cleanup for git
    },

    onSave: async (ctx) => {
      // Git status is fetched fresh each time
    },

    onLoad: async (ctx) => {
      // Git status will be refreshed in onAfterSwitch
    },

    onAfterSwitch: async (ctx) => {
      // Always refresh git status after project switch
      await refreshGitStatus();
    }
  });
}
