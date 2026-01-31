// Split View module - terminal + browser split

import { state, getTerminals } from './state.js';
import { registerStateHandler } from './project-switcher.js';
import { fitWithScrollPreservation } from './terminal-utils.js';

// Callbacks set by main.js
let splitViewCallbacks = {
  saveUIState: () => {}
};

export function setSplitViewCallbacks(callbacks) {
  splitViewCallbacks = { ...splitViewCallbacks, ...callbacks };
}

// Initialize split view (always active)
// Respects browser.minimized state - does not reset it
export function initSplitView() {
  state.splitView = true;

  const panelContent = document.querySelector('.panel-content');
  const terminalPanel = document.getElementById('terminalPanel');
  const browserPanel = document.getElementById('browserPanel');
  const dockerPanel = document.getElementById('dockerPanel');
  const panelTabs = document.querySelectorAll('.panel-tab');

  panelContent.classList.add('split-view');
  terminalPanel.classList.add('active', 'split-left');
  browserPanel.classList.add('active', 'split-right');
  if (dockerPanel) dockerPanel.classList.remove('active');

  if (!document.getElementById('splitResizer')) {
    const resizer = document.createElement('div');
    resizer.id = 'splitResizer';
    resizer.className = 'split-resizer';
    resizer.innerHTML = '<div class="resizer-handle"></div>';
    terminalPanel.after(resizer);
    setupResizer(resizer);
  }

  // Respect browser panel minimized state (global, not per-project)
  const resizer = document.getElementById('splitResizer');
  if (state.browser.minimized) {
    browserPanel.classList.add('minimized');
    terminalPanel.style.flex = '1 1 100%';
    browserPanel.style.flex = '0 0 36px';
    if (resizer) resizer.style.display = 'none';
  } else {
    browserPanel.classList.remove('minimized');
    if (resizer) resizer.style.display = 'flex';
    updateSplitRatio();
  }

  panelTabs.forEach(tab => {
    if (tab.dataset.tab !== 'docker') {
      tab.classList.add('in-split-mode');
    }
  });

  if (state.activeTerminalId) {
    const termData = getTerminals().get(state.activeTerminalId);
    if (termData) {
      setTimeout(() => fitWithScrollPreservation(termData.terminal, termData.fitAddon), 100);
    }
  }
}

// Toggle split view mode (kept for compatibility, but always returns true)
export function toggleSplitView(skipSave = false) {
  // Split view is always active now, just re-initialize
  initSplitView();
  if (!skipSave) splitViewCallbacks.saveUIState();
  return true;
}

// Update split ratio between panels
export function updateSplitRatio() {
  const terminalPanel = document.getElementById('terminalPanel');
  const browserPanel = document.getElementById('browserPanel');
  const resizer = document.getElementById('splitResizer');

  // Don't update if browser panel is minimized - keep it at 36px
  if (state.browser.minimized) {
    if (terminalPanel) terminalPanel.style.flex = '1 1 100%';
    if (browserPanel) browserPanel.style.flex = '0 0 36px';
    if (resizer) resizer.style.display = 'none';
    return;
  }

  if (terminalPanel && browserPanel && state.splitView) {
    terminalPanel.style.flex = `0 0 ${state.splitRatio}%`;
    browserPanel.style.flex = `0 0 ${100 - state.splitRatio}%`;
    if (resizer) resizer.style.display = 'flex';
  }
}

// Reset split view UI (re-initialize it since it's always active)
export function resetSplitViewUI() {
  // Just re-initialize - split view is always on
  initSplitView();
}

// Setup resizer drag behavior
export function setupResizer(resizer) {
  let isResizing = false;
  let startX = 0;
  let startRatio = 50;

  const onMouseDown = (e) => {
    isResizing = true;
    startX = e.clientX;
    startRatio = state.splitRatio;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const overlay = document.createElement('div');
    overlay.id = 'resizeOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;cursor:col-resize;';
    document.body.appendChild(overlay);
  };

  const onMouseMove = (e) => {
    if (!isResizing) return;

    const panelContent = document.querySelector('.panel-content');
    const contentRect = panelContent.getBoundingClientRect();
    const deltaX = e.clientX - startX;
    const deltaPercent = (deltaX / contentRect.width) * 100;

    state.splitRatio = Math.min(80, Math.max(20, startRatio + deltaPercent));
    updateSplitRatio();
    // Don't fit() during drag - causes terminal to reload/jump
  };

  const onMouseUp = () => {
    if (!isResizing) return;
    isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    const overlay = document.getElementById('resizeOverlay');
    if (overlay) overlay.remove();

    // ResizeObserver will handle terminal fit() automatically
    splitViewCallbacks.saveUIState();
  };

  resizer.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// ============================================
// Project Switcher Handler
// ============================================

// Reference to switchTab function from main.js
let onSwitchTab = null;

/**
 * Set the switchTab callback
 * @param {function} callback - switchTab function from main.js
 */
export function setUIStateCallbacks(callbacks) {
  if (callbacks.switchTab) {
    onSwitchTab = callbacks.switchTab;
  }
}

/**
 * Initialize UI state handler for project switching
 * Call this during app initialization
 */
export function initUIStateHandler() {
  registerStateHandler('uiState', {
    priority: 90,

    onBeforeSwitch: async (ctx) => {
      // Nothing to cleanup for UI state
    },

    onSave: async (ctx) => {
      // UI state is saved via saveUIState callback on each change
    },

    onLoad: async (ctx) => {
      const { projectState } = ctx;

      // Restore UI state - split view is always active
      state.splitRatio = projectState?.splitRatio || 50;
      state.splitView = true; // Always keep split view on
      initSplitView(); // Re-initialize to ensure split view is active
    },

    onAfterSwitch: async (ctx) => {
      const { projectState } = ctx;

      // Restore active tab state (terminal, browser, diff, docker)
      if (onSwitchTab) {
        onSwitchTab(projectState?.activeTab || 'terminal');
      }
    }
  });
}
