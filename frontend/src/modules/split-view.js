// Split View module - DEPRECATED
// Split view has been removed in favor of iTerm2 integration.
// This module now only contains the UI state handler for project switching.

import { state } from './state.js';
import { registerStateHandler } from './project-switcher.js';

// Callbacks set by main.js
let splitViewCallbacks = {
  saveUIState: () => {}
};

export function setSplitViewCallbacks(callbacks) {
  splitViewCallbacks = { ...splitViewCallbacks, ...callbacks };
}

// Split view disabled - these are no-ops for backward compatibility
export function initSplitView() {
  state.splitView = false;
}

export function toggleSplitView() {
  return false;
}

export function updateSplitRatio() {
  // No-op
}

export function resetSplitViewUI() {
  // No-op
}

export function setupResizer() {
  // No-op - resizer is no longer used
}

// ============================================
// Project Switcher Handler
// ============================================

let onSwitchTab = null;

export function setUIStateCallbacks(callbacks) {
  if (callbacks.switchTab) {
    onSwitchTab = callbacks.switchTab;
  }
}

/**
 * Initialize UI state handler for project switching
 */
export function initUIStateHandler() {
  registerStateHandler('uiState', {
    priority: 90,

    onBeforeSwitch: async () => {
      // Nothing to cleanup
    },

    onSave: async () => {
      // UI state saved via callback
    },

    onLoad: async () => {
      state.splitView = false;

      // Clean up any legacy split view elements
      const resizer = document.getElementById('splitResizer');
      if (resizer) resizer.remove();

      const panelContent = document.querySelector('.panel-content');
      if (panelContent) panelContent.classList.remove('split-view');

      const terminalPanel = document.getElementById('terminalPanel');
      if (terminalPanel) {
        terminalPanel.classList.remove('split-left', 'active');
        terminalPanel.style.display = 'none';
      }

      const browserPanel = document.getElementById('browserPanel');
      if (browserPanel) {
        browserPanel.classList.remove('split-right');
        browserPanel.classList.add('active');
      }
    },

    onAfterSwitch: async (ctx) => {
      const { projectState } = ctx;
      if (onSwitchTab) {
        onSwitchTab(projectState?.activeTab || 'terminal');
      }
    }
  });
}
