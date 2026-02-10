// Terminal Dashboard - iTerm2 monitoring with inline output viewer

import { state } from './state.js';
import { registerStateHandler, switchProject } from './project-switcher.js';
import { updateWorkspaceInfo, openEditProjectModal, selectProject } from './projects.js';
import { TERMINAL_THEMES, getThemeByName } from './terminal-themes.js';
import { GetITermSessionInfo, GetITermStatus, SwitchITermTabBySessionID, CreateITermTab, RenameITermTabBySessionID, CloseITermTabBySessionID, WatchITermSession, UnwatchITermSession, WriteITermTextBySessionID, SendITermSpecialKey, GetTerminalTheme, SetTerminalTheme, GetTerminalFontSize, SetTerminalFontSize, GetITermSessionContentsByID, StartVoiceRecognition, StopVoiceRecognition, FocusITerm, RequestStyledHistory, GetVoiceLang, SetVoiceLang, GetVoiceAutoSubmit, SetVoiceAutoSubmit, GetDashboardFullscreen, SetDashboardFullscreen, SaveScreenshot, GetProjectPrompts, GetGlobalPrompts, IncrementPromptUsage, DeleteProject } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';

// Dashboard state
let dashboardState = {
  itermStatus: null,
  lastUpdate: null,
  selectedProjectName: null, // project selected on the left
  viewingSessionId: null,    // terminal being viewed on the right
  sessionContents: '',       // output text (plain fallback)
  styledLines: null,         // styled line data (array of arrays of runs)
  cursorPos: null,           // {x, y}
  termSize: null,            // {cols, rows}
  profileColors: null,       // {fg, bg, cursor, ansi: [...]}
  useStyledMode: false,      // whether styled content is active
  currentTheme: 'dracula',   // active theme name
  fontSize: 12,              // active font size
  themeMenuOpen: false,       // dropdown visibility
  historyLines: null,          // plain text history lines (from scrollback)
  historyLoading: false,       // loading indicator
  voiceState: 'idle',          // idle | listening
  voiceBuffer: '',             // accumulated voice text
  voiceLang: 'en-US',         // en-US | pl-PL
  voiceAutoSubmit: true,      // send to terminal on stop or fill input
  voiceConfigOpen: false,     // config dropdown visible
  fullscreen: false,           // fullscreen mode (hide sidebars/tools)
  pastedImagePath: null,       // absolute path of pasted screenshot on disk
  pastedImageBase64: null,     // base64 data URI for thumbnail preview
  pinnedPrompts: [],            // cached pinned prompts for quick-access buttons
};

// ============================================
// Helpers
// ============================================

// Stores sessionId → projectName for tabs WE created
const tabProjectMap = {};

// Get tabs matching a project name
function getTabsForProject(allTabs, projectName, projectPath) {
  if (!projectName) return [];
  return allTabs.filter(tab => {
    // Match by our own mapping (most reliable - tabs we created)
    if (tabProjectMap[tab.sessionId] === projectName) return true;
    // Match by name
    if (tab.name === projectName || tab.name.startsWith(projectName + ' ')) return true;
    // Match by exact working directory path
    if (projectPath && tab.path && tab.path === projectPath) return true;
    return false;
  });
}

// Build project groups from all iTerm tabs + Claudilandia projects
function buildProjectGroups(allTabs) {
  const groups = []; // { name, path, tabs[], icon, color }
  const matched = new Set();

  // Show ALL Claudilandia projects (same order as top tabs)
  const projects = state.projects || [];
  for (const proj of projects) {
    const tabs = getTabsForProject(allTabs.filter(t => !matched.has(t.sessionId)), proj.name, proj.path);
    tabs.forEach(t => matched.add(t.sessionId));
    groups.push({
      name: proj.name,
      path: proj.path,
      icon: proj.icon || '',
      color: proj.color || '',
      tabs,
    });
  }

  // Collect unmatched tabs under "Other"
  const otherTabs = allTabs.filter(t => !matched.has(t.sessionId));
  if (otherTabs.length > 0) {
    groups.push({
      name: 'Other',
      path: '',
      icon: '',
      color: '',
      tabs: otherTabs,
    });
  }

  return groups;
}

// Get next tab number for a project
function getNextTabNumber(allTabs, projectName) {
  if (!projectName) return 1;
  const projectTabs = allTabs.filter(tab => tab.name.startsWith(projectName + ' '));
  let maxNum = 0;
  projectTabs.forEach(tab => {
    const match = tab.name.match(new RegExp(`^${escapeRegex(projectName)} (\\d+)$`));
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  });
  return maxNum + 1;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Show context menu for project items (Edit / Delete)
function showProjectContextMenu(e, projectName) {
  // Remove any existing context menu
  const existing = document.querySelector('.project-context-menu');
  if (existing) existing.remove();

  const project = (state.projects || []).find(p => p.name === projectName);
  if (!project) return;

  const safeName = escapeHtml(project.name).replace(/'/g, "\\'");

  const menu = document.createElement('div');
  menu.className = 'prompt-context-menu project-context-menu';
  menu.innerHTML = `
    <button class="context-menu-item" onclick="window._projectCtxEdit('${safeName}')">Edit</button>
    <button class="context-menu-item danger" onclick="window._projectCtxDelete('${safeName}')">Delete</button>
  `;

  menu.style.position = 'fixed';
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;

  document.body.appendChild(menu);

  // Close on click outside
  const closeMenu = (ev) => {
    if (!menu.contains(ev.target)) {
      menu.remove();
      document.removeEventListener('mousedown', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closeMenu), 0);
}

function dismissProjectContextMenu() {
  const menu = document.querySelector('.project-context-menu');
  if (menu) menu.remove();
}

window._projectCtxEdit = async function(projectName) {
  dismissProjectContextMenu();
  const project = (state.projects || []).find(p => p.name === projectName);
  if (!project) return;
  if (state.activeProject?.id !== project.id) {
    await selectProject(project.id);
  }
  openEditProjectModal();
};

window._projectCtxDelete = async function(projectName) {
  dismissProjectContextMenu();
  const project = (state.projects || []).find(p => p.name === projectName);
  if (!project) {
    alert('Project not found: ' + projectName);
    return;
  }
  try {
    await DeleteProject(project.id);
    const idx = state.projects.findIndex(p => p.id === project.id);
    if (idx >= 0) state.projects.splice(idx, 1);
    if (state.activeProject?.id === project.id) {
      if (state.projects.length > 0) {
        await selectProject(state.projects[0].id);
      } else {
        state.activeProject = null;
      }
      updateWorkspaceInfo();
    }
    renderTerminalDashboard();
  } catch (err) {
    alert('Error deleting project: ' + err);
  }
};

// ============================================
// Window handlers
// ============================================

// Select a project on the left (does full global project switch)
window.itermSelectProject = async function(projectName) {
  if (dashboardState.selectedProjectName === projectName) return;

  // Find the project and do a full global switch
  const project = state.projects.find(p => p.name === projectName);
  if (project && state.activeProject?.id !== project.id) {
    await switchProject(project.id);
    // onAfterSwitch handler handles stopViewing + auto-select terminal + workspace info
    return;
  }

  // For "Other" group or non-project entries, just change terminal view
  stopViewing();
  dashboardState.selectedProjectName = projectName;

  const allTabs = dashboardState.itermStatus?.tabs || [];
  const groups = buildProjectGroups(allTabs);
  const group = groups.find(g => g.name === projectName);
  if (group?.tabs?.length > 0) {
    window.itermSelectTerminal(group.tabs[0].sessionId);
    return;
  }
  renderTerminalDashboard();
};

// Open add project modal from dashboard
window.openAddProjectModal = function() {
  const modal = document.getElementById('addProjectModal');
  if (modal) modal.classList.remove('hidden');
};

// Select a terminal tab on the right (starts viewing)
window.itermSelectTerminal = async function(sessionId) {
  if (dashboardState.viewingSessionId === sessionId) return;
  stopViewing();

  dashboardState.viewingSessionId = sessionId;
  dashboardState.sessionContents = '';
  dashboardState.useStyledMode = true;
  renderTerminalDashboard();

  try {
    const result = await WatchITermSession(sessionId);
    if (result && result.startsWith('ERROR:')) {
      dashboardState.sessionContents = result;
      dashboardState.useStyledMode = false;
      renderTerminalDashboard();
    }
  } catch (err) {
    dashboardState.sessionContents = 'ERROR: ' + (err.message || err);
    dashboardState.useStyledMode = false;
    renderTerminalDashboard();
  }
};

// Close a terminal tab in iTerm2
window.itermCloseTab = async function(sessionId) {
  try {
    if (dashboardState.viewingSessionId === sessionId) {
      stopViewing();
    }
    await CloseITermTabBySessionID(sessionId);
    // Remove tab from local state immediately so UI updates
    if (dashboardState.itermStatus?.tabs) {
      dashboardState.itermStatus.tabs = dashboardState.itermStatus.tabs.filter(t => t.sessionId !== sessionId);
    }
    renderTerminalDashboard();
  } catch (err) {
    console.error('Failed to close tab:', err);
  }
};

// Send text to the active terminal session (with Enter)
window.itermSendText = async function(text) {
  if (!dashboardState.viewingSessionId) return;
  try {
    await WriteITermTextBySessionID(dashboardState.viewingSessionId, text, true);
  } catch (err) {
    console.error('Failed to send text:', err);
  }
};

// Toggle fullscreen mode - hide everything except projects, terminal, and right sidebar
window.itermToggleFullscreen = function() {
  dashboardState.fullscreen = !dashboardState.fullscreen;
  SetDashboardFullscreen(dashboardState.fullscreen);
  const cls = document.querySelector('.app-container')?.classList;
  if (!cls) return;
  cls.toggle('dashboard-fullscreen', dashboardState.fullscreen);
  const btn = document.querySelector('.fullscreen-toggle-btn');
  if (btn) btn.textContent = dashboardState.fullscreen ? '⊗' : '⤢';
};

// Focus iTerm2 on a specific session
window.itermFocusSession = async function(sessionId) {
  try {
    await SwitchITermTabBySessionID(sessionId);
    await FocusITerm();
  } catch (err) {
    console.error('Failed to focus session:', err);
  }
};

// Load more history lines from scrollback buffer (styled via Python bridge)
window.itermLoadHistory = async function() {
  if (!dashboardState.viewingSessionId || dashboardState.historyLoading) return;

  dashboardState.historyLoading = true;
  const btn = document.querySelector('.history-load-btn');
  if (btn) btn.classList.add('loading');

  try {
    await RequestStyledHistory(dashboardState.viewingSessionId);
    // Response arrives via 'iterm-session-history' event
  } catch (err) {
    console.error('Failed to load history:', err);
    dashboardState.historyLoading = false;
    if (btn) btn.classList.remove('loading');
  }
};

// Inline rename - replaces tab button text with input
function startInlineRename(tabBtn, sessionId, currentName) {
  if (tabBtn.querySelector('.tab-rename-input')) return; // already editing

  const focusSpan = tabBtn.querySelector('.term-tab-focus');
  const originalText = currentName;

  // Replace button content with input
  tabBtn.textContent = '';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tab-rename-input';
  input.value = originalText;
  input.spellcheck = false;
  input.autocomplete = 'off';
  tabBtn.appendChild(input);
  if (focusSpan) tabBtn.appendChild(focusSpan);

  input.focus();
  input.select();

  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    const newName = input.value.trim();
    // Restore button text
    input.remove();
    tabBtn.insertBefore(document.createTextNode(escapeHtml(save && newName ? newName : originalText) + ' '), focusSpan || null);

    if (save && newName && newName !== originalText) {
      try {
        await RenameITermTabBySessionID(sessionId, newName);
        const tab = dashboardState.itermStatus?.tabs?.find(t => t.sessionId === sessionId);
        if (tab) tab.name = newName;
      } catch (err) {
        console.error('Failed to rename tab:', err);
      }
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
  // Prevent click on input from triggering tab switch
  input.addEventListener('click', (e) => e.stopPropagation());
}

// Create new terminal for the selected project
window.itermCreateTab = async function() {
  const projectName = dashboardState.selectedProjectName;
  if (!projectName || projectName === 'Other') return;

  const proj = (state.projects || []).find(p => p.name === projectName);
  if (!proj) return;

  const allTabs = dashboardState.itermStatus?.tabs || [];
  const previousSessionIds = new Set(allTabs.map(t => t.sessionId));
  const tabNumber = getNextTabNumber(allTabs, projectName);
  const tabName = `${projectName} ${tabNumber}`;

  try {
    await CreateITermTab(proj.path, tabName);

    // Wait for iTerm2 to create the session, then find it
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise(r => setTimeout(r, 500));
      const status = await GetITermStatus();
      dashboardState.itermStatus = status;
      const newTab = (status?.tabs || []).find(t => !previousSessionIds.has(t.sessionId));
      if (newTab) {
        tabProjectMap[newTab.sessionId] = projectName;
        renderTerminalDashboard();
        window.itermSelectTerminal(newTab.sessionId);
        return;
      }
    }
    // Tab not found after retries - just refresh to show whatever state we have
    renderTerminalDashboard();
  } catch (err) {
    console.error('Failed to create terminal:', err);
  }
};

window.itermRefreshDashboard = function() {
  refreshDashboardData();
};

// Send command to viewed session
window.itermSendCommand = async function() {
  const input = document.getElementById('itermCommandInput');
  if (!input || !dashboardState.viewingSessionId) return;

  let text = input.value.trim();
  const imagePath = dashboardState.pastedImagePath;

  if (!text && !imagePath) return;

  // Append image path if attached
  if (imagePath) {
    text = text ? text + '\n\n[Image: ' + imagePath + ']' : 'Look at this image: ' + imagePath;
  }

  try {
    await WriteITermTextBySessionID(dashboardState.viewingSessionId, text, true);
    input.value = '';
    // Clear attached image
    dashboardState.pastedImagePath = null;
    dashboardState.pastedImageBase64 = null;
    updatePastedImagePreview();
  } catch (err) {
    console.error('Failed to send command:', err);
  }
};

// Handle clipboard paste with image detection
async function handleClipboardPaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type === 'image/png' || item.type === 'image/jpeg') {
      e.preventDefault();

      const blob = item.getAsFile();
      if (!blob) return;

      const reader = new FileReader();
      reader.onload = async () => {
        const base64Full = reader.result; // data:image/png;base64,xxxxx
        const base64Data = base64Full.split(',')[1];

        const projectID = state.activeProject?.id;
        if (!projectID) return;

        const filename = `clipboard_${Date.now()}.png`;
        try {
          const savedPath = await SaveScreenshot(projectID, base64Data, filename);
          dashboardState.pastedImagePath = savedPath;
          dashboardState.pastedImageBase64 = base64Full;
          updatePastedImagePreview();
        } catch (err) {
          console.error('Failed to save pasted image:', err);
        }
      };
      reader.readAsDataURL(blob);
      return;
    }
  }
}

// Update pasted image preview without full re-render
function updatePastedImagePreview() {
  let preview = document.getElementById('pastedImagePreview');

  if (!dashboardState.pastedImagePath) {
    if (preview) preview.style.display = 'none';
    return;
  }

  if (!preview) {
    const inputBar = document.querySelector('.command-input-bar');
    if (!inputBar) return;
    preview = document.createElement('div');
    preview.id = 'pastedImagePreview';
    preview.className = 'pasted-image-preview';
    inputBar.parentNode.insertBefore(preview, inputBar);
  }

  const filename = dashboardState.pastedImagePath.split('/').pop();
  preview.style.display = 'flex';
  preview.innerHTML = `
    <img src="${dashboardState.pastedImageBase64}" class="pasted-image-thumb" alt="Screenshot" />
    <span class="pasted-image-name">${filename}</span>
    <button class="pasted-image-remove" onclick="window.itermRemovePastedImage()" title="Remove image">&times;</button>
  `;
}

window.itermRemovePastedImage = function() {
  dashboardState.pastedImagePath = null;
  dashboardState.pastedImageBase64 = null;
  updatePastedImagePreview();
};

window.itermSendKey = async function(key) {
  if (!dashboardState.viewingSessionId) return;
  try {
    await SendITermSpecialKey(dashboardState.viewingSessionId, key);
  } catch (err) {
    console.error('Failed to send key:', err);
  }
};

window.itermStopViewing = function() {
  stopViewing();
  renderTerminalDashboard();
};

window.itermSendPinnedPrompt = async function(promptId, isGlobal) {
  if (!dashboardState.viewingSessionId) return;
  const prompt = dashboardState.pinnedPrompts.find(p => p.id === promptId);
  if (!prompt) return;
  try {
    await WriteITermTextBySessionID(dashboardState.viewingSessionId, prompt.content, true);
    await IncrementPromptUsage(state.activeProject?.id, promptId, isGlobal);
  } catch (err) {
    console.error('Failed to send pinned prompt:', err);
  }
};

async function loadPinnedPrompts() {
  try {
    const projectId = state.activeProject?.id;
    const [projectPrompts, globalPrompts] = await Promise.all([
      projectId ? GetProjectPrompts(projectId) : Promise.resolve([]),
      GetGlobalPrompts()
    ]);
    const all = [
      ...(projectPrompts || []).filter(p => p.pinned).map(p => ({ ...p, isGlobal: false })),
      ...(globalPrompts || []).filter(p => p.pinned).map(p => ({ ...p, isGlobal: true }))
    ];
    dashboardState.pinnedPrompts = all;
  } catch (err) {
    // Ignore - prompts just won't show
  }
}

// ============================================
// Voice Input
// ============================================

function updateVoiceUI() {
  const btn = document.getElementById('voiceMicBtn');
  const preview = document.getElementById('voicePreview');
  if (!btn) return;

  btn.classList.remove('voice-idle', 'voice-listening');
  btn.classList.add('voice-' + dashboardState.voiceState);

  if (dashboardState.voiceState === 'idle') {
    btn.title = 'Voice input';
    if (preview) preview.style.display = 'none';
  } else if (dashboardState.voiceState === 'listening') {
    btn.title = 'Listening...';
    if (preview) {
      preview.style.display = 'block';
      preview.textContent = dashboardState.voiceBuffer || 'Listening...';
    }
  }

  // Update start/stop button states
  const startBtn = document.getElementById('voiceStartBtn');
  const stopBtn = document.getElementById('voiceStopBtn');
  if (startBtn) startBtn.disabled = dashboardState.voiceState === 'listening';
  if (stopBtn) stopBtn.disabled = dashboardState.voiceState === 'idle';
}

function voiceSubmitText(text) {
  if (!text) return;
  if (dashboardState.voiceAutoSubmit) {
    if (dashboardState.viewingSessionId) {
      WriteITermTextBySessionID(dashboardState.viewingSessionId, text, true);
    }
  } else {
    const input = document.getElementById('itermCommandInput');
    if (input) {
      input.value = (input.value ? input.value + ' ' : '') + text;
      input.focus();
    }
  }
}

function stopVoiceAndSubmit() {
  const text = dashboardState.voiceBuffer.trim();
  StopVoiceRecognition();
  if (text) voiceSubmitText(text);
  dashboardState.voiceState = 'idle';
  dashboardState.voiceBuffer = '';
  updateVoiceUI();
}

function stopVoiceRecognition() {
  StopVoiceRecognition();
  dashboardState.voiceState = 'idle';
  dashboardState.voiceBuffer = '';
  updateVoiceUI();
}

function showVoiceError(msg) {
  const preview = document.getElementById('voicePreview');
  if (preview) {
    preview.style.display = 'block';
    preview.textContent = msg;
    preview.style.color = '#ef4444';
    setTimeout(() => {
      if (dashboardState.voiceState === 'idle') {
        preview.style.display = 'none';
        preview.style.color = '#94a3b8';
      }
    }, 4000);
  }
}

// Start voice recognition
window.itermVoiceStart = async function() {
  if (dashboardState.voiceState === 'listening') return;

  dashboardState.voiceState = 'listening';
  dashboardState.voiceBuffer = '';
  voiceFinalTranscript = '';
  updateVoiceUI();

  const result = await StartVoiceRecognition(dashboardState.voiceLang);
  if (result.startsWith('ERROR:')) {
    showVoiceError(result.replace('ERROR: ', ''));
    dashboardState.voiceState = 'idle';
    updateVoiceUI();
  }
};

// Stop voice recognition and submit
window.itermVoiceStop = function() {
  if (dashboardState.voiceState !== 'listening') return;
  stopVoiceAndSubmit();
};

// Toggle mic (start/stop shortcut)
window.itermToggleVoice = async function() {
  if (dashboardState.voiceState === 'listening') {
    stopVoiceAndSubmit();
  } else {
    window.itermVoiceStart();
  }
};

// Config panel toggle
window.itermToggleVoiceConfig = function(e) {
  e && e.stopPropagation();
  dashboardState.voiceConfigOpen = !dashboardState.voiceConfigOpen;
  const panel = document.getElementById('voiceConfigPanel');
  if (panel) panel.style.display = dashboardState.voiceConfigOpen ? 'block' : 'none';
};

window.itermSetVoiceLang = function(lang) {
  dashboardState.voiceLang = lang;
  SetVoiceLang(lang);
  document.querySelectorAll('.voice-lang-radio').forEach(r => r.checked = r.value === lang);
};

window.itermSetVoiceAutoSubmit = function(checked) {
  dashboardState.voiceAutoSubmit = checked;
  SetVoiceAutoSubmit(checked);
};

// Close config panel on outside click
document.addEventListener('click', (e) => {
  if (dashboardState.voiceConfigOpen && !e.target.closest('.voice-config-wrapper')) {
    dashboardState.voiceConfigOpen = false;
    const panel = document.getElementById('voiceConfigPanel');
    if (panel) panel.style.display = 'none';
  }
});

// Handle voice transcript events from native macOS speech recognition
let voiceFinalTranscript = '';

EventsOn('voice-transcript', (data) => {
  if (!data) return;

  if (data.type === 'error') {
    showVoiceError(data.message);
    dashboardState.voiceState = 'idle';
    updateVoiceUI();
    return;
  }

  if (data.type === 'started' || data.type === 'stopped') return;

  if (dashboardState.voiceState !== 'listening') return;

  const text = data.text || '';
  const isFinal = data.type === 'final';
  const currentText = isFinal ? voiceFinalTranscript + text : voiceFinalTranscript + text;

  if (isFinal) {
    voiceFinalTranscript += text + ' ';
  }

  dashboardState.voiceBuffer = isFinal ? voiceFinalTranscript.trim() : currentText;
  const preview = document.getElementById('voicePreview');
  if (preview) {
    preview.textContent = dashboardState.voiceBuffer || 'Listening...';
  }
});

EventsOn('voice-stopped', () => {
  dashboardState.voiceState = 'idle';
  dashboardState.voiceBuffer = '';
  voiceFinalTranscript = '';
  updateVoiceUI();
});

// Toggle theme dropdown menu
window.itermToggleThemeMenu = function() {
  dashboardState.themeMenuOpen = !dashboardState.themeMenuOpen;
  const menu = document.getElementById('themeMenu');
  if (!menu) return;
  if (dashboardState.themeMenuOpen) {
    const dot = document.querySelector('.theme-dot');
    if (dot) {
      const rect = dot.getBoundingClientRect();
      menu.style.top = (rect.bottom + 6) + 'px';
      menu.style.left = Math.max(8, rect.right - 140) + 'px';
    }
    menu.classList.add('visible');
  } else {
    menu.classList.remove('visible');
  }
};

// Set terminal color theme
window.itermSetTheme = function(themeName) {
  dashboardState.currentTheme = themeName;
  dashboardState.themeMenuOpen = false;
  SetTerminalTheme(themeName);
  applyCurrentTheme();
  if (dashboardState.styledLines) updateStyledOutputViewer();
  renderTerminalDashboard();
};

// Change font size by delta
window.itermFontSize = function(delta) {
  const newSize = Math.min(24, Math.max(10, dashboardState.fontSize + delta));
  if (newSize === dashboardState.fontSize) return;
  dashboardState.fontSize = newSize;
  SetTerminalFontSize(newSize);
  applyFontSize();
  const display = document.querySelector('.font-size-value');
  if (display) display.textContent = newSize;
};

// ============================================
// Core logic
// ============================================

export function stopViewing() {
  if (!dashboardState.viewingSessionId) return;
  dashboardState.viewingSessionId = null;
  dashboardState.sessionContents = '';
  dashboardState.styledLines = null;
  dashboardState.cursorPos = null;
  dashboardState.termSize = null;
  dashboardState.profileColors = null;
  dashboardState.useStyledMode = false;
  dashboardState.historyLines = null;
  dashboardState.historyLoading = false;
  try {
    UnwatchITermSession();
  } catch (err) {
    // Ignore
  }
}

export function initTerminalDashboard() {
  addTerminalDashboardStyles();

  EventsOn('iterm-status-changed', (status) => {
    dashboardState.itermStatus = status;
    if (dashboardState.viewingSessionId && status?.tabs) {
      const stillExists = status.tabs.some(t => t.sessionId === dashboardState.viewingSessionId);
      if (!stillExists) {
        stopViewing();
      }
    }
    if (isDashboardVisible()) {
      renderTerminalDashboard();
    }
  });

  EventsOn('iterm-session-styled-content', (data) => {
    if (!data || data.sessionId !== dashboardState.viewingSessionId) return;
    try {
      dashboardState.styledLines = typeof data.lines === 'string' ? JSON.parse(data.lines) : data.lines;
      dashboardState.cursorPos = data.cursor;
      dashboardState.termSize = { cols: data.cols, rows: data.rows };
      dashboardState.useStyledMode = true;
      updateStyledOutputViewer();
    } catch (e) {
      console.error('Failed to parse styled content:', e);
    }
  });

  EventsOn('iterm-session-history', (data) => {
    if (!data || data.sessionId !== dashboardState.viewingSessionId) return;
    try {
      dashboardState.historyLines = typeof data.lines === 'string' ? JSON.parse(data.lines) : data.lines;
      dashboardState.historyLoading = false;
      const btn = document.querySelector('.history-load-btn');
      if (btn) btn.classList.remove('loading');
      updateStyledOutputViewer();
    } catch (e) {
      console.error('Failed to parse history:', e);
      dashboardState.historyLoading = false;
    }
  });

  EventsOn('iterm-session-profile', (data) => {
    if (!data || data.sessionId !== dashboardState.viewingSessionId) return;
    dashboardState.profileColors = data.colors;
    applyProfileColors();
    if (dashboardState.styledLines) {
      updateStyledOutputViewer();
    }
  });

  // Load persisted theme, font size, and voice settings
  GetTerminalTheme().then(theme => {
    dashboardState.currentTheme = theme || 'dracula';
  }).catch(() => {});
  GetTerminalFontSize().then(size => {
    dashboardState.fontSize = size || 12;
  }).catch(() => {});
  GetVoiceLang().then(lang => {
    dashboardState.voiceLang = lang || 'en-US';
  }).catch(() => {});
  GetVoiceAutoSubmit().then(enabled => {
    dashboardState.voiceAutoSubmit = enabled;
  }).catch(() => {});
  GetDashboardFullscreen().then(enabled => {
    dashboardState.fullscreen = enabled;
    if (enabled) {
      const cls = document.querySelector('.app-container')?.classList;
      if (cls) cls.add('dashboard-fullscreen');
      const btn = document.querySelector('.fullscreen-toggle-btn');
      if (btn) btn.textContent = '⊗';
    }
  }).catch(() => {});

  // Close theme menu on click outside
  document.addEventListener('click', (e) => {
    if (dashboardState.themeMenuOpen && !e.target.closest('.terminal-theme-selector')) {
      dashboardState.themeMenuOpen = false;
      const menu = document.getElementById('themeMenu');
      if (menu) menu.classList.remove('visible');
    }
  });

  setTimeout(() => refreshDashboardData(), 500);
}

function isDashboardVisible() {
  const panel = document.getElementById('dashboardPanel');
  return panel && panel.style.display !== 'none';
}

async function refreshDashboardData() {
  try {
    const [status] = await Promise.all([
      GetITermStatus(),
      loadPinnedPrompts()
    ]);
    dashboardState.itermStatus = status;
  } catch (err) {
    // Ignore
  }

  dashboardState.lastUpdate = new Date();
  renderTerminalDashboard();
}

function updateStyledOutputViewer() {
  const viewer = document.getElementById('itermOutputViewer');
  if (!viewer) return;

  // Update bridge indicator to green
  const indicator = document.querySelector('.bridge-indicator');
  if (indicator && !indicator.classList.contains('active')) {
    indicator.classList.add('active');
    indicator.title = 'Python bridge (styled)';
  }

  const allLines = dashboardState.styledLines;
  if (!allLines) {
    viewer.textContent = '';
    return;
  }

  // Trim trailing empty lines so the viewer doesn't scroll past actual content
  let lastNonEmpty = allLines.length - 1;
  while (lastNonEmpty >= 0 && (!allLines[lastNonEmpty] || allLines[lastNonEmpty].length === 0)) {
    lastNonEmpty--;
  }
  const lines = allLines.slice(0, lastNonEmpty + 1);

  const wasAtBottom = viewer.scrollHeight - viewer.scrollTop - viewer.clientHeight < 30;
  const defaultFg = dashboardState.profileColors?.fg || '#c7c7c7';
  const defaultBg = dashboardState.profileColors?.bg || '#000000';

  const fragment = document.createDocumentFragment();

  // Helper: render a single line of styled runs into a div
  function renderStyledLine(lineRuns, className) {
    const lineDiv = document.createElement('div');
    lineDiv.className = className;

    if (!lineRuns || lineRuns.length === 0) {
      lineDiv.textContent = '\u00A0';
      return lineDiv;
    }

    for (const run of lineRuns) {
      const span = document.createElement('span');
      let style = '';

      const fgIsDefault = !run.fg || colorsMatch(run.fg, defaultFg);
      const bgIsDefault = !run.bg || colorsMatch(run.bg, defaultBg);

      if (run.inv) {
        const theme = getThemeByName(dashboardState.currentTheme);
        if (fgIsDefault && bgIsDefault) {
          style += `color:${theme.background};background-color:${theme.foreground};`;
        } else {
          const fg = fgIsDefault ? theme.foreground : run.fg;
          const bg = bgIsDefault ? theme.background : run.bg;
          style += `color:${bg};background-color:${fg};`;
        }
      } else {
        if (!fgIsDefault) style += `color:${run.fg};`;
        if (!bgIsDefault) style += `background-color:${run.bg};`;
      }

      if (run.b) style += 'font-weight:bold;';
      if (run.i) style += 'font-style:italic;';
      if (run.u && run.s) {
        style += 'text-decoration:underline line-through;';
      } else if (run.u) {
        style += 'text-decoration:underline;';
      } else if (run.s) {
        style += 'text-decoration:line-through;';
      }
      if (run.f) style += 'opacity:0.5;';

      if (style) span.setAttribute('style', style);
      span.textContent = run.t;
      lineDiv.appendChild(span);
    }

    return lineDiv;
  }

  // Prepend scrollback history if loaded (styled)
  if (dashboardState.historyLines && dashboardState.historyLines.length > 0) {
    for (const histLineRuns of dashboardState.historyLines) {
      fragment.appendChild(renderStyledLine(histLineRuns, 'term-line term-history-line'));
    }
    const sep = document.createElement('div');
    sep.className = 'term-history-separator';
    sep.textContent = '── live ──';
    fragment.appendChild(sep);
  }

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    fragment.appendChild(renderStyledLine(lines[lineIdx], 'term-line'));
  }

  viewer.innerHTML = '';
  viewer.appendChild(fragment);

  if (wasAtBottom) {
    viewer.scrollTop = viewer.scrollHeight;
  }
}

function colorsMatch(a, b) {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

function applyCurrentTheme() {
  const viewer = document.getElementById('itermOutputViewer');
  if (!viewer) return;
  const theme = getThemeByName(dashboardState.currentTheme);
  viewer.style.backgroundColor = theme.background;
  viewer.style.color = theme.foreground;
}

function applyFontSize() {
  const viewer = document.getElementById('itermOutputViewer');
  if (!viewer) return;
  viewer.style.fontSize = dashboardState.fontSize + 'px';
}

function applyProfileColors() {
  const viewer = document.getElementById('itermOutputViewer');
  if (!viewer) return;
  // Theme takes priority over profile colors
  applyCurrentTheme();
}

// ============================================
// Render
// ============================================

export function renderTerminalDashboard() {
  const panel = document.getElementById('dashboardPanel');
  if (!panel) return;

  const allTabs = dashboardState.itermStatus?.tabs || [];
  const groups = buildProjectGroups(allTabs);

  // Auto-select first project if nothing selected yet
  if (!dashboardState.selectedProjectName && groups.length > 0) {
    dashboardState.selectedProjectName = groups[0].name;
  }

  const selectedGroup = groups.find(g => g.name === dashboardState.selectedProjectName);
  const selectedTabs = selectedGroup?.tabs || [];
  const isRealProject = selectedGroup && selectedGroup.name !== 'Other';

  // Stop viewing only if the session no longer exists at all (tab closed in iTerm2)
  if (dashboardState.viewingSessionId && !allTabs.some(t => t.sessionId === dashboardState.viewingSessionId)) {
    stopViewing();
  }

  const viewingTab = allTabs.find(t => t.sessionId === dashboardState.viewingSessionId);
  const currentThemeObj = getThemeByName(dashboardState.currentTheme);

  // Render projects list in left sidebar
  const projectsList = document.getElementById('projectsList');
  if (projectsList) {
    const withTerminals = groups.filter(g => g.tabs.length > 0);
    const withoutTerminals = groups.filter(g => g.tabs.length === 0);
    const sorted = [...withTerminals, ...withoutTerminals];
    window._projectDisplayOrder = sorted.map(g => g.name);
    projectsList.innerHTML = groups.length > 0 ? `
      <div class="terminal-list">
        ${sorted.map((g, i) => `
          ${i === withTerminals.length && withoutTerminals.length > 0 ? '<div class="project-separator"></div>' : ''}
          <div class="terminal-list-item ${g.name === dashboardState.selectedProjectName ? 'viewing' : ''}"
               data-project-name="${escapeHtml(g.name)}"
               onclick="window.itermSelectProject('${escapeHtml(g.name).replace(/'/g, "\\'")}')">
            <div class="project-number-badge" ${g.color ? `style="background:${g.color}22;color:${g.color}"` : ''}>
              <span class="project-number">${i + 1}</span>
            </div>
            <div class="project-info">
              <span class="terminal-list-name">${escapeHtml(g.name)}</span>
              ${g.tabs.length > 0 ? `<span class="card-count">${g.tabs.length} terminal${g.tabs.length > 1 ? 's' : ''}</span>` : ''}
            </div>
            ${g.icon ? `<span class="project-icon-right">${g.icon}</span>` : ''}
          </div>
        `).join('')}
      </div>
    ` : `<div class="no-terminals">No terminals open in iTerm2</div>`;

    // Attach context menu to project items
    projectsList.querySelectorAll('.terminal-list-item[data-project-name]').forEach(item => {
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const projectName = item.dataset.projectName;
        if (projectName === 'Other') return;
        showProjectContextMenu(e, projectName);
      });
    });
  }

  // Update fullscreen button state
  const fsBtn = document.querySelector('.fullscreen-toggle-btn');
  if (fsBtn) fsBtn.textContent = dashboardState.fullscreen ? '⊗' : '⤢';

  panel.innerHTML = `
    <div class="terminal-dashboard">
      <div class="dashboard-card output-card">
        ${selectedGroup ? `
          <!-- Terminal tabs bar -->
          <div class="terminal-tabs-bar">
            <div class="terminal-tabs-scroll">
              ${selectedTabs.map(tab => `
                <button class="term-tab-btn ${tab.sessionId === dashboardState.viewingSessionId ? 'active' : ''}"
                        data-session="${tab.sessionId}" data-name="${escapeHtml(tab.name)}"
                        title="Double-click to rename">
                  ${escapeHtml(tab.name)}
                  <span class="term-tab-focus" onclick="event.stopPropagation(); window.itermFocusSession('${tab.sessionId}')" title="Focus in iTerm2">⤴</span>
                  <span class="term-tab-close" onclick="event.stopPropagation(); window.itermCloseTab('${tab.sessionId}')" title="Close terminal">×</span>
                </button>
              `).join('')}
              ${isRealProject ? `<button class="term-tab-btn term-add-tab" onclick="window.itermCreateTab()" title="New Terminal">+</button>` : ''}
            </div>
            <div class="terminal-controls">
              ${dashboardState.viewingSessionId ? `
                <button class="history-load-btn ${dashboardState.historyLines ? 'loaded' : ''}" onclick="window.itermLoadHistory()" title="${dashboardState.historyLines ? 'History loaded' : 'Load scrollback history'}">⇡</button>
              ` : ''}
              <div class="terminal-font-controls">
                <button class="font-size-btn" onclick="window.itermFontSize(-1)">-</button>
                <span class="font-size-value">${dashboardState.fontSize}</span>
                <button class="font-size-btn" onclick="window.itermFontSize(1)">+</button>
              </div>
              <div class="terminal-theme-selector">
                <button class="theme-dot" style="background:${currentThemeObj.color}" onclick="window.itermToggleThemeMenu()" title="Color theme"></button>
                <div class="theme-menu ${dashboardState.themeMenuOpen ? 'visible' : ''}" id="themeMenu">
                  ${TERMINAL_THEMES.map(t => `
                    <button class="theme-option ${t.name === dashboardState.currentTheme ? 'active' : ''}" onclick="window.itermSetTheme('${t.name}')">
                      <span class="theme-color" style="background:${t.color}"></span>
                      <span class="theme-name">${t.displayName}</span>
                    </button>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- Output viewer -->
          ${dashboardState.viewingSessionId ? (
            dashboardState.sessionContents?.startsWith('ERROR:') ? `
            <div class="output-viewer-container">
              <div class="bridge-error">
                <div class="bridge-error-title">Python Bridge Error</div>
                <div class="bridge-error-msg">${escapeHtml(dashboardState.sessionContents.slice(7))}</div>
                <div class="bridge-error-help">
                  Setup:<br>
                  1. cd scripts && python3 -m venv venv && source venv/bin/activate && pip install iterm2<br>
                  2. iTerm2 → Settings → General → Magic → Enable Python API<br>
                  3. Restart Claudilandia
                </div>
              </div>
            </div>
          ` : `
            <div class="output-viewer-container">
              <div class="iterm-output-viewer" id="itermOutputViewer" onclick="document.getElementById('itermCommandInput')?.focus()"></div>
              <div class="keyboard-helper">
                <button class="key-btn" onclick="window.itermSendKey('enter')">Enter</button>
                <button class="key-btn" onclick="window.itermSendKey('tab')">Tab</button>
                <button class="key-btn" onclick="window.itermSendKey('left')">←</button>
                <button class="key-btn" onclick="window.itermSendKey('right')">→</button>
                <button class="key-btn" onclick="window.itermSendKey('up')">↑</button>
                <button class="key-btn" onclick="window.itermSendKey('down')">↓</button>
                ${dashboardState.pinnedPrompts.length > 0 ? `
                  <span class="pinned-prompt-separator"></span>
                  ${dashboardState.pinnedPrompts.map(p => `
                    <button class="key-btn pinned-prompt-btn"
                            onclick="window.itermSendPinnedPrompt('${p.id}', ${p.isGlobal})"
                            title="${escapeHtml(p.content).replace(/"/g, '&quot;')}">
                      ${escapeHtml(p.title)}
                    </button>
                  `).join('')}
                ` : ''}
                <span class="bridge-indicator ${dashboardState.useStyledMode ? 'active' : ''}" title="${dashboardState.useStyledMode ? 'Python bridge (styled)' : 'Not connected'}"></span>
                <div class="voice-controls">
                  <button id="voiceMicBtn" class="voice-mic-btn voice-${dashboardState.voiceState}" onclick="window.itermToggleVoice()" title="${dashboardState.voiceState === 'listening' ? 'Stop & send' : 'Start voice'}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" y1="19" x2="12" y2="23"/>
                      <line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                  </button>
                  <div class="voice-config-wrapper">
                    <button class="voice-config-btn" onclick="window.itermToggleVoiceConfig(event)" title="Voice settings">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                      </svg>
                    </button>
                    <div id="voiceConfigPanel" class="voice-config-panel" style="display:none">
                      <div class="voice-config-section">
                        <div class="voice-config-label">Language</div>
                        <label class="voice-config-option">
                          <input type="radio" name="voiceLang" class="voice-lang-radio" value="en-US" ${dashboardState.voiceLang === 'en-US' ? 'checked' : ''} onchange="window.itermSetVoiceLang('en-US')"> English
                        </label>
                        <label class="voice-config-option">
                          <input type="radio" name="voiceLang" class="voice-lang-radio" value="pl-PL" ${dashboardState.voiceLang === 'pl-PL' ? 'checked' : ''} onchange="window.itermSetVoiceLang('pl-PL')"> Polski
                        </label>
                      </div>
                      <div class="voice-config-section">
                        <label class="voice-config-option">
                          <input type="checkbox" ${dashboardState.voiceAutoSubmit ? 'checked' : ''} onchange="window.itermSetVoiceAutoSubmit(this.checked)"> Auto submit
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div id="voicePreview" class="voice-preview" style="display:${dashboardState.voiceState === 'listening' ? 'block' : 'none'}">
                <span class="voice-preview-text">${dashboardState.voiceBuffer || 'Listening...'}</span>
                <div class="voice-preview-actions">
                  <button id="voiceStopBtn" class="voice-action-btn voice-stop-btn" onclick="window.itermVoiceStop()" ${dashboardState.voiceState !== 'listening' ? 'disabled' : ''}>Stop & Send</button>
                </div>
              </div>
              <div id="pastedImagePreview" class="pasted-image-preview" style="display:${dashboardState.pastedImagePath ? 'flex' : 'none'}">
                ${dashboardState.pastedImagePath ? `
                  <img src="${dashboardState.pastedImageBase64 || ''}" class="pasted-image-thumb" alt="Screenshot" />
                  <span class="pasted-image-name">${(dashboardState.pastedImagePath || '').split('/').pop()}</span>
                  <button class="pasted-image-remove" onclick="window.itermRemovePastedImage()" title="Remove image">&times;</button>
                ` : ''}
              </div>
              <div class="command-input-bar">
                <textarea id="itermCommandInput" class="command-input" rows="3"
                       placeholder="Type command and press Enter..." autocomplete="off" spellcheck="false"
                       onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window.itermSendCommand();}"></textarea>
              </div>
            </div>
          `) : `
            <div class="output-placeholder ${allTabs.length === 0 ? 'setup-guide' : ''}">
              ${allTabs.length === 0 ? `
                <div class="setup-guide-content">
                  <div class="setup-guide-title">iTerm2 Setup</div>
                  <p class="setup-guide-desc">Claudilandia connects to iTerm2 via its Python API to display and control your terminal sessions. Follow these steps to get started:</p>
                  <div class="setup-steps">
                    <div class="setup-step">
                      <span class="step-number">1</span>
                      <div class="step-content">
                        <div class="step-title">Enable the Python API</div>
                        <div class="step-detail">Open <strong>iTerm2</strong> → <strong>Settings</strong> (or press <kbd>Cmd</kbd>+<kbd>,</kbd>) → <strong>General</strong> → <strong>Magic</strong></div>
                        <div class="step-detail">Check <strong>"Enable Python API"</strong></div>
                      </div>
                    </div>
                    <div class="setup-step">
                      <span class="step-number">2</span>
                      <div class="step-content">
                        <div class="step-title">Install Python dependencies</div>
                        <div class="step-detail">Open a terminal and run:</div>
                        <code class="step-code">cd scripts && python3 -m venv venv && source venv/bin/activate && pip install iterm2</code>
                      </div>
                    </div>
                    <div class="setup-step">
                      <span class="step-number">3</span>
                      <div class="step-content">
                        <div class="step-title">Restart iTerm2</div>
                        <div class="step-detail">Quit iTerm2 completely (<kbd>Cmd</kbd>+<kbd>Q</kbd>) and reopen it so the Python API activates.</div>
                      </div>
                    </div>
                    <div class="setup-step">
                      <span class="step-number">4</span>
                      <div class="step-content">
                        <div class="step-title">Relaunch Claudilandia</div>
                        <div class="step-detail">Rebuild and open the app. Your iTerm2 sessions will appear here automatically.</div>
                      </div>
                    </div>
                  </div>
                </div>
              ` : selectedTabs.length === 0 && isRealProject ? `
                <span>No terminals for this project</span>
                <button class="create-first-btn" onclick="window.itermCreateTab()">Create Terminal</button>
              ` : `
                <span>Select a terminal tab to view its output</span>
              `}
            </div>
          `}
        ` : `
          <div class="output-placeholder setup-guide">
            ${groups.length === 0 ? `
              <div class="setup-guide-content">
                <div class="setup-guide-title">iTerm2 Setup</div>
                <p class="setup-guide-desc">Claudilandia connects to iTerm2 via its Python API to display and control your terminal sessions. Follow these steps to get started:</p>
                <div class="setup-steps">
                  <div class="setup-step">
                    <span class="step-number">1</span>
                    <div class="step-content">
                      <div class="step-title">Enable the Python API</div>
                      <div class="step-detail">Open <strong>iTerm2</strong> → <strong>Settings</strong> (or press <kbd>Cmd</kbd>+<kbd>,</kbd>) → <strong>General</strong> → <strong>Magic</strong></div>
                      <div class="step-detail">Check <strong>"Enable Python API"</strong></div>
                    </div>
                  </div>
                  <div class="setup-step">
                    <span class="step-number">2</span>
                    <div class="step-content">
                      <div class="step-title">Install Python dependencies</div>
                      <div class="step-detail">Open a terminal and run:</div>
                      <code class="step-code">cd scripts && python3 -m venv venv && source venv/bin/activate && pip install iterm2</code>
                    </div>
                  </div>
                  <div class="setup-step">
                    <span class="step-number">3</span>
                    <div class="step-content">
                      <div class="step-title">Restart iTerm2</div>
                      <div class="step-detail">Quit iTerm2 completely (<kbd>Cmd</kbd>+<kbd>Q</kbd>) and reopen it so the Python API activates.</div>
                    </div>
                  </div>
                  <div class="setup-step">
                    <span class="step-number">4</span>
                    <div class="step-content">
                      <div class="step-title">Relaunch Claudilandia</div>
                      <div class="step-detail">Rebuild and open the app. Your iTerm2 sessions will appear here automatically.</div>
                    </div>
                  </div>
                </div>
              </div>
            ` : `
              <span>Select a project</span>
            `}
          </div>
        `}
      </div>
    </div>
  `;

  // Always apply theme and font size when viewer exists
  if (dashboardState.viewingSessionId) {
    applyCurrentTheme();
    applyFontSize();

    if (dashboardState.useStyledMode && dashboardState.styledLines) {
      updateStyledOutputViewer();
    } else if (dashboardState.sessionContents) {
      const viewer = document.getElementById('itermOutputViewer');
      if (viewer) {
        viewer.textContent = dashboardState.sessionContents;
        viewer.scrollTop = viewer.scrollHeight;
      }
    }
  }

  // Attach click + dblclick to tab buttons via event delegation
  const tabsScroll = panel.querySelector('.terminal-tabs-scroll');
  if (tabsScroll) {
    tabsScroll.addEventListener('click', (e) => {
      const btn = e.target.closest('.term-tab-btn');
      if (!btn || btn.querySelector('.tab-rename-input')) return;
      const sid = btn.dataset.session;
      if (sid) window.itermSelectTerminal(sid);
    });
    tabsScroll.addEventListener('dblclick', (e) => {
      const btn = e.target.closest('.term-tab-btn');
      if (!btn) return;
      const sid = btn.dataset.session;
      const name = btn.dataset.name;
      if (sid && name) startInlineRename(btn, sid, name);
    });
  }

  // Auto-focus command input and attach paste handler when a terminal is active
  if (dashboardState.viewingSessionId) {
    const cmdInput = document.getElementById('itermCommandInput');
    if (cmdInput) {
      cmdInput.focus();
      cmdInput.addEventListener('paste', handleClipboardPaste);
    }
  }
}

export function showTerminalDashboard() {
  refreshDashboardData();
}

// ============================================
// Styles
// ============================================

function addTerminalDashboardStyles() {
  if (document.getElementById('terminal-dashboard-styles')) return;

  const style = document.createElement('style');
  style.id = 'terminal-dashboard-styles';
  style.textContent = `
    .terminal-dashboard {
      display: grid;
      gap: 16px;
      padding: 20px;
      height: 100%;
      overflow: hidden;
    }

    /* Cards */
    .dashboard-card {
      background: linear-gradient(135deg, #1e293b 0%, #1a2332 100%);
      border: 1px solid #334155;
      border-radius: 16px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.02);
      border-bottom: 1px solid #334155;
      flex-shrink: 0;
    }

    .card-title {
      font-size: 13px;
      font-weight: 600;
      color: #f1f5f9;
      flex: 1;
    }

    .card-count {
      font-size: 11px;
      color: #e2e8f0;
      background: rgba(137, 180, 250, 0.2);
      padding: 2px 8px;
      border-radius: 12px;
      flex-shrink: 0;
    }

    .card-content { padding: 12px; }

    /* Project list (sidebar) */
    .terminal-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .project-separator {
      height: 1px;
      background: rgba(205, 214, 244, 0.08);
      margin: 20px 0 4px 0;
    }

    .terminal-list-item {
      display: flex;
      align-items: stretch;
      background: rgba(205, 214, 244, 0.04);
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid rgba(205, 214, 244, 0.06);
      transition: all 0.15s;
      overflow: hidden;
    }

    .terminal-list-item:hover {
      background: rgba(205, 214, 244, 0.07);
      border-color: rgba(205, 214, 244, 0.14);
    }

    .terminal-list-item.viewing {
      background: rgba(137, 180, 250, 0.08);
      border-color: rgba(137, 180, 250, 0.25);
    }

    .terminal-list-item.viewing .terminal-list-name {
      color: #fff;
    }

    .project-number-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 38px;
      background: rgba(137, 180, 250, 0.1);
      color: #89b4fa;
      flex-shrink: 0;
      border-right: 1px solid rgba(205, 214, 244, 0.06);
    }

    .terminal-list-item:hover .project-number-badge {
      background: rgba(137, 180, 250, 0.15);
    }

    .terminal-list-item.viewing .project-number-badge {
      background: rgba(137, 180, 250, 0.2);
      color: #89b4fa;
    }

    .project-number {
      font-size: 14px;
      font-weight: 700;
      font-family: 'Menlo', 'Monaco', monospace;
    }

    .project-info {
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 8px 12px;
      min-width: 0;
      flex: 1;
    }

    .terminal-list-name {
      font-size: 13px;
      font-weight: 500;
      color: #cdd6f4;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .terminal-list-item .card-count {
      font-size: 10px;
      color: #6c7086;
      margin-top: 2px;
      background: none;
      padding: 0;
      border-radius: 0;
    }

    .terminal-list-item.viewing .card-count {
      color: #89b4fa;
    }

    .no-terminals {
      color: #6c7086;
      font-size: 13px;
      text-align: center;
      padding: 20px;
    }

    /* Terminal tabs bar (right, top) */
    .terminal-tabs-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 12px;
      background: #0f172a;
      border-bottom: 1px solid #1e293b;
      flex-shrink: 0;
      overflow: hidden;
    }

    .terminal-tabs-scroll {
      display: flex;
      gap: 0;
      flex: 1;
      overflow-x: auto;
      min-width: 0;
    }

    .terminal-tabs-scroll::-webkit-scrollbar { height: 0; }

    .term-tab-btn {
      appearance: none;
      border: none;
      background: transparent;
      color: #585b70;
      padding: 8px 14px;
      font-size: 12px;
      border-radius: 0;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s;
      flex-shrink: 0;
    }

    .term-tab-btn:hover {
      background: rgba(205, 214, 244, 0.04);
      color: #a6adc8;
    }

    .term-tab-btn.active {
      background: rgba(205, 214, 244, 0.06);
      color: #cdd6f4;
      border-bottom-color: #89b4fa;
    }

    .term-tab-focus {
      font-size: 12px;
      opacity: 0;
      cursor: pointer;
      transition: opacity 0.15s;
    }

    .term-tab-btn:hover .term-tab-focus { opacity: 0.6; }
    .term-tab-focus:hover { opacity: 1 !important; }

    .term-tab-close {
      font-size: 14px;
      opacity: 0;
      cursor: pointer;
      transition: opacity 0.15s;
      margin-left: 2px;
    }
    .term-tab-btn:hover .term-tab-close { opacity: 0.5; }
    .term-tab-close:hover { opacity: 1 !important; color: #ef4444; }

    .no-tabs-hint {
      color: #475569;
      font-size: 12px;
      padding: 4px 8px;
    }

    .term-add-tab {
      padding: 8px 10px !important;
      color: #585b70 !important;
      font-size: 14px !important;
      min-width: 0;
    }

    .term-add-tab:hover {
      color: #89b4fa !important;
    }

    .term-refresh-btn {
      width: 24px;
      height: 24px;
      padding: 0;
      border: none;
      border-radius: 4px;
      background: #475569;
      color: white;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .term-refresh-btn:hover { background: #64748b; }

    /* Output card (right) */
    .output-card { min-height: 0; }

    .output-placeholder {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #475569;
      font-size: 13px;
    }

    .output-placeholder.setup-guide {
      align-items: flex-start;
      padding: 32px;
      overflow-y: auto;
    }

    .setup-guide-content {
      max-width: 520px;
      width: 100%;
    }

    .setup-guide-title {
      font-size: 18px;
      font-weight: 600;
      color: #cdd6f4;
      margin-bottom: 8px;
    }

    .setup-guide-desc {
      color: #6c7086;
      font-size: 13px;
      line-height: 1.5;
      margin: 0 0 24px 0;
    }

    .setup-steps {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .setup-step {
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }

    .step-number {
      flex-shrink: 0;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: rgba(137, 180, 250, 0.1);
      color: #89b4fa;
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 1px;
    }

    .step-content {
      flex: 1;
      min-width: 0;
    }

    .step-title {
      font-size: 14px;
      font-weight: 500;
      color: #cdd6f4;
      margin-bottom: 4px;
    }

    .step-detail {
      color: #6c7086;
      font-size: 12px;
      line-height: 1.5;
    }

    .step-detail strong {
      color: #a6adc8;
    }

    .step-detail kbd {
      background: rgba(205, 214, 244, 0.08);
      border: 1px solid #313244;
      border-radius: 3px;
      padding: 1px 5px;
      font-size: 11px;
      color: #a6adc8;
      font-family: inherit;
    }

    .step-code {
      display: block;
      margin-top: 6px;
      padding: 8px 12px;
      background: #0f0f17;
      border: 1px solid #1e293b;
      border-radius: 6px;
      font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
      font-size: 11px;
      color: #a6adc8;
      word-break: break-all;
      line-height: 1.5;
      user-select: all;
    }

    .output-viewer-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .iterm-output-viewer {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overflow-x: auto;
      margin: 0;
      padding: 8px 12px;
      background: #000000;
      color: #c7c7c7;
      font-family: 'Menlo', 'Monaco', 'JetBrains Mono', monospace;
      font-size: 12px;
      line-height: 1.35;
      border: none;
    }

    .term-line {
      min-height: 1.35em;
      white-space: pre;
    }

    .term-line span {
      white-space: pre;
    }

    .keyboard-helper {
      display: flex;
      gap: 4px;
      padding: 6px 12px;
      background: #0f172a;
      border-top: 1px solid #334155;
      flex-wrap: wrap;
      flex-shrink: 0;
      align-items: center;
    }

    .key-btn {
      background: #1e293b;
      color: #94a3b8;
      border: 1px solid #334155;
      border-radius: 4px;
      padding: 5px 12px;
      font-size: 12px;
      font-family: 'Menlo', 'Monaco', monospace;
      cursor: pointer;
      transition: all 0.1s;
      line-height: 1.4;
    }

    .key-btn:hover {
      background: #334155;
      color: #e2e8f0;
      border-color: #475569;
    }

    .key-btn:active {
      background: #3b82f6;
      color: white;
      border-color: #3b82f6;
    }

    .pinned-prompt-separator {
      width: 1px;
      height: 18px;
      background: #334155;
      margin: 0 4px;
      flex-shrink: 0;
    }

    .pinned-prompt-btn {
      background: rgba(137, 180, 250, 0.08) !important;
      border-color: rgba(137, 180, 250, 0.2) !important;
      color: #89b4fa !important;
    }

    .pinned-prompt-btn:hover {
      background: rgba(137, 180, 250, 0.15) !important;
      color: #b4d0fb !important;
      border-color: rgba(137, 180, 250, 0.35) !important;
    }

    .pinned-prompt-btn:active {
      background: #3b82f6 !important;
      color: white !important;
      border-color: #3b82f6 !important;
    }

    .command-input-bar {
      display: flex;
      gap: 8px;
      padding: 8px 12px;
      background: #0f172a;
      border-top: 1px solid #334155;
      flex-shrink: 0;
    }

    .command-input {
      flex: 1;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 6px 10px;
      color: #e2e8f0;
      font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
      font-size: 12px;
      outline: none;
      resize: none;
      line-height: 1.4;
    }

    .command-input:focus { border-color: #3b82f6; }
    .command-input::placeholder { color: #475569; }

    .pasted-image-preview {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: #1a2332;
      border-top: 1px solid #334155;
      flex-shrink: 0;
    }
    .pasted-image-thumb {
      height: 48px;
      max-width: 120px;
      object-fit: contain;
      border-radius: 4px;
      border: 1px solid #334155;
    }
    .pasted-image-name {
      flex: 1;
      color: #94a3b8;
      font-size: 11px;
      font-family: 'JetBrains Mono', 'Menlo', monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pasted-image-remove {
      background: none;
      border: 1px solid #475569;
      color: #94a3b8;
      width: 20px;
      height: 20px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      line-height: 1;
      padding: 0;
      flex-shrink: 0;
      transition: all 0.15s;
    }
    .pasted-image-remove:hover {
      background: #ef4444;
      border-color: #ef4444;
      color: white;
    }

    .create-first-btn {
      margin-top: 12px;
      appearance: none;
      border: none;
      background: #3b82f6;
      color: white;
      padding: 8px 20px;
      font-size: 13px;
      font-weight: 500;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .create-first-btn:hover { background: #2563eb; }

    .bridge-error {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      text-align: center;
      gap: 12px;
    }

    .bridge-error-title {
      font-size: 15px;
      font-weight: 600;
      color: #ef4444;
    }

    .bridge-error-msg {
      font-size: 13px;
      color: #94a3b8;
      max-width: 500px;
    }

    .bridge-error-help {
      font-size: 12px;
      color: #64748b;
      background: #0f172a;
      padding: 12px 16px;
      border-radius: 8px;
      text-align: left;
      line-height: 1.8;
      font-family: 'Menlo', 'Monaco', monospace;
    }

    .bridge-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ef4444;
      flex-shrink: 0;
      opacity: 0.7;
      margin-left: auto;
    }

    .bridge-indicator.active {
      background: #22c55e;
    }

    /* Voice input */
    .voice-controls {
      display: flex;
      align-items: center;
      gap: 2px;
      margin-left: 4px;
    }
    .voice-mic-btn {
      background: none;
      border: 1px solid #334155;
      border-radius: 4px;
      color: #64748b;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
      flex-shrink: 0;
    }
    .voice-mic-btn:hover { color: #94a3b8; border-color: #475569; }
    .voice-mic-btn.voice-listening {
      color: #ef4444;
      border-color: #ef4444;
      background: rgba(239, 68, 68, 0.1);
      animation: voice-pulse 0.8s ease-in-out infinite;
    }
    @keyframes voice-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .voice-config-wrapper { position: relative; }
    .voice-config-btn {
      background: none;
      border: 1px solid #334155;
      border-radius: 4px;
      color: #64748b;
      width: 20px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .voice-config-btn:hover { color: #94a3b8; border-color: #475569; }
    .voice-config-panel {
      position: absolute;
      bottom: 30px;
      right: 0;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 10px 12px;
      min-width: 160px;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    }
    .voice-config-section {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .voice-config-section + .voice-config-section {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #334155;
    }
    .voice-config-label {
      font-size: 10px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .voice-config-option {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #cbd5e1;
      cursor: pointer;
    }
    .voice-config-option input[type="radio"],
    .voice-config-option input[type="checkbox"] {
      accent-color: #3b82f6;
      margin: 0;
    }
    .voice-preview {
      padding: 6px 12px;
      background: #1e293b;
      border-top: 1px solid #334155;
      font-size: 12px;
      color: #94a3b8;
      font-family: 'Menlo', 'Monaco', monospace;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .voice-preview-text {
      flex: 1;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 40px;
      overflow-y: auto;
    }
    .voice-preview-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }
    .voice-action-btn {
      padding: 3px 10px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
      border: none;
      font-weight: 500;
      transition: all 0.15s;
    }
    .voice-action-btn:disabled { opacity: 0.4; cursor: default; }
    .voice-stop-btn {
      background: #ef4444;
      color: white;
    }
    .voice-stop-btn:hover:not(:disabled) { background: #dc2626; }

    /* History load button */
    .history-load-btn {
      background: none;
      border: 1px solid #444;
      border-radius: 4px;
      color: #8b949e;
      font-size: 13px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
      padding: 0;
      line-height: 1;
    }

    .history-load-btn:hover {
      color: #89b4fa;
      border-color: #89b4fa;
    }

    .history-load-btn.loaded {
      color: #22c55e;
      border-color: #22c55e;
    }

    .history-load-btn.loading {
      opacity: 0.5;
      cursor: wait;
    }

    /* History lines in viewer */
    .term-history-line {
      opacity: 0.5;
    }

    .term-history-separator {
      text-align: center;
      color: #475569;
      font-size: 10px;
      padding: 4px 0;
      border-bottom: 1px solid #334155;
      margin-bottom: 4px;
    }

    /* Scrollbars */
    .iterm-output-viewer::-webkit-scrollbar,
    .terminal-list-content::-webkit-scrollbar {
      width: 6px;
    }

    .iterm-output-viewer::-webkit-scrollbar-track,
    .terminal-list-content::-webkit-scrollbar-track {
      background: transparent;
    }

    .iterm-output-viewer::-webkit-scrollbar-thumb,
    .terminal-list-content::-webkit-scrollbar-thumb {
      background: #334155;
      border-radius: 3px;
    }

    .iterm-output-viewer::-webkit-scrollbar-thumb:hover,
    .terminal-list-content::-webkit-scrollbar-thumb:hover {
      background: #475569;
    }
  `;
  document.head.appendChild(style);
}

// ============================================
// Project switcher handler
// ============================================

export function initTerminalDashboardHandler() {
  registerStateHandler('terminalDashboard', {
    priority: 80,

    onLoad: (ctx) => {
      // Auto-select active project only if nothing is selected yet
      if (!dashboardState.selectedProjectName && state.activeProject?.name) {
        dashboardState.selectedProjectName = state.activeProject.name;
      }
    },

    onAfterSwitch: async (ctx) => {
      const projectName = state.activeProject?.name;
      if (!projectName) return;

      // Update workspace info in sidebar
      updateWorkspaceInfo();

      // Switch terminal dashboard to the new project
      stopViewing();
      dashboardState.selectedProjectName = projectName;

      // Auto-select first terminal session if one exists
      const allTabs = dashboardState.itermStatus?.tabs || [];
      const groups = buildProjectGroups(allTabs);
      const group = groups.find(g => g.name === projectName);
      if (group?.tabs?.length > 0) {
        window.itermSelectTerminal(group.tabs[0].sessionId);
      }
    },
  });
}
