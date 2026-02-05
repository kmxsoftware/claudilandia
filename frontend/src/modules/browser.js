// Browser module - panel tabs (Dashboard, Git, QA, Structure, Remote) and external browser

import { state } from './state.js';
import { createModuleLogger } from './logger.js';
import { normalizeUrl } from './utils.js';
import { QA_TAB_ID, showQAPanel, updateTestDashboard } from './test-dashboard.js';
import { DASHBOARD_TAB_ID, showDashboardPanel } from './todo-dashboard.js';
import { renderTerminalDashboard, showTerminalDashboard } from './terminal-dashboard.js';
import { STRUCTURE_TAB_ID, showStructurePanel, switchToStructureTab } from './structure-panel.jsx';
import { GIT_TAB_ID, showGitPanel, loadGitHistory } from './git-dashboard.js';
import { registerStateHandler } from './project-switcher.js';
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime';
import { showRemoteAccessPanel, hideRemoteAccessPanel } from './remote-access.js';

// Remote Access tab ID
export const REMOTE_TAB_ID = 'remote-tab';

const logger = createModuleLogger('Browser');

// Callbacks set by main.js
let browserCallbacks = {
  saveBrowserState: () => {}
};

export function setBrowserCallbacks(callbacks) {
  browserCallbacks = { ...browserCallbacks, ...callbacks };
}

// ============================================
// Panel Tab Management (Dashboard, Git, QA, Structure)
// ============================================

// Initialize browser tabs - just set default to Dashboard
export function initBrowserTabs() {
  // Default to Dashboard tab
  if (!state.browser.activeTabId) {
    state.browser.activeTabId = DASHBOARD_TAB_ID;
  }
  // Show Dashboard panel if it's active
  if (state.browser.activeTabId === DASHBOARD_TAB_ID) {
    showDashboardPanel(true);
  }
  renderBrowserTabs();
}

// Render browser tabs bar - Dashboard, Git, QA, Structure, Remote
export function renderBrowserTabs() {
  const tabsBar = document.getElementById('browserTabsBar');
  if (!tabsBar) return;

  const isDashboardActive = state.browser.activeTabId === DASHBOARD_TAB_ID;
  const isGitActive = state.browser.activeTabId === GIT_TAB_ID;
  const isQAActive = state.browser.activeTabId === QA_TAB_ID;
  const isStructureActive = state.browser.activeTabId === STRUCTURE_TAB_ID;
  const isRemoteActive = state.browser.activeTabId === REMOTE_TAB_ID;

  tabsBar.innerHTML = `
    <div class="browser-tabs-container">
      <div class="browser-tab dashboard-tab ${isDashboardActive ? 'active' : ''}" data-tab-id="${DASHBOARD_TAB_ID}">
        <span class="tab-icon">✅</span>
        <span class="tab-title">Dashboard</span>
      </div>
      <div class="browser-tab git-tab ${isGitActive ? 'active' : ''}" data-tab-id="${GIT_TAB_ID}">
        <span class="tab-icon">🔀</span>
        <span class="tab-title">Git</span>
      </div>
      <div class="browser-tab qa-tab ${isQAActive ? 'active' : ''}" data-tab-id="${QA_TAB_ID}">
        <span class="tab-icon">📊</span>
        <span class="tab-title">QA</span>
      </div>
      <div class="browser-tab structure-tab ${isStructureActive ? 'active' : ''}" data-tab-id="${STRUCTURE_TAB_ID}">
        <span class="tab-icon">🗂️</span>
        <span class="tab-title">Structure</span>
      </div>
      <div class="browser-tab remote-tab ${isRemoteActive ? 'active' : ''}" data-tab-id="${REMOTE_TAB_ID}">
        <span class="tab-icon">📱</span>
        <span class="tab-title">Remote</span>
      </div>
    </div>
  `;

  // Setup event listeners
  tabsBar.querySelectorAll('.browser-tab').forEach(tabEl => {
    tabEl.addEventListener('click', () => {
      const tabId = tabEl.dataset.tabId;
      if (tabId === DASHBOARD_TAB_ID) {
        switchToDashboardTab();
      } else if (tabId === GIT_TAB_ID) {
        switchToGitTab();
      } else if (tabId === QA_TAB_ID) {
        switchToQATab();
      } else if (tabId === STRUCTURE_TAB_ID) {
        switchToStructureTabLocal();
      } else if (tabId === REMOTE_TAB_ID) {
        switchToRemoteTab();
      }
    });
  });
}

// Switch to the Dashboard tab (Terminal Dashboard)
export function switchToDashboardTab() {
  state.browser.activeTabId = DASHBOARD_TAB_ID;

  // Hide other panels
  showGitPanel(false);
  showQAPanel(false);
  showStructurePanel(false);
  showRemotePanel(false);
  hideRemoteAccessPanel();

  // Show dashboard panel and render terminal dashboard
  showDashboardPanel(true);
  showTerminalDashboard();
  renderTerminalDashboard();

  // Update tabs UI
  renderBrowserTabs();
  updateBrowserStatusBar();
}

// Switch to the Git tab (History)
export function switchToGitTab() {
  state.browser.activeTabId = GIT_TAB_ID;

  // Hide other panels
  showDashboardPanel(false);
  showQAPanel(false);
  showStructurePanel(false);
  showRemotePanel(false);
  hideRemoteAccessPanel();

  // Show git panel and load content
  showGitPanel(true);

  // Update tabs UI
  renderBrowserTabs();
  updateBrowserStatusBar();
}

// Switch to the QA tab (Tests)
export function switchToQATab() {
  state.browser.activeTabId = QA_TAB_ID;

  // Hide other panels
  showDashboardPanel(false);
  showGitPanel(false);
  showStructurePanel(false);
  showRemotePanel(false);
  hideRemoteAccessPanel();

  // Show QA panel and render content
  showQAPanel(true);
  updateTestDashboard();

  // Update tabs UI
  renderBrowserTabs();
  updateBrowserStatusBar();
}

// Switch to the Structure tab (local function for browser module)
function switchToStructureTabLocal() {
  state.browser.activeTabId = STRUCTURE_TAB_ID;

  // Hide other panels
  showDashboardPanel(false);
  showGitPanel(false);
  showQAPanel(false);
  showRemotePanel(false);
  hideRemoteAccessPanel();

  // Show structure panel
  switchToStructureTab();

  // Update tabs UI
  renderBrowserTabs();
  updateBrowserStatusBar();
}

// Switch to the Remote tab (Remote Access from iPhone)
export function switchToRemoteTab() {
  state.browser.activeTabId = REMOTE_TAB_ID;

  // Hide other panels
  showDashboardPanel(false);
  showGitPanel(false);
  showQAPanel(false);
  showStructurePanel(false);

  // Show Remote panel and render content
  showRemotePanel(true);
  showRemoteAccessPanel();

  // Update tabs UI
  renderBrowserTabs();
  updateBrowserStatusBar();
}

// Show/hide Remote Access panel
export function showRemotePanel(show) {
  const panel = document.getElementById('remoteAccessPanel');
  if (panel) {
    panel.style.display = show ? 'block' : 'none';
  }
}

// Load browser tabs from project state - just restore the active tab
export function loadBrowserTabs(tabs, activeTabId) {
  // Always default to Dashboard
  state.browser.activeTabId = activeTabId || DASHBOARD_TAB_ID;

  // Switch to the appropriate panel
  if (state.browser.activeTabId === QA_TAB_ID) {
    switchToQATab();
  } else if (state.browser.activeTabId === GIT_TAB_ID) {
    switchToGitTab();
  } else if (state.browser.activeTabId === STRUCTURE_TAB_ID) {
    switchToStructureTabLocal();
  } else if (state.browser.activeTabId === REMOTE_TAB_ID) {
    switchToRemoteTab();
  } else {
    switchToDashboardTab();
  }
}

// ============================================
// External Browser
// ============================================

// Open URL in external browser (system browser or Responsively)
export function openInExternalBrowser(url) {
  if (!url) return;

  // Normalize URL
  const fullUrl = normalizeUrl(url);
  if (!fullUrl) {
    logger.warn('Invalid URL:', url);
    return;
  }

  logger.info('Opening in external browser:', fullUrl);
  BrowserOpenURL(fullUrl);
}

// ============================================
// Browser Panel Minimize/Expand
// ============================================

// Tab icons for status bar
const BROWSER_TAB_ICONS = {
  [DASHBOARD_TAB_ID]: '✅',
  [GIT_TAB_ID]: '🔀',
  [QA_TAB_ID]: '📊',
  [STRUCTURE_TAB_ID]: '🗂️',
  [REMOTE_TAB_ID]: '📱'
};

const BROWSER_TAB_LABELS = {
  [DASHBOARD_TAB_ID]: 'Dashboard',
  [GIT_TAB_ID]: 'Git',
  [QA_TAB_ID]: 'QA',
  [STRUCTURE_TAB_ID]: 'Structure',
  [REMOTE_TAB_ID]: 'Remote'
};

function updateBrowserStatusBar() {
  const iconEl = document.getElementById('browserStatusBarIcon');
  const labelEl = document.getElementById('browserStatusBarLabel');
  const activeTabId = state.browser.activeTabId;

  if (iconEl && labelEl) {
    iconEl.textContent = BROWSER_TAB_ICONS[activeTabId] || '📊';
    labelEl.textContent = BROWSER_TAB_LABELS[activeTabId] || 'Dashboard';
  }
}

// ============================================
// UI State Callbacks (moved from split-view.js)
// ============================================

let onSwitchTab = null;

export function setUIStateCallbacks(callbacks) {
  if (callbacks.switchTab) {
    onSwitchTab = callbacks.switchTab;
  }
}

// ============================================
// Project Switcher Handler
// ============================================

/**
 * Initialize browser handler for project switching
 * Call this during app initialization
 */
export function initBrowserHandler() {
  registerStateHandler('browser', {
    priority: 50,

    onBeforeSwitch: async (ctx) => {
      // Nothing to cleanup - panels are stateless
    },

    onSave: async (ctx) => {
      // Save active tab ID for this project
    },

    onLoad: async (ctx) => {
      const { projectState } = ctx;
      if (!projectState) return;

      // Ensure browser panel is active (no split view)
      const browserPanel = document.getElementById('browserPanel');
      if (browserPanel) {
        browserPanel.classList.add('active');
      }

      // Restore active tab
      const activeTabId = projectState.browser?.activeTabId || DASHBOARD_TAB_ID;
      loadBrowserTabs(null, activeTabId);
    },

    onAfterSwitch: async (ctx) => {
      // Call switchTab callback to update UI state
      const { projectState } = ctx;
      if (onSwitchTab) {
        onSwitchTab(projectState?.activeTab || 'browser');
      }
    }
  });
}
