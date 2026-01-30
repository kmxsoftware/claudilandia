import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { state, getTerminals } from './state.js';
import { createModuleLogger } from './logger.js';
import { textToBase64 } from './utils.js';
import { removeHistoryBuffer } from './terminal-history.js';

const logger = createModuleLogger('Terminal');
import {
  CreateTerminal as CreateTerminalBackend,
  WriteTerminal,
  ResizeTerminal,
  CloseTerminal,
  SetActiveTerminal
} from '../../wailsjs/go/main/App';
import { OnFileDrop, OnFileDropOff } from '../../wailsjs/runtime/runtime';
import { registerStateHandler } from './project-switcher.js';

// Callbacks that will be set by main.js
let onSwitchTab = null;
let onUpdateClaudeStatusUI = null;
let onTerminalActivated = null;

export function setTerminalCallbacks(callbacks) {
  onSwitchTab = callbacks.switchTab;
  onUpdateClaudeStatusUI = callbacks.updateClaudeStatusUI;
  onTerminalActivated = callbacks.onTerminalActivated;
}

// Setup global file drop handler for terminal
let fileDropInitialized = false;

function initGlobalFileDrop() {
  if (fileDropInitialized) return;
  fileDropInitialized = true;

  logger.debug('Initializing global file drop handler');

  OnFileDrop((x, y, paths) => {
    logger.debug('File drop received', { x, y, paths });

    // Remove drag-over class from all wrappers
    document.querySelectorAll('.terminal-wrapper.drag-over').forEach(w => {
      w.classList.remove('drag-over');
    });

    // Check if drop is on active terminal
    if (!state.activeTerminalId) {
      logger.debug('File drop: No active terminal');
      return;
    }

    const terminals = getTerminals();
    const termData = terminals.get(state.activeTerminalId);
    if (!termData) {
      logger.debug('File drop: Terminal data not found');
      return;
    }

    // Insert file paths into terminal
    if (paths && paths.length > 0) {
      // Escape spaces in paths and join with space
      const escapedPaths = paths.map(p => {
        // If path contains spaces, wrap in quotes
        if (p.includes(' ')) {
          return `"${p}"`;
        }
        return p;
      }).join(' ');

      logger.debug('File drop: Writing to terminal', { escapedPaths });

      // Write paths to terminal
      WriteTerminal(state.activeTerminalId, textToBase64(escapedPaths));
    }
  }, false); // useDropTarget = false to receive all drops
}

// Setup drag & drop visual feedback for terminal wrapper
function setupTerminalDragDrop(wrapper, terminal, id) {
  // Initialize global file drop handler if not already done
  initGlobalFileDrop();

  // Set Wails drop target CSS property
  wrapper.style.setProperty('--wails-drop-target', 'drop');

  // Visual feedback for drag over (Wails handles the actual drop)
  wrapper.addEventListener('dragenter', (e) => {
    e.preventDefault();
    wrapper.classList.add('drag-over');
  });

  wrapper.addEventListener('dragover', (e) => {
    e.preventDefault();
    wrapper.classList.add('drag-over');
  });

  wrapper.addEventListener('dragleave', (e) => {
    e.preventDefault();
    // Only remove if leaving the wrapper entirely
    const rect = wrapper.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom) {
      wrapper.classList.remove('drag-over');
    }
  });

  wrapper.addEventListener('drop', (e) => {
    e.preventDefault();
    wrapper.classList.remove('drag-over');
  });
}

export async function createTerminal() {
  if (!state.activeProject) return;

  const terminals = getTerminals();

  try {
    // Pass projectId to backend - let backend generate unique name
    const info = await CreateTerminalBackend(
      state.activeProject.id,
      '',  // Backend will auto-generate unique name
      state.activeProject.path
    );

    // Check if terminal was already created by event handler (race condition fix)
    // The state:terminal:created event may fire before CreateTerminalBackend returns
    if (terminals.has(info.id)) {
      logger.debug('Terminal already created by event handler, skipping xterm creation', { id: info.id });
      state.activeTerminalId = info.id;
      renderTerminalTabs();
      renderTerminalList();
      switchTerminal(info.id);
      if (onSwitchTab) onSwitchTab('terminal');
      SetActiveTerminal(state.activeProject.id, info.id);
      return;
    }

    // Create xterm instance - styled like Claude CLI
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: state.terminalFontSize,
      fontFamily: '"Berkeley Mono", "JetBrains Mono", "Fira Code", "SF Mono", "Menlo", "Monaco", monospace',
      fontWeight: '400',
      letterSpacing: 0,
      lineHeight: 1.35,
      allowTransparency: true,
      scrollback: 300,  // Reduced from 5000 for better performance
      convertEol: true,
      theme: {
        // Claude CLI-like dark theme
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        cursorAccent: '#0d1117',
        selectionBackground: 'rgba(56, 139, 253, 0.4)',
        selectionForeground: '#e6edf3',
        black: '#0d1117',
        red: '#ff7b72',
        green: '#7ee787',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#76e3ea',
        white: '#e6edf3',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#aff5b4',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#a5d6ff',
        brightWhite: '#ffffff'
      }
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminals.set(info.id, { terminal, fitAddon, info });
    state.activeTerminalId = info.id;

    terminal.onData((data) => {
      WriteTerminal(info.id, textToBase64(data));
    });

    terminal.onResize(({ rows, cols }) => {
      ResizeTerminal(info.id, rows, cols);
    });

    const container = document.getElementById('terminalContainer');
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) {
      emptyState.remove();
    }

    renderTerminalTabs();
    renderTerminalList();
    switchTerminal(info.id);
    if (onSwitchTab) onSwitchTab('terminal');

    // Update backend with active terminal
    SetActiveTerminal(state.activeProject.id, info.id);

  } catch (err) {
    logger.error('Failed to create terminal', { error: err.message || String(err) });
    alert('Failed to create terminal: ' + err);
  }
}

// Create terminal UI from external info (e.g., when created via remote client)
export function createTerminalFromInfo(info, projectId) {
  // Only process if this is for the active project
  if (!state.activeProject || state.activeProject.id !== projectId) {
    logger.debug('Ignoring terminal created for different project', { projectId, activeProject: state.activeProject?.id });
    return false;
  }

  const terminals = getTerminals();

  // Skip if terminal already exists
  if (terminals.has(info.id)) {
    logger.debug('Terminal already exists', { id: info.id });
    return false;
  }

  logger.info('Creating terminal UI from external source', { id: info.id, name: info.name });

  // Create xterm instance
  const terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    fontSize: state.terminalFontSize,
    fontFamily: '"Berkeley Mono", "JetBrains Mono", "Fira Code", "SF Mono", "Menlo", "Monaco", monospace',
    fontWeight: '400',
    letterSpacing: 0,
    lineHeight: 1.35,
    allowTransparency: true,
    scrollback: 300,  // Reduced from 5000 for better performance
    convertEol: true,
    theme: {
      background: '#0d1117',
      foreground: '#e6edf3',
      cursor: '#58a6ff',
      cursorAccent: '#0d1117',
      selectionBackground: 'rgba(56, 139, 253, 0.4)',
      selectionForeground: '#e6edf3',
      black: '#0d1117',
      red: '#ff7b72',
      green: '#7ee787',
      yellow: '#d29922',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#76e3ea',
      white: '#e6edf3',
      brightBlack: '#6e7681',
      brightRed: '#ffa198',
      brightGreen: '#aff5b4',
      brightYellow: '#e3b341',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#a5d6ff',
      brightWhite: '#ffffff'
    }
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  // Convert info to expected format
  const terminalInfo = {
    id: info.id,
    name: info.name,
    workDir: info.workDir,
    running: info.running !== false
  };

  terminals.set(info.id, { terminal, fitAddon, info: terminalInfo });

  terminal.onData((data) => {
    WriteTerminal(info.id, textToBase64(data));
  });

  terminal.onResize(({ rows, cols }) => {
    ResizeTerminal(info.id, rows, cols);
  });

  const container = document.getElementById('terminalContainer');
  const emptyState = container?.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  renderTerminalTabs();
  renderTerminalList();
  switchTerminal(info.id);
  if (onSwitchTab) onSwitchTab('terminal');

  return true;
}

export function renderTerminalTabs() {
  const container = document.getElementById('terminalTabsBar');
  if (!container) return;

  const terminals = getTerminals();

  if (terminals.size === 0) {
    container.innerHTML = '';
    return;
  }

  let html = '<div class="terminal-tabs-list">';
  terminals.forEach((data, id) => {
    html += `
      <div class="terminal-tab ${state.activeTerminalId === id ? 'active' : ''}" data-id="${id}">
        <span class="status ${data.info.running ? 'running' : 'stopped'}"></span>
        <span class="name" data-id="${id}" title="Double-click to rename">${data.info.name}</span>
        <button class="close-terminal" data-id="${id}">×</button>
      </div>
    `;
  });
  html += '</div>';

  // Font size controls
  html += `
    <div class="terminal-font-controls">
      <button class="font-size-btn" id="fontSizeDown" title="Decrease font size">−</button>
      <span class="font-size-value">${state.terminalFontSize}</span>
      <button class="font-size-btn" id="fontSizeUp" title="Increase font size">+</button>
    </div>
  `;

  container.innerHTML = html;

  container.querySelectorAll('.terminal-tab').forEach(tab => {
    let clickTimeout = null;

    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('close-terminal')) return;

      if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
        const nameEl = tab.querySelector('.name');
        startRenameTerminal(tab.dataset.id, nameEl);
      } else {
        clickTimeout = setTimeout(() => {
          clickTimeout = null;
          switchTerminal(tab.dataset.id);
        }, 250);
      }
    });
  });

  container.querySelectorAll('.close-terminal').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await closeTerminal(btn.dataset.id);
    });
  });

  // Font size controls
  container.querySelector('#fontSizeDown')?.addEventListener('click', () => {
    changeTerminalFontSize(-1);
  });
  container.querySelector('#fontSizeUp')?.addEventListener('click', () => {
    changeTerminalFontSize(1);
  });

  // Update Claude status indicators
  if (onUpdateClaudeStatusUI) {
    terminals.forEach((_, id) => {
      onUpdateClaudeStatusUI(id);
    });
  }
}

function startRenameTerminal(id, nameEl) {
  const terminals = getTerminals();
  const termData = terminals.get(id);
  if (!termData || !nameEl) return;

  if (nameEl.tagName === 'INPUT') return;

  const currentName = termData.info.name;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'terminal-rename-input';
  input.value = currentName;

  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('mousedown', (e) => e.stopPropagation());

  const parent = nameEl.parentNode;
  parent.replaceChild(input, nameEl);

  setTimeout(() => {
    input.focus();
    input.select();
  }, 10);

  let finished = false;
  const finishRename = () => {
    if (finished) return;
    finished = true;

    const newName = input.value.trim() || currentName;
    termData.info.name = newName;
    renderTerminalTabs();
    renderTerminalList();
  };

  input.addEventListener('blur', finishRename);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      input.value = currentName;
      input.blur();
    }
  });
}

export function renderTerminalList() {
  const container = document.getElementById('terminalList');
  if (!container) return;

  const terminals = getTerminals();

  if (terminals.size === 0) {
    container.innerHTML = '<p class="no-terminals">No terminals</p>';
    return;
  }

  let html = '';
  terminals.forEach((data, id) => {
    html += `
      <div class="terminal-item ${state.activeTerminalId === id ? 'active' : ''}" data-id="${id}">
        <span class="status ${data.info.running ? 'running' : 'stopped'}"></span>
        <span class="name">${data.info.name}</span>
      </div>
    `;
  });
  container.innerHTML = html;

  container.querySelectorAll('.terminal-item').forEach(item => {
    item.addEventListener('click', () => {
      switchTerminal(item.dataset.id);
      if (onSwitchTab) onSwitchTab('terminal');
    });
  });

  // Update Claude status indicators
  if (onUpdateClaudeStatusUI) {
    terminals.forEach((_, id) => {
      onUpdateClaudeStatusUI(id);
    });
  }
}

export function switchTerminal(id) {
  const terminals = getTerminals();
  logger.debug('switchTerminal', { id, terminalsSize: terminals.size, has: terminals.has(id) });

  if (!terminals.has(id)) {
    logger.debug('Terminal not found in map', { id });
    return;
  }

  state.activeTerminalId = id;

  const container = document.getElementById('terminalContainer');
  const termData = terminals.get(id);
  logger.debug('switchTerminal termData', { exists: !!termData });

  let termWrapper = document.getElementById(`term-wrapper-${id}`);

  if (!termWrapper) {
    termWrapper = document.createElement('div');
    termWrapper.id = `term-wrapper-${id}`;
    termWrapper.className = 'terminal-wrapper';
    container.appendChild(termWrapper);

    termData.terminal.open(termWrapper);

    // Load WebGL addon for GPU-accelerated rendering
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      termData.terminal.loadAddon(webglAddon);
      logger.debug('WebGL addon loaded successfully');
    } catch (e) {
      logger.warn('WebGL addon failed, using canvas renderer', { error: e.message });
    }

    // Debounced resize handler to prevent flickering
    let resizeTimeout = null;
    const resizeObserver = new ResizeObserver(() => {
      if (state.activeTerminalId === id) {
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          termData.fitAddon.fit();
        }, 50);
      }
    });
    resizeObserver.observe(termWrapper);
    termData.resizeObserver = resizeObserver;

    // Setup drag & drop for files/images
    setupTerminalDragDrop(termWrapper, termData.terminal, id);
  }

  // Hide all terminal wrappers
  container.querySelectorAll('.terminal-wrapper').forEach(wrapper => {
    wrapper.style.zIndex = '0';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.visibility = 'hidden';
  });

  // Show and bring active terminal wrapper to front
  termWrapper.style.zIndex = '10';
  termWrapper.style.pointerEvents = 'auto';
  termWrapper.style.visibility = 'visible';

  // Remove empty state if present (it might be covering terminals)
  const emptyState = container.querySelector('.empty-state');
  if (emptyState) {
    logger.debug('Removing empty-state');
    emptyState.remove();
  }

  logger.debug('switchTerminal wrapper state', {
    zIndex: termWrapper.style.zIndex,
    children: termWrapper.children.length,
    hasXterm: !!termWrapper.querySelector('.xterm')
  });

  // Focus and refit terminal after visibility change
  termData.terminal.focus();
  setTimeout(() => termData.fitAddon.fit(), 10);

  renderTerminalTabs();
  renderTerminalList();

  // Update backend with active terminal
  if (state.activeProject) {
    SetActiveTerminal(state.activeProject.id, id);
  }

  // Notify that terminal was activated (for prompts tab refresh)
  if (onTerminalActivated) onTerminalActivated(id);
}

// Change font size for all terminals across all projects
function changeTerminalFontSize(delta) {
  const newSize = Math.min(24, Math.max(10, state.terminalFontSize + delta));
  if (newSize === state.terminalFontSize) return;

  state.terminalFontSize = newSize;

  // Apply to all terminals across all projects
  state.projectTerminals.forEach((terminals) => {
    terminals.forEach((termData) => {
      termData.terminal.options.fontSize = newSize;
      termData.fitAddon.fit();
    });
  });

  // Update UI
  const fontSizeValue = document.querySelector('.font-size-value');
  if (fontSizeValue) fontSizeValue.textContent = newSize;
}

export async function closeTerminal(id) {
  await CloseTerminal(id);

  const terminals = getTerminals();
  const termData = terminals.get(id);
  if (termData) {
    if (termData.resizeObserver) {
      termData.resizeObserver.disconnect();
    }
    termData.terminal.dispose();
  }

  // Clean up history buffer
  removeHistoryBuffer(id);

  const wrapper = document.getElementById(`term-wrapper-${id}`);
  if (wrapper) {
    wrapper.remove();
  }

  terminals.delete(id);

  if (state.activeTerminalId === id) {
    const remaining = Array.from(terminals.keys());
    if (remaining.length > 0) {
      switchTerminal(remaining[0]);
    } else {
      state.activeTerminalId = null;
      const container = document.getElementById('terminalContainer');
      // Don't use innerHTML - it destroys other projects' terminal wrappers
      if (!container.querySelector('.empty-state')) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = `
          <p>No terminal open</p>
          <button id="createFirstTerminal" class="primary-btn" ${state.activeProject ? '' : 'disabled'}>Create Terminal</button>
        `;
        container.appendChild(emptyState);
        document.getElementById('createFirstTerminal')?.addEventListener('click', createTerminal);
      }
      // Notify that terminal was deactivated (for prompts tab refresh)
      if (onTerminalActivated) onTerminalActivated(null);
    }
  }

  renderTerminalTabs();
  renderTerminalList();
}

// ============================================
// Project Switcher Handler
// ============================================

/**
 * Initialize terminal handler for project switching
 * Call this during app initialization
 */
export function initTerminalHandler() {
  registerStateHandler('terminal', {
    priority: 60,

    onBeforeSwitch: async (ctx) => {
      // Hide all terminal wrappers when switching projects
      const termContainer = document.getElementById('terminalContainer');
      if (termContainer) {
        termContainer.querySelectorAll('.terminal-wrapper').forEach(w => {
          w.style.zIndex = '0';
          w.style.pointerEvents = 'none';
          w.style.visibility = 'hidden';
        });
      }

      // Reset active terminal
      state.activeTerminalId = null;
    },

    onSave: async (ctx) => {
      // Terminal state is managed by backend, nothing to save here
    },

    onLoad: async (ctx) => {
      const { projectState } = ctx;
      const terminals = getTerminals();
      const termContainer = document.getElementById('terminalContainer');

      // Remove empty state if present
      const emptyState = termContainer?.querySelector('.empty-state');
      if (emptyState) emptyState.remove();

      if (terminals.size > 0) {
        // Send all project's terminals to back
        terminals.forEach((data, id) => {
          const wrapper = document.getElementById(`term-wrapper-${id}`);
          if (wrapper) {
            wrapper.style.zIndex = '0';
            wrapper.style.pointerEvents = 'none';
          }
        });

        // Restore saved active terminal, or fall back to first terminal
        let terminalToActivate = projectState?.activeTerminalId;

        // Validate that the saved terminal still exists
        if (!terminalToActivate || !terminals.has(terminalToActivate)) {
          terminalToActivate = Array.from(terminals.keys())[0];
        }

        state.activeTerminalId = terminalToActivate;
        renderTerminalTabs();
        renderTerminalList();
        switchTerminal(terminalToActivate);
      } else {
        // No terminals for this project - auto-create first one
        state.activeTerminalId = null;
        renderTerminalTabs();
        renderTerminalList();

        // Auto-create first terminal
        logger.info('Auto-creating first terminal for project');
        await createTerminal();
      }
    },

    onAfterSwitch: async (ctx) => {
      // Final terminal UI updates are handled in onLoad
    }
  });
}
