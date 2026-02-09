// Keyboard shortcuts module - global hotkeys for project/tab navigation + command input

import { state } from './state.js';
import { DASHBOARD_TAB_ID } from './todo-dashboard.js';
import { GIT_TAB_ID } from './git-dashboard.js';
import { QA_TAB_ID } from './test-dashboard.js';
import { STRUCTURE_TAB_ID } from './structure-panel.jsx';
import { DOCKER_TAB_ID, REMOTE_TAB_ID, switchToDashboardTab, switchToGitTab, switchToQATab, switchToStructureTabLocal, switchToDockerTab, switchToRemoteTab } from './browser.js';
import { togglePomodoro } from './pomodoro.js';

// Ordered tab IDs and their switch functions
const TAB_ORDER = [
  { id: DASHBOARD_TAB_ID, switch: switchToDashboardTab },
  { id: GIT_TAB_ID, switch: switchToGitTab },
  { id: QA_TAB_ID, switch: switchToQATab },
  { id: STRUCTURE_TAB_ID, switch: switchToStructureTabLocal },
  { id: DOCKER_TAB_ID, switch: switchToDockerTab },
  { id: REMOTE_TAB_ID, switch: switchToRemoteTab },
];

let lastEscTime = 0;

// Block shortcuts in editable fields (except command input)
function shouldBlock(el) {
  if (!el) return false;
  if (el.id === 'itermCommandInput') return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if (el.isContentEditable) return true;
  return false;
}

function handleKeydown(e) {
  const isMeta = e.metaKey; // Cmd on macOS

  // Cmd+key shortcuts for command input (work from anywhere)
  if (isMeta && !e.altKey) {
    const key = e.key;

    // Cmd+ArrowDown -> send 'down' key to iTerm
    if (key === 'ArrowDown') {
      e.preventDefault();
      window.itermSendKey?.('down');
      return;
    }

    // Cmd+ArrowUp -> send 'up' key to iTerm
    if (key === 'ArrowUp') {
      e.preventDefault();
      window.itermSendKey?.('up');
      return;
    }

    // Cmd+Shift+Tab -> send 'shift-tab' to iTerm
    if (e.shiftKey && key === 'Tab') {
      e.preventDefault();
      window.itermSendKey?.('shift-tab');
      return;
    }

    // Cmd+Enter -> send 'enter' to iTerm
    if (key === 'Enter') {
      e.preventDefault();
      window.itermSendKey?.('enter');
      return;
    }

    // Cmd+R -> toggle voice input
    if (!e.shiftKey && key === 'r') {
      e.preventDefault();
      window.itermToggleVoice?.();
      return;
    }

    // Cmd+P -> toggle pomodoro timer
    if (!e.shiftKey && key === 'p') {
      e.preventDefault();
      togglePomodoro();
      return;
    }

    // Cmd+K -> toggle shortcuts modal
    if (!e.shiftKey && key === 'k') {
      e.preventDefault();
      window.showShortcutsModal?.();
      return;
    }

    // Cmd+1..9 -> switch to project by display order (terminals first)
    if (!e.shiftKey && key >= '1' && key <= '9') {
      const idx = parseInt(key) - 1;
      const order = window._projectDisplayOrder;
      if (order && idx < order.length) {
        e.preventDefault();
        window.itermSelectProject?.(order[idx]);
      }
      return;
    }

    return;
  }

  // ESC -> send 'esc' to iTerm, double-ESC clears command input
  if (e.key === 'Escape' && !e.shiftKey && !e.ctrlKey && !isMeta && !e.altKey) {
    if (!shouldBlock(e.target)) {
      e.preventDefault();
      const now = Date.now();
      if (lastEscTime && now - lastEscTime < 400) {
        const input = document.getElementById('itermCommandInput');
        if (input) input.value = '';
        lastEscTime = 0;
      } else {
        lastEscTime = now;
      }
      window.itermSendKey?.('esc');
      return;
    }
  }

  // Shift+Tab -> send 'shift-tab' to iTerm
  if (e.key === 'Tab' && e.shiftKey && !e.ctrlKey && !isMeta && !e.altKey) {
    if (!shouldBlock(e.target)) {
      e.preventDefault();
      window.itermSendKey?.('shift-tab');
      return;
    }
  }

  // Shift+Arrow shortcuts for project/tab navigation
  if (!e.shiftKey || e.ctrlKey || isMeta || e.altKey) return;
  if (shouldBlock(e.target)) return;

  const key = e.key;

  // Project switching: Shift + ArrowUp / ArrowDown
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    e.preventDefault();
    switchProject(key === 'ArrowUp' ? -1 : 1);
    return;
  }

  // Tab switching: Shift + ArrowLeft / ArrowRight
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    e.preventDefault();
    switchTab(key === 'ArrowLeft' ? -1 : 1);
    return;
  }
}

function switchProject(direction) {
  const projects = state.projects;
  if (!projects || projects.length === 0) return;

  const currentName = state.activeProject?.name;
  let currentIndex = projects.findIndex(p => p.name === currentName);
  if (currentIndex === -1) currentIndex = 0;

  let nextIndex = currentIndex + direction;
  if (nextIndex < 0) nextIndex = projects.length - 1;
  if (nextIndex >= projects.length) nextIndex = 0;

  const nextProject = projects[nextIndex];
  if (nextProject && window.itermSelectProject) {
    window.itermSelectProject(nextProject.name);
  }
}

function switchTab(direction) {
  const currentTabId = state.browser.activeTabId;
  let currentIndex = TAB_ORDER.findIndex(t => t.id === currentTabId);
  if (currentIndex === -1) currentIndex = 0;

  let nextIndex = currentIndex + direction;
  if (nextIndex < 0) nextIndex = TAB_ORDER.length - 1;
  if (nextIndex >= TAB_ORDER.length) nextIndex = 0;

  TAB_ORDER[nextIndex].switch();
}

window.showShortcutsModal = function() {
  const modal = document.getElementById('shortcutsModal');
  if (!modal) return;
  modal.classList.toggle('hidden');
};

export function initKeyboardShortcuts() {
  document.addEventListener('keydown', handleKeydown);

  // Close shortcuts modal on outside click
  document.addEventListener('click', (e) => {
    const modal = document.getElementById('shortcutsModal');
    if (modal && e.target === modal) {
      modal.classList.add('hidden');
    }
  });
}
