import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { marked } from 'marked';
import { createModuleLogger } from './logger.js';

const logger = createModuleLogger('ToolsPanel');
import {
  GetProjectAgents,
  GetGlobalAgents,
  GetAgentContent,
  SaveAgentContent,
  GetAvailableSkills,
  GetInstalledSkills,
  InstallSkill,
  GetProjectHooks,
  GetProjectHooksDetailed,
  InstallHook,
  AddHook,
  AddHookEntry,
  RemoveHook,
  GetHookScriptContent,
  GetProjectHookScripts,
  CreateHookScript,
  DeleteHookScript,
  InstallTemplateHook,
  CheckLibraryStatus,
  GetClaudemd,
  SaveClaudemd,
  GetProjectCommands,
  GetGlobalCommands,
  GetCommandContent,
  SaveCommandContent,
  CreateCommand,
  DeleteCommand,
  GetProjectMCPServers,
  GetUserMCPServers,
  AddMCPServer,
  RemoveMCPServer,
  // Template repo methods
  GetTemplateRepoPath,
  GetTemplateAgents,
  GetTemplateCommands,
  GetTemplateSkills,
  GetTemplateRules,
  GetTemplateHooks,
  GetTemplateMCPServers,
  GetTemplateContent,
  InstallTemplateAgent,
  InstallTemplateCommand,
  InstallTemplateSkill,
  InstallTemplateRule,
  // Prompt methods
  GetProjectPrompts,
  CreatePrompt,
  UpdatePrompt,
  DeletePrompt,
  IncrementPromptUsage,
  TogglePromptPinned,
  GetGlobalPrompts,
  CreateGlobalPrompt,
  UpdateGlobalPrompt,
  DeleteGlobalPrompt,
  GetPromptCategories,
  GetGlobalPromptCategories,
  CreatePromptCategory,
  DeletePromptCategory,
  WriteITermText,
  GetToolsPanelHeight,
  SetToolsPanelHeight
} from '../../wailsjs/go/main/App';
import { registerStateHandler } from './project-switcher.js';

// Tools Panel State
export const toolsState = {
  activeTab: 'prompts',
  panelHeight: 40, // percentage
  minimized: false,
  agents: [],
  libs: [],
  skills: [],
  hooks: [],
  commands: [],
  mcpServers: [],
  claudemd: '', // CLAUDE.md content
  claudemdDirty: false, // unsaved changes flag
  claudemdPreview: false, // preview mode toggle
  // Prompts state
  prompts: [],           // project prompts
  globalPrompts: [],     // global prompts
  promptCategories: [],
  globalPromptCategories: [],
  activePromptCategory: 'all',
  promptAutoSubmit: true, // auto-press Enter after sending prompt
  // Current modal context
  modalMode: null, // 'view' | 'edit' | 'info' | 'create'
  modalItem: null
};

// Recommended libraries list
const RECOMMENDED_LIBS = [
  { name: 'vitest', category: 'Testing', description: 'Fast Vite-native unit test framework with smart watch mode and native coverage.' },
  { name: '@playwright/test', category: 'Testing', description: 'End-to-end testing framework for web applications with cross-browser support.' },
  { name: '@testing-library/react', category: 'Testing', description: 'Simple and complete React component testing utilities.' },
  { name: 'zod', category: 'Validation', description: 'TypeScript-first schema validation with static type inference.' },
  { name: 'eslint', category: 'Code Quality', description: 'Pluggable JavaScript/TypeScript linter for identifying problematic patterns.' },
  { name: 'prettier', category: 'Code Quality', description: 'Opinionated code formatter supporting multiple languages.' },
  { name: 'husky', category: 'Code Quality', description: 'Modern native Git hooks manager for running scripts on commits.' },
  { name: 'lint-staged', category: 'Code Quality', description: 'Run linters and formatters only on staged files before commits.' },
  { name: 'secretlint', category: 'Security', description: 'Secret detection and prevention tool for finding hardcoded credentials.' },
  { name: '@secretlint/secretlint-rule-preset-recommend', category: 'Security', description: 'Recommended secretlint rules for common secret patterns.' },
  { name: 'jscpd', category: 'Duplication', description: 'Copy-paste detector for finding duplicated code across files.' },
  { name: '@sentry/nextjs', category: 'Monitoring', description: 'Error tracking and performance monitoring for Next.js applications.' },
  { name: 'zustand', category: 'State', description: 'Small, fast and scalable bear-bones state management for React.' },
  { name: '@tanstack/react-query', category: 'State', description: 'Powerful data synchronization and caching for server state.' },
  { name: 'react-hook-form', category: 'Forms', description: 'Performant, flexible forms with easy validation and minimal re-renders.' },
  { name: '@hookform/resolvers', category: 'Forms', description: 'Validation resolvers for react-hook-form supporting Zod, Yup, etc.' },
  { name: 'i18next', category: 'i18n', description: 'Internationalization framework for browser, Node.js, and more.' },
  { name: 'react-i18next', category: 'i18n', description: 'React bindings for i18next with hooks and HOCs.' },
  { name: 'next-auth', category: 'Auth', description: 'Complete authentication solution for Next.js applications.' },
  { name: 'prisma', category: 'Database', description: 'Next-generation ORM with type-safe database client and migrations.' }
];

// Popular skills to display
const POPULAR_SKILLS = [
  { name: 'feature-dev', description: 'Structured feature development workflow' },
  { name: 'code-review', description: 'Automated PR review' },
  { name: 'plugin-dev', description: 'Create Claude Code plugins' },
  { name: 'frontend-design', description: 'Production-grade frontend interfaces' },
  { name: 'typescript-lsp', description: 'TypeScript language server' },
  { name: 'security-guidance', description: 'Security best practices' },
  { name: 'commit-commands', description: 'Git commit workflows' },
  { name: 'hookify', description: 'Writing Claude Code hooks' }
];

// Hook event type display names and icons
const HOOK_EVENT_TYPES = {
  'PreToolUse': { icon: '⚡', label: 'Pre Tool Use', color: '#f9e2af' },
  'PostToolUse': { icon: '✅', label: 'Post Tool Use', color: '#a6e3a1' },
  'PreCompact': { icon: '📦', label: 'Pre Compact', color: '#89b4fa' },
  'PostCompact': { icon: '📦', label: 'Post Compact', color: '#89b4fa' },
  'SessionStart': { icon: '🚀', label: 'Session Start', color: '#cba6f7' },
  'Stop': { icon: '🛑', label: 'Stop', color: '#f38ba8' },
  'Notification': { icon: '🔔', label: 'Notification', color: '#fab387' },
  'UserPromptSubmit': { icon: '💬', label: 'User Prompt', color: '#94e2d5' }
};

export function setupToolsPanel() {
  // Tools tab switching
  document.querySelectorAll('.tools-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.toolsTab;
      switchToolsTab(tabName);
    });
  });

  // Minimize/Expand buttons
  const collapseBtn = document.getElementById('collapseToolsPanel');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', toggleToolsPanel);
  }

  // Tools panel resizer
  setupToolsPanelResizer();

  // Restore saved panel height
  GetToolsPanelHeight().then(h => {
    if (h >= 20 && h <= 70) {
      toolsState.panelHeight = h;
      updateToolsPanelHeight();
    }
  }).catch(() => {});

  // Modal event listeners
  document.getElementById('closeToolsModal')?.addEventListener('click', closeToolsModal);
  document.getElementById('cancelToolsModal')?.addEventListener('click', closeToolsModal);
  document.getElementById('toolsModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'toolsModal') closeToolsModal();
  });
  document.getElementById('fullscreenToolsModal')?.addEventListener('click', toggleModalFullscreen);

  // Initial render of tools
  renderToolsPanel();
}

// Tab icons mapping for status bar
const TAB_ICONS = {
  prompts: '💬',
  agents: '🤖',
  commands: '⌨️',
  skills: '⚡',
  hooks: '🪝',
  mcp: '🔌',
  libs: '📦',
  claudemd: '📄'
};

const TAB_LABELS = {
  prompts: 'Prompts',
  agents: 'Agents',
  commands: 'Commands',
  skills: 'Skills',
  hooks: 'Hooks',
  mcp: 'MCP',
  libs: 'Libs',
  claudemd: 'CLAUDE.MD'
};

export function switchToolsTab(tabName) {
  toolsState.activeTab = tabName;

  // Update tab buttons
  document.querySelectorAll('.tools-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.toolsTab === tabName);
  });

  // Update tab content
  document.querySelectorAll('.tools-tab-content').forEach(content => {
    content.style.display = 'none';
  });

  const activeContent = document.getElementById(`tools${tabName.charAt(0).toUpperCase() + tabName.slice(1)}Tab`);
  if (activeContent) {
    activeContent.style.display = 'block';
  }

  // Update status bar
  updateStatusBar(tabName);

  // Render tab content
  renderToolsPanel();
}

function updateStatusBar(tabName) {
  const iconEl = document.getElementById('statusBarIcon');
  const labelEl = document.getElementById('statusBarLabel');

  if (iconEl) iconEl.textContent = TAB_ICONS[tabName] || '📁';
  if (labelEl) labelEl.textContent = TAB_LABELS[tabName] || tabName;
}

function minimizeToolsPanel() {
  const panel = document.getElementById('projectToolsPanel');
  const resizer = document.getElementById('toolsPanelResizer');
  const collapseBtn = document.getElementById('collapseToolsPanel');

  if (!panel) return;

  toolsState.minimized = true;
  panel.classList.add('minimized');

  if (resizer) resizer.style.display = 'none';
  if (collapseBtn) {
    collapseBtn.textContent = '▲';
    collapseBtn.title = 'Expand panel';
  }
}

function expandToolsPanel() {
  const panel = document.getElementById('projectToolsPanel');
  const resizer = document.getElementById('toolsPanelResizer');
  const collapseBtn = document.getElementById('collapseToolsPanel');

  if (!panel) return;

  toolsState.minimized = false;
  panel.classList.remove('minimized');

  if (resizer) resizer.style.display = 'flex';
  if (collapseBtn) {
    collapseBtn.textContent = '▼';
    collapseBtn.title = 'Minimize panel';
  }
}

function toggleToolsPanel() {
  if (toolsState.minimized) {
    expandToolsPanel();
  } else {
    minimizeToolsPanel();
  }
}

function setupToolsPanelResizer() {
  const resizer = document.getElementById('toolsPanelResizer');
  if (!resizer) return;

  let isResizing = false;
  let startY = 0;
  let startHeight = 40;

  const onMouseDown = (e) => {
    isResizing = true;
    startY = e.clientY;
    startHeight = toolsState.panelHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const overlay = document.createElement('div');
    overlay.id = 'toolsResizeOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;cursor:row-resize;';
    document.body.appendChild(overlay);
  };

  const onMouseMove = (e) => {
    if (!isResizing) return;

    const container = document.querySelector('.main-panel');
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const deltaY = startY - e.clientY;
    const deltaPercent = (deltaY / containerRect.height) * 100;

    toolsState.panelHeight = Math.min(70, Math.max(20, startHeight + deltaPercent));
    updateToolsPanelHeight();
    // Don't fit() during drag - causes terminal to reload/jump
  };

  const onMouseUp = () => {
    if (!isResizing) return;
    isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    const overlay = document.getElementById('toolsResizeOverlay');
    if (overlay) overlay.remove();
    // Persist panel height globally
    SetToolsPanelHeight(toolsState.panelHeight);
    // ResizeObserver will handle terminal fit() automatically
  };

  resizer.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

function updateToolsPanelHeight() {
  const panelContent = document.querySelector('.main-panel > .panel-content');
  const toolsPanel = document.getElementById('projectToolsPanel');

  if (panelContent && toolsPanel && !toolsState.minimized) {
    panelContent.style.flex = `1 1 ${100 - toolsState.panelHeight}%`;
    toolsPanel.style.flex = `0 0 ${toolsState.panelHeight}%`;
  }
}

export function renderToolsPanel() {
  switch (toolsState.activeTab) {
    case 'prompts':
      renderPromptsTab();
      break;
    case 'agents':
      renderAgentsTab();
      break;
    case 'commands':
      renderCommandsTab();
      break;
    case 'libs':
      renderLibsTab();
      break;
    case 'skills':
      renderSkillsTab();
      break;
    case 'hooks':
      renderHooksTab();
      break;
    case 'mcp':
      renderMcpTab();
      break;
    case 'claudemd':
      renderClaudemdTab();
      break;
  }
}

// ============================================
// Prompts Tab
// ============================================

// Calculate prompt size based on usage
function calculatePromptSize(usageCount, maxUsage, totalPrompts) {
  if (maxUsage === 0 || totalPrompts <= 3) return 'prompt-size-medium';

  const score = usageCount / maxUsage;

  if (score >= 0.6) return 'prompt-size-large';      // Top 60%+
  if (score >= 0.25) return 'prompt-size-medium';    // 25-60%
  return 'prompt-size-small';                         // <25%
}

// Sort prompts: pinned first, then by usage desc, then by updatedAt desc
function sortPrompts(prompts) {
  return [...prompts].sort((a, b) => {
    // Pinned always first
    if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
    // Then by usage
    if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
    // Then by date
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
}

// Get all unique categories from prompts
function getAllCategories(prompts, globalPrompts) {
  const categories = new Set();
  [...prompts, ...globalPrompts].forEach(p => {
    if (p.category) categories.add(p.category);
  });
  return Array.from(categories).sort();
}

async function renderPromptsTab() {
  const container = document.getElementById('promptsContainer');
  if (!container) return;

  if (!state.activeProject) {
    container.innerHTML = `
      <div class="tools-empty-state">
        <div class="empty-icon">💬</div>
        <p>Select a project to view prompts</p>
      </div>
    `;
    return;
  }

  try {
    // Load prompts
    const projectPrompts = await GetProjectPrompts(state.activeProject.id);
    const globalPrompts = await GetGlobalPrompts();

    toolsState.prompts = projectPrompts || [];
    toolsState.globalPrompts = globalPrompts || [];

    // Combine and filter by category
    let allPrompts = [
      ...toolsState.prompts.map(p => ({ ...p, isGlobal: false })),
      ...toolsState.globalPrompts.map(p => ({ ...p, isGlobal: true }))
    ];

    if (toolsState.activePromptCategory !== 'all') {
      allPrompts = allPrompts.filter(p => p.category === toolsState.activePromptCategory);
    }

    // Sort prompts
    const sortedPrompts = sortPrompts(allPrompts);

    // Separate pinned and regular prompts
    const pinnedPrompts = sortedPrompts.filter(p => p.pinned);
    const regularPrompts = sortedPrompts.filter(p => !p.pinned);

    // Calculate max usage for sizing
    const maxUsage = Math.max(...allPrompts.map(p => p.usageCount), 1);

    // Get all categories for filter bar
    const categories = getAllCategories(toolsState.prompts, toolsState.globalPrompts);

    let html = '';

    // Category filter bar
    html += `
      <div class="prompts-filter-bar">
        <button class="prompt-category-btn ${toolsState.activePromptCategory === 'all' ? 'active' : ''}" data-category="all">
          All (${toolsState.prompts.length + toolsState.globalPrompts.length})
        </button>
        ${categories.map(cat => {
          const count = allPrompts.filter(p => p.category === cat).length;
          return `
            <button class="prompt-category-btn ${toolsState.activePromptCategory === cat ? 'active' : ''}" data-category="${escapeHtml(cat)}">
              ${escapeHtml(cat)} (${count})
            </button>
          `;
        }).join('')}
        <button class="prompt-category-btn add-category-btn" title="Add Category">+</button>
        <label class="prompt-auto-submit">
          <input type="checkbox" id="promptAutoSubmit" ${toolsState.promptAutoSubmit ? 'checked' : ''} />
          Auto Submit
        </label>
      </div>
    `;

    // Pinned prompts section
    if (pinnedPrompts.length > 0) {
      html += `
        <div class="prompts-section-header">📌 Pinned</div>
        <div class="prompts-list">
          ${pinnedPrompts.map(prompt => renderPromptItem(prompt, maxUsage, allPrompts.length)).join('')}
        </div>
      `;
    }

    // All prompts section
    if (regularPrompts.length > 0) {
      html += `
        <div class="prompts-section-header">All Prompts</div>
        <div class="prompts-list">
          ${regularPrompts.map(prompt => renderPromptItem(prompt, maxUsage, allPrompts.length)).join('')}
        </div>
      `;
    }

    // Empty state or create button
    if (allPrompts.length === 0) {
      html += `
        <div class="tools-empty-state">
          <div class="empty-icon">💬</div>
          <p>No prompts yet</p>
          <button class="tools-item-btn create-prompt-btn primary" style="margin-top: 12px;">+ Create Prompt</button>
        </div>
      `;
    } else {
      html += `
        <div class="prompts-create-row">
          <button class="tools-item-btn create-prompt-btn primary">+ Create New Prompt</button>
        </div>
      `;
    }

    container.innerHTML = html;

    // Add event handlers
    setupPromptEventHandlers(container);

  } catch (err) {
    logger.error('Failed to load prompts', { error: err.message || String(err) });
    container.innerHTML = `
      <div class="tools-empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Error loading prompts</p>
        <p style="font-size:11px;color:var(--text-muted);margin-top:8px;">${escapeHtml(err.toString())}</p>
      </div>
    `;
  }
}

function renderPromptItem(prompt, maxUsage, totalPrompts) {
  const sizeClass = calculatePromptSize(prompt.usageCount, maxUsage, totalPrompts);
  const pinnedClass = prompt.pinned ? 'pinned' : '';

  return `
    <div class="prompt-item-wrapper">
      <button class="prompt-menu-btn" data-prompt-id="${prompt.id}" data-is-global="${prompt.isGlobal}" title="Options">⋮</button>
      <div class="prompt-item ${sizeClass} ${pinnedClass}"
           data-prompt-id="${prompt.id}"
           data-is-global="${prompt.isGlobal}">
        <span class="prompt-item-icon">${prompt.pinned ? '📌' : '💬'}</span>
        <span class="prompt-item-title">${escapeHtml(prompt.title)}</span>
        ${prompt.isGlobal ? '<span class="prompt-item-badge global">🌐</span>' : ''}
        ${prompt.usageCount > 0 ? `<span class="prompt-item-usage">${prompt.usageCount}</span>` : ''}
      </div>
    </div>
  `;
}

function setupPromptEventHandlers(container) {
  // Category filter buttons
  container.querySelectorAll('.prompt-category-btn:not(.add-category-btn)').forEach(btn => {
    btn.addEventListener('click', () => {
      toolsState.activePromptCategory = btn.dataset.category;
      renderPromptsTab();
    });
  });

  // Add category button
  container.querySelector('.add-category-btn')?.addEventListener('click', () => {
    showCreateCategoryModal();
  });

  // Auto-submit checkbox
  container.querySelector('#promptAutoSubmit')?.addEventListener('change', (e) => {
    toolsState.promptAutoSubmit = e.target.checked;
  });

  // Create prompt button
  container.querySelectorAll('.create-prompt-btn').forEach(btn => {
    btn.addEventListener('click', () => showCreatePromptModal());
  });

  // Prompt item click - send to iTerm2
  container.querySelectorAll('.prompt-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      const promptId = item.dataset.promptId;
      const isGlobal = item.dataset.isGlobal === 'true';
      await sendPromptToTerminal(promptId, isGlobal);
    });
  });

  // Menu button click - show context menu
  container.querySelectorAll('.prompt-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const promptId = btn.dataset.promptId;
      const isGlobal = btn.dataset.isGlobal === 'true';
      showPromptContextMenu(e, promptId, isGlobal);
    });
  });

  // Prompt item right-click - context menu (edit/pin/delete)
  container.querySelectorAll('.prompt-item').forEach(item => {
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const promptId = item.dataset.promptId;
      const isGlobal = item.dataset.isGlobal === 'true';
      showPromptContextMenu(e, promptId, isGlobal);
    });
  });
}

async function sendPromptToTerminal(promptId, isGlobal) {
  // Find the prompt
  const prompts = isGlobal ? toolsState.globalPrompts : toolsState.prompts;
  const prompt = prompts.find(p => p.id === promptId);
  if (!prompt) return;

  try {
    // Send prompt text to iTerm2
    // The second parameter controls whether to press Enter after the text
    await WriteITermText(prompt.content, toolsState.promptAutoSubmit);

    // Increment usage
    await IncrementPromptUsage(state.activeProject?.id, promptId, isGlobal);

    // Refresh the tab
    renderPromptsTab();
  } catch (err) {
    logger.error('Failed to send prompt to iTerm2', { error: err.message || String(err) });
    alert('Failed to send prompt: ' + err);
  }
}

async function togglePromptPin(promptId, isGlobal) {
  try {
    await TogglePromptPinned(state.activeProject?.id, promptId, isGlobal);
    renderPromptsTab();
  } catch (err) {
    logger.error('Failed to toggle pin', { error: err.message || String(err) });
    alert('Failed to toggle pin: ' + err);
  }
}

function showCreatePromptModal() {
  const modal = document.getElementById('toolsModal');
  const title = document.getElementById('toolsModalTitle');
  const body = document.getElementById('toolsModalBody');
  const footer = document.getElementById('toolsModalFooter');

  if (!modal || !title || !body || !footer) return;

  // Get categories for dropdown
  const categories = getAllCategories(toolsState.prompts, toolsState.globalPrompts);

  title.textContent = 'Create New Prompt';
  body.innerHTML = `
    <div class="prompt-form">
      <div class="form-group">
        <label for="promptTitle">Title</label>
        <input type="text" id="promptTitle" class="tools-input" placeholder="e.g. Explain Error" />
      </div>
      <div class="form-group">
        <label for="promptCategory">Category</label>
        <div class="prompt-category-input">
          <select id="promptCategory" class="tools-select">
            <option value="">None</option>
            ${categories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('')}
          </select>
          <input type="text" id="promptNewCategory" class="tools-input" placeholder="or enter new..." style="margin-left: 8px;" />
        </div>
      </div>
      <div class="form-group">
        <label>
          <input type="checkbox" id="promptIsGlobal" />
          Global (available in all projects)
        </label>
      </div>
      <div class="form-group">
        <label for="promptContent">Prompt Content</label>
        <textarea id="promptContent" class="tools-editor" placeholder="Enter your prompt text here...

Example:
Look at the error message and explain:
1. What is causing the error
2. How to fix it
3. How to prevent it in the future"></textarea>
      </div>
    </div>
  `;

  footer.innerHTML = `
    <button id="cancelPromptBtn" class="secondary-btn">Cancel</button>
    <button id="savePromptBtn" class="primary-btn">Create</button>
  `;

  footer.querySelector('#cancelPromptBtn')?.addEventListener('click', closeToolsModal);
  footer.querySelector('#savePromptBtn')?.addEventListener('click', async () => {
    const promptTitle = document.getElementById('promptTitle').value.trim();
    const categorySelect = document.getElementById('promptCategory').value;
    const newCategory = document.getElementById('promptNewCategory').value.trim();
    const isGlobal = document.getElementById('promptIsGlobal').checked;
    const content = document.getElementById('promptContent').value;

    if (!promptTitle) {
      alert('Please enter a title');
      return;
    }

    if (!content) {
      alert('Please enter prompt content');
      return;
    }

    const category = newCategory || categorySelect;

    const prompt = {
      title: promptTitle,
      content: content,
      category: category,
      usageCount: 0,
      pinned: false
    };

    try {
      if (isGlobal) {
        await CreateGlobalPrompt(prompt);
      } else {
        await CreatePrompt(state.activeProject.id, prompt);
      }

      closeToolsModal();
      renderPromptsTab();
    } catch (err) {
      logger.error('Failed to create prompt', { error: err.message || String(err) });
      alert('Failed to create prompt: ' + err);
    }
  });

  modal.classList.remove('hidden');
}

function showEditPromptModal(promptId, isGlobal) {
  const prompts = isGlobal ? toolsState.globalPrompts : toolsState.prompts;
  const prompt = prompts.find(p => p.id === promptId);
  if (!prompt) return;

  const modal = document.getElementById('toolsModal');
  const title = document.getElementById('toolsModalTitle');
  const body = document.getElementById('toolsModalBody');
  const footer = document.getElementById('toolsModalFooter');

  if (!modal || !title || !body || !footer) return;

  // Get categories for dropdown
  const categories = getAllCategories(toolsState.prompts, toolsState.globalPrompts);

  title.textContent = 'Edit Prompt';
  body.innerHTML = `
    <div class="prompt-form">
      <div class="form-group">
        <label for="promptTitle">Title</label>
        <input type="text" id="promptTitle" class="tools-input" value="${escapeHtml(prompt.title)}" />
      </div>
      <div class="form-group">
        <label for="promptCategory">Category</label>
        <div class="prompt-category-input">
          <select id="promptCategory" class="tools-select">
            <option value="">None</option>
            ${categories.map(cat => `<option value="${escapeHtml(cat)}" ${prompt.category === cat ? 'selected' : ''}>${escapeHtml(cat)}</option>`).join('')}
          </select>
          <input type="text" id="promptNewCategory" class="tools-input" placeholder="or enter new..." style="margin-left: 8px;" />
        </div>
      </div>
      <div class="form-group">
        <label>
          <input type="checkbox" id="promptIsGlobal" ${isGlobal ? 'checked' : ''} />
          Global (available in all projects)
        </label>
      </div>
      <div class="form-group">
        <label for="promptContent">Prompt Content</label>
        <textarea id="promptContent" class="tools-editor">${escapeHtml(prompt.content)}</textarea>
      </div>
    </div>
  `;

  footer.innerHTML = `
    <button id="deletePromptBtn" class="secondary-btn danger-btn">🗑️ Delete</button>
    <div style="flex:1"></div>
    <button id="cancelPromptBtn" class="secondary-btn">Cancel</button>
    <button id="savePromptBtn" class="primary-btn">Save</button>
  `;

  footer.querySelector('#cancelPromptBtn')?.addEventListener('click', closeToolsModal);

  footer.querySelector('#deletePromptBtn')?.addEventListener('click', async () => {
    if (confirm(`Delete prompt "${prompt.title}"?`)) {
      try {
        if (isGlobal) {
          await DeleteGlobalPrompt(promptId);
        } else {
          await DeletePrompt(state.activeProject.id, promptId);
        }
        closeToolsModal();
        renderPromptsTab();
      } catch (err) {
        logger.error('Failed to delete prompt', { error: err.message || String(err) });
        alert('Failed to delete prompt: ' + err);
      }
    }
  });

  footer.querySelector('#savePromptBtn')?.addEventListener('click', async () => {
    const promptTitle = document.getElementById('promptTitle').value.trim();
    const categorySelect = document.getElementById('promptCategory').value;
    const newCategory = document.getElementById('promptNewCategory').value.trim();
    const newIsGlobal = document.getElementById('promptIsGlobal').checked;
    const content = document.getElementById('promptContent').value;

    if (!promptTitle) {
      alert('Please enter a title');
      return;
    }

    if (!content) {
      alert('Please enter prompt content');
      return;
    }

    const category = newCategory || categorySelect;

    const updatedPrompt = {
      title: promptTitle,
      content: content,
      category: category,
      usageCount: prompt.usageCount,
      pinned: prompt.pinned
    };

    try {
      // Check if scope changed
      if (isGlobal !== newIsGlobal) {
        // Delete from old location
        if (isGlobal) {
          await DeleteGlobalPrompt(promptId);
        } else {
          await DeletePrompt(state.activeProject.id, promptId);
        }
        // Create in new location
        if (newIsGlobal) {
          await CreateGlobalPrompt(updatedPrompt);
        } else {
          await CreatePrompt(state.activeProject.id, updatedPrompt);
        }
      } else {
        // Just update in same location
        if (isGlobal) {
          await UpdateGlobalPrompt(promptId, updatedPrompt);
        } else {
          await UpdatePrompt(state.activeProject.id, promptId, updatedPrompt);
        }
      }

      closeToolsModal();
      renderPromptsTab();
    } catch (err) {
      logger.error('Failed to update prompt', { error: err.message || String(err) });
      alert('Failed to update prompt: ' + err);
    }
  });

  modal.classList.remove('hidden');
}

function showCreateCategoryModal() {
  const categoryName = prompt('Enter new category name:');
  if (categoryName && categoryName.trim()) {
    // Categories are derived from prompts, so we just need to create a prompt with this category
    // For now, we'll just switch to that category filter
    toolsState.activePromptCategory = categoryName.trim();
    renderPromptsTab();
  }
}

function showPromptContextMenu(e, promptId, isGlobal) {
  // Remove any existing context menu
  const existingMenu = document.querySelector('.prompt-context-menu');
  if (existingMenu) existingMenu.remove();

  const prompts = isGlobal ? toolsState.globalPrompts : toolsState.prompts;
  const prompt = prompts.find(p => p.id === promptId);
  if (!prompt) return;

  const menu = document.createElement('div');
  menu.className = 'prompt-context-menu';
  menu.innerHTML = `
    <button class="context-menu-item" data-action="edit">✏️ Edit</button>
    <button class="context-menu-item" data-action="pin">${prompt.pinned ? '📍 Unpin' : '📌 Pin'}</button>
    <button class="context-menu-item danger" data-action="delete">🗑️ Delete</button>
  `;

  menu.style.position = 'fixed';
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;

  document.body.appendChild(menu);

  // Handle menu item clicks
  menu.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', async () => {
      const action = item.dataset.action;
      menu.remove();

      switch (action) {
        case 'edit':
          showEditPromptModal(promptId, isGlobal);
          break;
        case 'pin':
          await togglePromptPin(promptId, isGlobal);
          break;
        case 'delete':
          if (confirm(`Delete prompt "${prompt.title}"?`)) {
            try {
              if (isGlobal) {
                await DeleteGlobalPrompt(promptId);
              } else {
                await DeletePrompt(state.activeProject.id, promptId);
              }
              renderPromptsTab();
            } catch (err) {
              logger.error('Failed to delete prompt', { error: err.message || String(err) });
              alert('Failed to delete prompt: ' + err);
            }
          }
          break;
      }
    });
  });

  // Close menu on click outside
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

async function renderAgentsTab() {
  const container = document.getElementById('agentsList');
  if (!container) return;

  if (!state.activeProject) {
    container.innerHTML = `
      <div class="tools-empty-state">
        <div class="empty-icon">🤖</div>
        <p>Select a project to view agents</p>
      </div>
    `;
    return;
  }

  try {
    // Load installed agents
    const projectAgents = await GetProjectAgents(state.activeProject.path);
    const globalAgents = await GetGlobalAgents();
    toolsState.agents = [...projectAgents, ...globalAgents];
    const installedNames = new Set(toolsState.agents.map(a => a.name));

    // Load template agents from repo
    const templateAgents = await GetTemplateAgents();
    const availableTemplates = templateAgents.filter(t => !installedNames.has(t.name));

    let html = '';

    // Installed agents section
    if (toolsState.agents.length > 0) {
      html += `
        <div class="tools-section-header">Installed Agents</div>
        ${toolsState.agents.map(agent => `
          <div class="tools-item" data-agent-path="${agent.path}">
            <div class="tools-item-info">
              <span class="tools-item-status">🤖</span>
              <div class="tools-item-details">
                <span class="tools-item-name">${agent.name}</span>
                <span class="tools-item-description">${agent.format.toUpperCase()} format</span>
              </div>
              ${agent.isGlobal ? '<span class="tools-item-badge global">Global</span>' : '<span class="tools-item-badge">Project</span>'}
            </div>
            <div class="tools-item-actions">
              <button class="tools-item-btn view-agent-btn" data-path="${agent.path}">View</button>
              <button class="tools-item-btn edit-agent-btn" data-path="${agent.path}">Edit</button>
            </div>
          </div>
        `).join('')}
      `;
    }

    // Available templates section
    if (availableTemplates.length > 0) {
      html += `
        <div class="tools-section-header">Available from Repository</div>
        ${availableTemplates.map(template => `
          <div class="tools-item template-item" data-template-path="${template.path}">
            <div class="tools-item-info">
              <span class="tools-item-status">📋</span>
              <div class="tools-item-details">
                <span class="tools-item-name">${template.name}</span>
                <span class="tools-item-description">${template.description || 'No description'}</span>
              </div>
              <span class="tools-item-badge template">Template</span>
            </div>
            <div class="tools-item-actions">
              <button class="tools-item-btn preview-template-btn" data-path="${template.path}" data-name="${template.name}">Preview</button>
              <button class="tools-item-btn install-template-btn primary" data-path="${template.path}" data-type="agent">Install</button>
            </div>
          </div>
        `).join('')}
      `;
    }

    if (!html) {
      html = `
        <div class="tools-empty-state">
          <div class="empty-icon">🤖</div>
          <p>No agents available</p>
          <p style="font-size:11px;color:var(--text-muted);margin-top:8px;">
            Clone everything-claude-code repo to repos/ folder
          </p>
        </div>
      `;
    }

    container.innerHTML = html;

    // Add click handlers for installed agents
    container.querySelectorAll('.view-agent-btn').forEach(btn => {
      btn.addEventListener('click', () => viewAgent(btn.dataset.path));
    });
    container.querySelectorAll('.edit-agent-btn').forEach(btn => {
      btn.addEventListener('click', () => editAgent(btn.dataset.path));
    });

    // Add click handlers for templates
    container.querySelectorAll('.preview-template-btn').forEach(btn => {
      btn.addEventListener('click', () => previewTemplate(btn.dataset.path, btn.dataset.name, 'agent'));
    });
    container.querySelectorAll('.install-template-btn').forEach(btn => {
      btn.addEventListener('click', () => installTemplate(btn.dataset.path, btn.dataset.type));
    });
  } catch (err) {
    logger.error('Failed to load agents', { error: err.message || String(err) });
    container.innerHTML = `
      <div class="tools-empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Error loading agents</p>
      </div>
    `;
  }
}

// Preview any template
async function previewTemplate(path, name, type) {
  try {
    const content = await GetTemplateContent(path);

    const modal = document.getElementById('toolsModal');
    const title = document.getElementById('toolsModalTitle');
    const body = document.getElementById('toolsModalBody');
    const footer = document.getElementById('toolsModalFooter');

    if (!modal || !title || !body || !footer) return;

    title.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)}: ${name}`;
    body.innerHTML = `
      <textarea class="tools-editor" readonly>${escapeHtml(content)}</textarea>
    `;
    footer.innerHTML = `
      <button id="closePreviewBtn" class="secondary-btn">Close</button>
      <button id="installFromPreviewBtn" class="primary-btn" data-path="${path}" data-type="${type}">Install to Project</button>
    `;

    footer.querySelector('#closePreviewBtn')?.addEventListener('click', closeToolsModal);
    footer.querySelector('#installFromPreviewBtn')?.addEventListener('click', async (e) => {
      await installTemplate(e.target.dataset.path, e.target.dataset.type);
      closeToolsModal();
    });

    modal.classList.remove('hidden');
  } catch (err) {
    logger.error('Failed to load template', { error: err.message || String(err) });
    alert('Failed to load template: ' + err);
  }
}

// Install template to project
async function installTemplate(templatePath, type) {
  if (!state.activeProject) {
    alert('No project selected');
    return;
  }

  try {
    switch (type) {
      case 'agent':
        await InstallTemplateAgent(state.activeProject.path, templatePath);
        renderAgentsTab();
        break;
      case 'command':
        await InstallTemplateCommand(state.activeProject.path, templatePath);
        renderCommandsTab();
        break;
      case 'skill':
        await InstallTemplateSkill(state.activeProject.path, templatePath);
        renderSkillsTab();
        break;
      case 'rule':
        await InstallTemplateRule(state.activeProject.path, templatePath);
        // Rules don't have a dedicated tab, maybe refresh current
        break;
    }
  } catch (err) {
    logger.error(`Failed to install ${type}`, { error: err.message || String(err) });
    alert(`Failed to install ${type}: ` + err);
  }
}

async function renderLibsTab() {
  const container = document.getElementById('libsList');
  if (!container) return;

  if (!state.activeProject) {
    container.innerHTML = `
      <div class="tools-empty-state">
        <div class="empty-icon">📦</div>
        <p>Select a project to view libraries</p>
      </div>
    `;
    return;
  }

  try {
    // Load installed dependencies from backend
    const libNames = RECOMMENDED_LIBS.map(lib => lib.name);
    const statuses = await CheckLibraryStatus(state.activeProject.path, libNames);
    const statusMap = new Map(statuses.map(s => [s.name, s]));

    // Merge status into recommended libs
    toolsState.libs = RECOMMENDED_LIBS.map(lib => ({
      ...lib,
      installed: statusMap.get(lib.name)?.installed || false,
      version: statusMap.get(lib.name)?.version || '',
      apps: statusMap.get(lib.name)?.apps || []
    }));

    const categories = [...new Set(toolsState.libs.map(lib => lib.category))];

    container.innerHTML = categories.map(category => {
      const libs = toolsState.libs.filter(lib => lib.category === category);
      return `
        <div class="lib-category">
          <div class="lib-category-header">${category}</div>
          <div class="tools-list">
            ${libs.map(lib => `
              <div class="tools-item" data-lib="${lib.name}">
                <div class="tools-item-info">
                  <span class="tools-item-status" title="${lib.installed ? 'Installed' : 'Not installed'}">${lib.installed ? '🟢' : '🔴'}</span>
                  <div class="tools-item-details">
                    <span class="tools-item-name">${lib.name}</span>
                    <span class="tools-item-description">${lib.description}</span>
                  </div>
                  ${lib.installed && lib.apps && lib.apps.length > 0 ?
                    lib.apps.map(app => `<span class="tools-item-badge installed">${app}</span>`).join('') :
                    ''}
                  ${lib.installed && lib.version ? `<span class="tools-item-badge">${lib.version}</span>` : ''}
                </div>
                <div class="tools-item-actions">
                  <button class="tools-item-btn view-lib-btn" data-lib="${lib.name}">Info</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers for library info
    container.querySelectorAll('.view-lib-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const libName = btn.dataset.lib;
        const lib = toolsState.libs.find(l => l.name === libName);
        if (lib) showLibraryInfo(lib);
      });
    });
  } catch (err) {
    logger.error('Failed to load library status', { error: err.message || String(err) });
    // Fall back to showing without status
    const categories = [...new Set(RECOMMENDED_LIBS.map(lib => lib.category))];

    container.innerHTML = categories.map(category => {
      const libs = RECOMMENDED_LIBS.filter(lib => lib.category === category);
      return `
        <div class="lib-category">
          <div class="lib-category-header">${category}</div>
          <div class="tools-list">
            ${libs.map(lib => `
              <div class="tools-item" data-lib="${lib.name}">
                <div class="tools-item-info">
                  <span class="tools-item-status" title="Unknown">⚪</span>
                  <div class="tools-item-details">
                    <span class="tools-item-name">${lib.name}</span>
                    <span class="tools-item-description">${lib.description}</span>
                  </div>
                </div>
                <div class="tools-item-actions">
                  <button class="tools-item-btn view-lib-btn" data-lib="${lib.name}">Info</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.view-lib-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const libName = btn.dataset.lib;
        const lib = RECOMMENDED_LIBS.find(l => l.name === libName);
        if (lib) showLibraryInfo(lib);
      });
    });
  }
}

async function renderSkillsTab() {
  const container = document.getElementById('skillsList');
  if (!container) return;

  if (!state.activeProject) {
    container.innerHTML = `
      <div class="tools-empty-state">
        <div class="empty-icon">⚡</div>
        <p>Select a project to view skills</p>
      </div>
    `;
    return;
  }

  try {
    // Load installed skills
    const installedSkills = await GetInstalledSkills(state.activeProject.path);
    const installedSet = new Set(installedSkills);

    // Load template skills from repo
    const templateSkills = await GetTemplateSkills();
    const availableTemplates = templateSkills.filter(t => !installedSet.has(t.name));

    let html = '';

    // Installed skills section
    if (installedSkills.length > 0) {
      html += `
        <div class="tools-section-header">Installed Skills</div>
        ${installedSkills.map(skillName => `
          <div class="tools-item" data-skill="${skillName}">
            <div class="tools-item-info">
              <span class="tools-item-status">⚡</span>
              <div class="tools-item-details">
                <span class="tools-item-name">${skillName}</span>
                <span class="tools-item-description">Installed in project</span>
              </div>
              <span class="tools-item-badge installed">Installed</span>
            </div>
            <div class="tools-item-actions">
              <button class="tools-item-btn" disabled>Installed</button>
            </div>
          </div>
        `).join('')}
      `;
    }

    // Available templates section
    if (availableTemplates.length > 0) {
      html += `
        <div class="tools-section-header">Available from Repository</div>
        ${availableTemplates.map(template => `
          <div class="tools-item template-item" data-template-path="${template.path}">
            <div class="tools-item-info">
              <span class="tools-item-status">📋</span>
              <div class="tools-item-details">
                <span class="tools-item-name">${template.name}</span>
                <span class="tools-item-description">${template.description || 'No description'}</span>
              </div>
              <span class="tools-item-badge template">Template</span>
            </div>
            <div class="tools-item-actions">
              <button class="tools-item-btn preview-template-btn" data-path="${template.path}" data-name="${template.name}">Preview</button>
              <button class="tools-item-btn install-template-btn primary" data-path="${template.path}" data-type="skill">Install</button>
            </div>
          </div>
        `).join('')}
      `;
    }

    if (installedSkills.length === 0 && availableTemplates.length === 0) {
      html = `
        <div class="tools-empty-state">
          <div class="empty-icon">⚡</div>
          <p>No skills available</p>
          <p style="font-size:11px;color:var(--text-muted);margin-top:8px;">
            Clone everything-claude-code repo to repos/ folder
          </p>
        </div>
      `;
    }

    container.innerHTML = html;

    // Template handlers
    container.querySelectorAll('.preview-template-btn').forEach(btn => {
      btn.addEventListener('click', () => previewTemplate(btn.dataset.path, btn.dataset.name, 'skill'));
    });
    container.querySelectorAll('.install-template-btn').forEach(btn => {
      btn.addEventListener('click', () => installTemplate(btn.dataset.path, btn.dataset.type));
    });
  } catch (err) {
    logger.error('Failed to load skills', { error: err.message || String(err) });
    container.innerHTML = `
      <div class="tools-empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Error loading skills</p>
      </div>
    `;
  }
}

async function renderHooksTab() {
  const container = document.getElementById('hooksList');
  if (!container) return;

  if (!state.activeProject) {
    container.innerHTML = `
      <div class="tools-empty-state">
        <div class="empty-icon">🪝</div>
        <p>Select a project to view hooks</p>
      </div>
    `;
    return;
  }

  try {
    // Load project hooks from backend (detailed format with eventType, matcher, description)
    const projectHooks = await GetProjectHooksDetailed(state.activeProject.path);

    // Load template hooks from repo
    const templateHooks = await GetTemplateHooks();

    // Load hook scripts from .claude/hooks/ folder
    const hookScripts = await GetProjectHookScripts(state.activeProject.path);

    toolsState.hooks = projectHooks;

    let html = '';

    // Header with create button
    html += `
      <div class="tools-header-row">
        <span class="tools-header-title">Claude Code Hooks</span>
        <button class="tools-item-btn create-hook-btn">+ New Hook</button>
      </div>
    `;

    // Installed hooks section - grouped by event type
    if (projectHooks.length > 0) {
      html += `<div class="tools-section-header">Installed Hooks</div>`;

      // Group hooks by eventType
      const groupedHooks = {};
      projectHooks.forEach(hook => {
        if (!groupedHooks[hook.eventType]) {
          groupedHooks[hook.eventType] = [];
        }
        groupedHooks[hook.eventType].push(hook);
      });

      // Render each group
      for (const eventType of Object.keys(groupedHooks).sort()) {
        const eventInfo = HOOK_EVENT_TYPES[eventType] || { icon: '🪝', label: eventType, color: '#cdd6f4' };
        const hooks = groupedHooks[eventType];

        html += `
          <div class="hooks-event-group">
            <div class="hooks-event-header" style="border-left: 3px solid ${eventInfo.color};">
              <span class="hooks-event-icon">${eventInfo.icon}</span>
              <span class="hooks-event-label">${eventInfo.label}</span>
              <span class="hooks-event-count">${hooks.length}</span>
            </div>
            ${hooks.map((hook, idx) => `
              <div class="tools-item hook-item" data-hook-type="${hook.eventType}" data-hook-matcher="${escapeHtml(hook.matcher)}">
                <div class="tools-item-info">
                  <span class="tools-item-status">🟢</span>
                  <div class="tools-item-details">
                    <span class="tools-item-name">${escapeHtml(hook.matcher || '*')}</span>
                    <span class="tools-item-description">${escapeHtml(hook.description || 'No description')}</span>
                  </div>
                </div>
                <div class="tools-item-actions">
                  <button class="tools-item-btn preview-hook-btn"
                    data-hook-type="${hook.eventType}"
                    data-hook-idx="${idx}"
                    data-is-inline="${hook.isInline}"
                    data-script-path="${escapeHtml(hook.scriptPath || '')}">
                    Preview
                  </button>
                  <button class="tools-item-btn delete-hook-btn"
                    data-hook-type="${hook.eventType}"
                    data-hook-matcher="${escapeHtml(hook.matcher)}">
                    🗑️
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }
    }

    // Hook scripts section
    if (hookScripts.length > 0) {
      html += `
        <div class="tools-section-header">Hook Scripts (.claude/hooks/)</div>
        ${hookScripts.map(script => `
          <div class="tools-item script-item">
            <div class="tools-item-info">
              <span class="tools-item-status">📜</span>
              <div class="tools-item-details">
                <span class="tools-item-name">${escapeHtml(script)}</span>
                <span class="tools-item-description">.claude/hooks/${escapeHtml(script)}</span>
              </div>
            </div>
            <div class="tools-item-actions">
              <button class="tools-item-btn view-script-btn" data-script="${escapeHtml(script)}">View</button>
            </div>
          </div>
        `).join('')}
      `;
    }

    // Available templates section
    if (templateHooks.length > 0) {
      html += `<div class="tools-section-header">Available from Repository</div>`;

      // Group template hooks by eventType
      const groupedTemplates = {};
      templateHooks.forEach(hook => {
        if (!groupedTemplates[hook.eventType]) {
          groupedTemplates[hook.eventType] = [];
        }
        groupedTemplates[hook.eventType].push(hook);
      });

      for (const eventType of Object.keys(groupedTemplates).sort()) {
        const eventInfo = HOOK_EVENT_TYPES[eventType] || { icon: '🪝', label: eventType, color: '#cdd6f4' };
        const hooks = groupedTemplates[eventType];

        html += `
          <div class="hooks-event-group template-group">
            <div class="hooks-event-header" style="border-left: 3px solid ${eventInfo.color}; opacity: 0.7;">
              <span class="hooks-event-icon">${eventInfo.icon}</span>
              <span class="hooks-event-label">${eventInfo.label}</span>
              <span class="hooks-event-count">${hooks.length}</span>
            </div>
            ${hooks.map((hook, idx) => `
              <div class="tools-item template-item hook-item" data-template-hook-type="${hook.eventType}" data-template-hook-idx="${idx}">
                <div class="tools-item-info">
                  <span class="tools-item-status">📋</span>
                  <div class="tools-item-details">
                    <span class="tools-item-name">${escapeHtml(hook.matcher || '*')}</span>
                    <span class="tools-item-description">${escapeHtml(hook.description || 'No description')}</span>
                  </div>
                  <span class="tools-item-badge template">Template</span>
                </div>
                <div class="tools-item-actions">
                  <button class="tools-item-btn preview-template-hook-btn"
                    data-hook-type="${hook.eventType}"
                    data-hook-idx="${idx}">
                    Preview
                  </button>
                  <button class="tools-item-btn install-template-hook-btn primary"
                    data-hook-type="${hook.eventType}"
                    data-hook-idx="${idx}">
                    Install
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }
    }

    if (projectHooks.length === 0 && templateHooks.length === 0) {
      html = `
        <div class="tools-empty-state">
          <div class="empty-icon">🪝</div>
          <p>No hooks configured</p>
          <button class="tools-item-btn create-hook-btn" style="margin-top:12px;">+ Create Hook</button>
        </div>
      `;
    }

    container.innerHTML = html;

    // Add event handlers
    container.querySelectorAll('.create-hook-btn').forEach(btn => {
      btn.addEventListener('click', () => showCreateHookModal());
    });

    container.querySelectorAll('.preview-hook-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const hookType = btn.dataset.hookType;
        const hookIdx = parseInt(btn.dataset.hookIdx);
        const isInline = btn.dataset.isInline === 'true';
        const scriptPath = btn.dataset.scriptPath;
        previewHook(hookType, hookIdx, isInline, scriptPath);
      });
    });

    container.querySelectorAll('.delete-hook-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const hookType = btn.dataset.hookType;
        const matcher = btn.dataset.hookMatcher;
        deleteHookConfirm(hookType, matcher);
      });
    });

    container.querySelectorAll('.view-script-btn').forEach(btn => {
      btn.addEventListener('click', () => viewHookScript(btn.dataset.script));
    });

    container.querySelectorAll('.preview-template-hook-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const hookType = btn.dataset.hookType;
        const hookIdx = parseInt(btn.dataset.hookIdx);
        const templates = await GetTemplateHooks();
        const grouped = {};
        templates.forEach(h => {
          if (!grouped[h.eventType]) grouped[h.eventType] = [];
          grouped[h.eventType].push(h);
        });
        const hook = grouped[hookType]?.[hookIdx];
        if (hook) previewTemplateHook(hook);
      });
    });

    container.querySelectorAll('.install-template-hook-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const hookType = btn.dataset.hookType;
        const hookIdx = parseInt(btn.dataset.hookIdx);
        const templates = await GetTemplateHooks();
        const grouped = {};
        templates.forEach(h => {
          if (!grouped[h.eventType]) grouped[h.eventType] = [];
          grouped[h.eventType].push(h);
        });
        const hook = grouped[hookType]?.[hookIdx];
        if (hook) installHookFromTemplate(hook);
      });
    });

  } catch (err) {
    logger.error('Failed to load hooks', { error: err.message || String(err) });
    container.innerHTML = `
      <div class="tools-empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Error loading hooks</p>
        <p style="font-size:11px;color:var(--text-muted);margin-top:8px;">${escapeHtml(err.toString())}</p>
      </div>
    `;
  }
}

// Preview installed hook content
async function previewHook(hookType, hookIdx, isInline, scriptPath) {
  const hooks = toolsState.hooks.filter(h => h.eventType === hookType);
  const hook = hooks[hookIdx];
  if (!hook) return;

  let content = '';
  if (isInline && hook.hooks && hook.hooks.length > 0) {
    // Inline script - show the command content
    content = hook.hooks[0].command || '';
  } else if (scriptPath) {
    // External script - read file content
    try {
      content = await GetHookScriptContent(state.activeProject.path, scriptPath);
    } catch (err) {
      content = `// Error loading script: ${err}\n// Path: ${scriptPath}`;
    }
  }

  showHookPreviewModal(hook, content);
}

// Preview template hook
function previewTemplateHook(hook) {
  let content = '';
  if (hook.hooks && hook.hooks.length > 0) {
    content = hook.hooks[0].command || '';
  }
  showHookPreviewModal(hook, content, true);
}

// Show hook preview modal
function showHookPreviewModal(hook, content, isTemplate = false) {
  const modal = document.getElementById('toolsModal');
  const title = document.getElementById('toolsModalTitle');
  const body = document.getElementById('toolsModalBody');
  const footer = document.getElementById('toolsModalFooter');

  if (!modal || !title || !body || !footer) return;

  const eventInfo = HOOK_EVENT_TYPES[hook.eventType] || { icon: '🪝', label: hook.eventType };

  title.textContent = `${eventInfo.icon} ${isTemplate ? 'Template' : ''} Hook: ${hook.eventType}`;
  body.innerHTML = `
    <div class="hook-preview-info">
      <div class="hook-info-row">
        <span class="hook-info-label">Event Type:</span>
        <span class="hook-info-value">${eventInfo.label}</span>
      </div>
      <div class="hook-info-row">
        <span class="hook-info-label">Matcher:</span>
        <span class="hook-info-value"><code>${escapeHtml(hook.matcher || '*')}</code></span>
      </div>
      ${hook.description ? `
        <div class="hook-info-row">
          <span class="hook-info-label">Description:</span>
          <span class="hook-info-value">${escapeHtml(hook.description)}</span>
        </div>
      ` : ''}
    </div>
    <div class="hook-preview-code">
      <div class="hook-code-header">Hook Script:</div>
      <textarea class="tools-editor" readonly>${escapeHtml(content)}</textarea>
    </div>
  `;

  footer.innerHTML = `
    <button id="closeHookPreviewBtn" class="secondary-btn">Close</button>
    ${isTemplate ? `<button id="installHookFromPreviewBtn" class="primary-btn">Install to Project</button>` : ''}
  `;

  footer.querySelector('#closeHookPreviewBtn')?.addEventListener('click', closeToolsModal);
  if (isTemplate) {
    footer.querySelector('#installHookFromPreviewBtn')?.addEventListener('click', async () => {
      await installHookFromTemplate(hook);
      closeToolsModal();
    });
  }

  modal.classList.remove('hidden');
}

// View hook script file
async function viewHookScript(scriptName) {
  try {
    const content = await GetHookScriptContent(state.activeProject.path, `.claude/hooks/${scriptName}`);

    const modal = document.getElementById('toolsModal');
    const title = document.getElementById('toolsModalTitle');
    const body = document.getElementById('toolsModalBody');
    const footer = document.getElementById('toolsModalFooter');

    if (!modal || !title || !body || !footer) return;

    title.textContent = `📜 Script: ${scriptName}`;
    body.innerHTML = `
      <textarea class="tools-editor" readonly>${escapeHtml(content)}</textarea>
    `;
    footer.innerHTML = `
      <button id="closeScriptBtn" class="primary-btn">Close</button>
    `;

    footer.querySelector('#closeScriptBtn')?.addEventListener('click', closeToolsModal);
    modal.classList.remove('hidden');
  } catch (err) {
    alert('Failed to load script: ' + err);
  }
}

// Install hook from template
async function installHookFromTemplate(hook) {
  if (!state.activeProject) {
    alert('No project selected');
    return;
  }

  try {
    await InstallTemplateHook(state.activeProject.path, hook);
    renderHooksTab();
  } catch (err) {
    logger.error('Failed to install hook', { error: err.message || String(err) });
    alert('Failed to install hook: ' + err);
  }
}

// Delete hook confirmation
async function deleteHookConfirm(hookType, matcher) {
  if (confirm(`Remove hook "${matcher}" from ${hookType}?`)) {
    try {
      await RemoveHook(state.activeProject.path, hookType, matcher);
      renderHooksTab();
    } catch (err) {
      logger.error('Failed to remove hook', { error: err.message || String(err) });
      alert('Failed to remove hook: ' + err);
    }
  }
}

// Show create hook modal
function showCreateHookModal() {
  const modal = document.getElementById('toolsModal');
  const title = document.getElementById('toolsModalTitle');
  const body = document.getElementById('toolsModalBody');
  const footer = document.getElementById('toolsModalFooter');

  if (!modal || !title || !body || !footer) return;

  title.textContent = 'Create New Hook';
  body.innerHTML = `
    <div class="hook-create-form">
      <div class="form-group">
        <label for="hookEventType">Event Type</label>
        <select id="hookEventType" class="tools-select">
          <option value="PreToolUse">PreToolUse - Before tool execution</option>
          <option value="PostToolUse">PostToolUse - After tool execution</option>
          <option value="PreCompact">PreCompact - Before context compaction</option>
          <option value="SessionStart">SessionStart - When session begins</option>
          <option value="Stop">Stop - When session ends</option>
        </select>
      </div>
      <div class="form-group">
        <label for="hookMatcher">Matcher</label>
        <input type="text" id="hookMatcher" class="tools-input" placeholder="Bash" />
        <span class="form-hint">Tool name or expression like: tool == "Bash" && tool_input.command matches "git push"</span>
      </div>
      <div class="form-group">
        <label for="hookDescription">Description</label>
        <input type="text" id="hookDescription" class="tools-input" placeholder="What this hook does" />
      </div>
      <div class="form-group">
        <label for="hookCommand">Hook Script</label>
        <textarea id="hookCommand" class="tools-editor" placeholder="#!/bin/bash
# Your hook script here
INPUT=$(cat)
echo \"$INPUT\"
exit 0"></textarea>
        <span class="form-hint">Inline bash script or path to script file (e.g., bash .claude/hooks/my-hook.sh)</span>
      </div>
    </div>
  `;

  footer.innerHTML = `
    <button id="cancelCreateHookBtn" class="secondary-btn">Cancel</button>
    <button id="createHookBtn" class="primary-btn">Create Hook</button>
  `;

  footer.querySelector('#cancelCreateHookBtn')?.addEventListener('click', closeToolsModal);
  footer.querySelector('#createHookBtn')?.addEventListener('click', async () => {
    const eventType = document.getElementById('hookEventType').value;
    const matcher = document.getElementById('hookMatcher').value.trim();
    const description = document.getElementById('hookDescription').value.trim();
    const command = document.getElementById('hookCommand').value;

    if (!matcher) {
      alert('Please enter a matcher');
      return;
    }

    try {
      const hook = {
        eventType,
        matcher,
        description,
        hooks: [{ type: 'command', command }],
        isInline: command.includes('\n') || command.startsWith('#!'),
        scriptPath: ''
      };
      await AddHookEntry(state.activeProject.path, hook);
      closeToolsModal();
      renderHooksTab();
    } catch (err) {
      logger.error('Failed to create hook', { error: err.message || String(err) });
      alert('Failed to create hook: ' + err);
    }
  });

  modal.classList.remove('hidden');
}

// ============================================
// Commands Tab
// ============================================

async function renderCommandsTab() {
  const container = document.getElementById('commandsList');
  if (!container) return;

  if (!state.activeProject) {
    container.innerHTML = `
      <div class="tools-empty-state">
        <div class="empty-icon">⌨️</div>
        <p>Select a project to view commands</p>
      </div>
    `;
    return;
  }

  try {
    // Load installed commands
    const projectCommands = await GetProjectCommands(state.activeProject.path);
    const globalCommands = await GetGlobalCommands();
    toolsState.commands = [...projectCommands, ...globalCommands];
    const installedNames = new Set(toolsState.commands.map(c => c.name));

    // Load template commands from repo
    const templateCommands = await GetTemplateCommands();
    const availableTemplates = templateCommands.filter(t => !installedNames.has(t.name));

    let html = '';

    // Header with create button
    html += `
      <div class="tools-header-row">
        <span class="tools-header-title">Slash Commands</span>
        <button class="tools-item-btn create-command-btn">+ New</button>
      </div>
    `;

    // Installed commands section
    if (toolsState.commands.length > 0) {
      html += `
        <div class="tools-section-header">Installed Commands</div>
        ${toolsState.commands.map(cmd => `
          <div class="tools-item" data-command-path="${cmd.path}">
            <div class="tools-item-info">
              <span class="tools-item-status">⌨️</span>
              <div class="tools-item-details">
                <span class="tools-item-name">/${cmd.isGlobal ? '' : 'project:'}${cmd.name}</span>
                <span class="tools-item-description">${cmd.description || 'No description'}</span>
              </div>
              ${cmd.isGlobal ? '<span class="tools-item-badge global">Global</span>' : '<span class="tools-item-badge">Project</span>'}
            </div>
            <div class="tools-item-actions">
              <button class="tools-item-btn view-command-btn" data-path="${cmd.path}">View</button>
              <button class="tools-item-btn edit-command-btn" data-path="${cmd.path}">Edit</button>
              ${!cmd.isGlobal ? `<button class="tools-item-btn delete-command-btn" data-path="${cmd.path}">🗑️</button>` : ''}
            </div>
          </div>
        `).join('')}
      `;
    }

    // Available templates section
    if (availableTemplates.length > 0) {
      html += `
        <div class="tools-section-header">Available from Repository</div>
        ${availableTemplates.map(template => `
          <div class="tools-item template-item" data-template-path="${template.path}">
            <div class="tools-item-info">
              <span class="tools-item-status">📋</span>
              <div class="tools-item-details">
                <span class="tools-item-name">/${template.name}</span>
                <span class="tools-item-description">${template.description || 'No description'}</span>
              </div>
              <span class="tools-item-badge template">Template</span>
            </div>
            <div class="tools-item-actions">
              <button class="tools-item-btn preview-template-btn" data-path="${template.path}" data-name="${template.name}">Preview</button>
              <button class="tools-item-btn install-template-btn primary" data-path="${template.path}" data-type="command">Install</button>
            </div>
          </div>
        `).join('')}
      `;
    }

    if (toolsState.commands.length === 0 && availableTemplates.length === 0) {
      html = `
        <div class="tools-empty-state">
          <div class="empty-icon">⌨️</div>
          <p>No commands available</p>
          <button class="tools-item-btn create-command-btn" style="margin-top:12px;">+ Create Command</button>
        </div>
      `;
    }

    container.innerHTML = html;

    // Add click handlers
    container.querySelectorAll('.create-command-btn').forEach(btn => {
      btn.addEventListener('click', () => showCreateCommandModal());
    });
    container.querySelectorAll('.view-command-btn').forEach(btn => {
      btn.addEventListener('click', () => viewCommand(btn.dataset.path));
    });
    container.querySelectorAll('.edit-command-btn').forEach(btn => {
      btn.addEventListener('click', () => editCommand(btn.dataset.path));
    });
    container.querySelectorAll('.delete-command-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteCommandConfirm(btn.dataset.path));
    });

    // Template handlers
    container.querySelectorAll('.preview-template-btn').forEach(btn => {
      btn.addEventListener('click', () => previewTemplate(btn.dataset.path, btn.dataset.name, 'command'));
    });
    container.querySelectorAll('.install-template-btn').forEach(btn => {
      btn.addEventListener('click', () => installTemplate(btn.dataset.path, btn.dataset.type));
    });
  } catch (err) {
    logger.error('Failed to load commands', { error: err.message || String(err) });
    container.innerHTML = `
      <div class="tools-empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Error loading commands</p>
      </div>
    `;
  }
}

// View command content (read-only)
async function viewCommand(path) {
  try {
    const content = await GetCommandContent(path);
    const cmd = toolsState.commands.find(c => c.path === path);

    const modal = document.getElementById('toolsModal');
    const title = document.getElementById('toolsModalTitle');
    const body = document.getElementById('toolsModalBody');
    const footer = document.getElementById('toolsModalFooter');

    if (!modal || !title || !body || !footer) return;

    toolsState.modalMode = 'view';
    toolsState.modalItem = { path, content };

    title.textContent = `View: /${cmd?.name || 'Command'}`;
    body.innerHTML = `
      <textarea class="tools-editor" readonly>${escapeHtml(content)}</textarea>
    `;
    footer.innerHTML = `
      <button id="closeCommandViewBtn" class="primary-btn">Close</button>
    `;

    footer.querySelector('#closeCommandViewBtn')?.addEventListener('click', closeToolsModal);
    modal.classList.remove('hidden');
  } catch (err) {
    logger.error('Failed to load command', { error: err.message || String(err) });
    alert('Failed to load command content');
  }
}

// Edit command content
async function editCommand(path) {
  try {
    const content = await GetCommandContent(path);
    const cmd = toolsState.commands.find(c => c.path === path);

    const modal = document.getElementById('toolsModal');
    const title = document.getElementById('toolsModalTitle');
    const body = document.getElementById('toolsModalBody');
    const footer = document.getElementById('toolsModalFooter');

    if (!modal || !title || !body || !footer) return;

    toolsState.modalMode = 'edit';
    toolsState.modalItem = { path, content };

    title.textContent = `Edit: /${cmd?.name || 'Command'}`;
    body.innerHTML = `
      <textarea class="tools-editor" id="commandEditor">${escapeHtml(content)}</textarea>
    `;
    footer.innerHTML = `
      <button id="cancelCommandEditBtn" class="secondary-btn">Cancel</button>
      <button id="saveCommandBtn" class="primary-btn">Save</button>
    `;

    footer.querySelector('#cancelCommandEditBtn')?.addEventListener('click', closeToolsModal);
    footer.querySelector('#saveCommandBtn')?.addEventListener('click', async () => {
      const editor = document.getElementById('commandEditor');
      if (editor) {
        try {
          await SaveCommandContent(path, editor.value);
          closeToolsModal();
          renderCommandsTab();
        } catch (err) {
          logger.error('Failed to save command', { error: err.message || String(err) });
          alert('Failed to save command: ' + err);
        }
      }
    });

    modal.classList.remove('hidden');
  } catch (err) {
    logger.error('Failed to load command', { error: err.message || String(err) });
    alert('Failed to load command content');
  }
}

// Show create command modal
function showCreateCommandModal() {
  const modal = document.getElementById('toolsModal');
  const title = document.getElementById('toolsModalTitle');
  const body = document.getElementById('toolsModalBody');
  const footer = document.getElementById('toolsModalFooter');

  if (!modal || !title || !body || !footer) return;

  toolsState.modalMode = 'create';
  toolsState.modalItem = null;

  title.textContent = 'Create New Command';
  body.innerHTML = `
    <div class="command-create-form">
      <div class="form-group">
        <label for="commandName">Command Name</label>
        <input type="text" id="commandName" placeholder="my-command" class="tools-input" />
        <span class="form-hint">Will be invoked as /project:my-command</span>
      </div>
      <div class="form-group">
        <label for="commandContent">Command Prompt</label>
        <textarea id="commandContent" class="tools-editor" placeholder="---
description: My custom command
---

Your command instructions here...

Use $ARGUMENTS to include user arguments."></textarea>
      </div>
    </div>
  `;
  footer.innerHTML = `
    <button id="cancelCreateCommandBtn" class="secondary-btn">Cancel</button>
    <button id="createCommandBtn" class="primary-btn">Create</button>
  `;

  footer.querySelector('#cancelCreateCommandBtn')?.addEventListener('click', closeToolsModal);
  footer.querySelector('#createCommandBtn')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('commandName');
    const contentInput = document.getElementById('commandContent');

    if (!nameInput.value.trim()) {
      alert('Please enter a command name');
      return;
    }

    try {
      await CreateCommand(state.activeProject.path, nameInput.value.trim(), contentInput.value);
      closeToolsModal();
      renderCommandsTab();
    } catch (err) {
      logger.error('Failed to create command', { error: err.message || String(err) });
      alert('Failed to create command: ' + err);
    }
  });

  modal.classList.remove('hidden');
}

// Delete command confirmation
async function deleteCommandConfirm(path) {
  const cmd = toolsState.commands.find(c => c.path === path);
  if (confirm(`Delete command "/${cmd?.name}"?`)) {
    try {
      await DeleteCommand(path);
      renderCommandsTab();
    } catch (err) {
      logger.error('Failed to delete command', { error: err.message || String(err) });
      alert('Failed to delete command: ' + err);
    }
  }
}

// ============================================
// MCP Tab
// ============================================

async function renderMcpTab() {
  const container = document.getElementById('mcpList');
  if (!container) return;

  if (!state.activeProject) {
    container.innerHTML = `
      <div class="tools-empty-state">
        <div class="empty-icon">🔌</div>
        <p>Select a project to view MCP servers</p>
      </div>
    `;
    return;
  }

  try {
    // Load installed MCP servers
    const projectServers = await GetProjectMCPServers(state.activeProject.path);
    const userServers = await GetUserMCPServers();
    const markedUserServers = userServers.map(s => ({ ...s, scope: 'user' }));
    toolsState.mcpServers = [...projectServers, ...markedUserServers];
    const installedNames = new Set(toolsState.mcpServers.map(s => s.name));

    // Load template MCP servers from repo
    const templateServers = await GetTemplateMCPServers();
    const availableTemplates = templateServers.filter(t => !installedNames.has(t.name));

    let html = '';

    // Header with add button
    html += `
      <div class="tools-header-row">
        <span class="tools-header-title">MCP Servers</span>
        <button class="tools-item-btn add-mcp-btn">+ Add</button>
      </div>
    `;

    // Installed servers section
    if (toolsState.mcpServers.length > 0) {
      html += `
        <div class="tools-section-header">Installed Servers</div>
        ${toolsState.mcpServers.map(server => `
          <div class="tools-item" data-mcp-name="${server.name}">
            <div class="tools-item-info">
              <span class="tools-item-status">${server.type === 'stdio' ? '💻' : '🌐'}</span>
              <div class="tools-item-details">
                <span class="tools-item-name">${server.name}</span>
                <span class="tools-item-description">${server.type === 'stdio' ? server.command : server.url || 'No URL'}</span>
              </div>
              <span class="tools-item-badge ${server.scope === 'user' ? 'global' : ''}">${server.scope === 'user' ? 'User' : 'Project'}</span>
            </div>
            <div class="tools-item-actions">
              <button class="tools-item-btn view-mcp-btn" data-name="${server.name}">View</button>
              ${server.scope === 'project' ? `<button class="tools-item-btn delete-mcp-btn" data-name="${server.name}">🗑️</button>` : ''}
            </div>
          </div>
        `).join('')}
      `;
    }

    // Available templates section
    if (availableTemplates.length > 0) {
      html += `
        <div class="tools-section-header">Available from Repository</div>
        ${availableTemplates.map(server => `
          <div class="tools-item template-item" data-mcp-name="${server.name}">
            <div class="tools-item-info">
              <span class="tools-item-status">📋</span>
              <div class="tools-item-details">
                <span class="tools-item-name">${server.name}</span>
                <span class="tools-item-description">${server.command || server.url || 'No description'}</span>
              </div>
              <span class="tools-item-badge template">Template</span>
            </div>
            <div class="tools-item-actions">
              <button class="tools-item-btn view-mcp-template-btn" data-name="${server.name}">View</button>
              <button class="tools-item-btn install-mcp-template-btn primary" data-name="${server.name}">Install</button>
            </div>
          </div>
        `).join('')}
      `;
    }

    if (toolsState.mcpServers.length === 0 && availableTemplates.length === 0) {
      html = `
        <div class="tools-empty-state">
          <div class="empty-icon">🔌</div>
          <p>No MCP servers available</p>
          <button class="tools-item-btn add-mcp-btn" style="margin-top:12px;">+ Add MCP Server</button>
        </div>
      `;
    }

    container.innerHTML = html;

    // Add click handlers
    container.querySelectorAll('.add-mcp-btn').forEach(btn => {
      btn.addEventListener('click', () => showAddMcpModal());
    });
    container.querySelectorAll('.view-mcp-btn').forEach(btn => {
      btn.addEventListener('click', () => viewMcpServer(btn.dataset.name));
    });
    container.querySelectorAll('.delete-mcp-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteMcpServerConfirm(btn.dataset.name));
    });

    // Template handlers
    container.querySelectorAll('.view-mcp-template-btn').forEach(btn => {
      btn.addEventListener('click', () => viewMcpTemplate(btn.dataset.name));
    });
    container.querySelectorAll('.install-mcp-template-btn').forEach(btn => {
      btn.addEventListener('click', () => installMcpTemplate(btn.dataset.name));
    });
  } catch (err) {
    logger.error('Failed to load MCP servers', { error: err.message || String(err) });
    container.innerHTML = `
      <div class="tools-empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Error loading MCP servers</p>
      </div>
    `;
  }
}

// View MCP template details
async function viewMcpTemplate(name) {
  const templateServers = await GetTemplateMCPServers();
  const server = templateServers.find(s => s.name === name);
  if (!server) return;

  const modal = document.getElementById('toolsModal');
  const title = document.getElementById('toolsModalTitle');
  const body = document.getElementById('toolsModalBody');
  const footer = document.getElementById('toolsModalFooter');

  if (!modal || !title || !body || !footer) return;

  const envEntries = server.env ? Object.entries(server.env) : [];

  title.textContent = `MCP Template: ${server.name}`;
  body.innerHTML = `
    <div class="mcp-info-content">
      <div class="mcp-info-row">
        <span class="mcp-info-label">Name:</span>
        <span class="mcp-info-value">${server.name}</span>
      </div>
      <div class="mcp-info-row">
        <span class="mcp-info-label">Type:</span>
        <span class="mcp-info-value">${server.type || 'stdio'}</span>
      </div>
      ${server.command ? `
        <div class="mcp-info-row">
          <span class="mcp-info-label">Command:</span>
          <span class="mcp-info-value"><code>${server.command}</code></span>
        </div>
      ` : ''}
      ${server.args && server.args.length > 0 ? `
        <div class="mcp-info-row">
          <span class="mcp-info-label">Args:</span>
          <span class="mcp-info-value"><code>${server.args.join(' ')}</code></span>
        </div>
      ` : ''}
      ${envEntries.length > 0 ? `
        <div class="mcp-info-row">
          <span class="mcp-info-label">Required Env:</span>
          <div class="mcp-info-env">
            ${envEntries.map(([key]) => `<code>${key}</code>`).join(', ')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  footer.innerHTML = `
    <button id="closeMcpTemplateBtn" class="secondary-btn">Close</button>
    <button id="installMcpTemplateBtn" class="primary-btn" data-name="${name}">Install to Project</button>
  `;

  footer.querySelector('#closeMcpTemplateBtn')?.addEventListener('click', closeToolsModal);
  footer.querySelector('#installMcpTemplateBtn')?.addEventListener('click', async (e) => {
    await installMcpTemplate(e.target.dataset.name);
    closeToolsModal();
  });

  modal.classList.remove('hidden');
}

// Install MCP template to project
async function installMcpTemplate(name) {
  if (!state.activeProject) {
    alert('No project selected');
    return;
  }

  const templateServers = await GetTemplateMCPServers();
  const server = templateServers.find(s => s.name === name);
  if (!server) return;

  try {
    await AddMCPServer(state.activeProject.path, {
      name: server.name,
      type: server.type || 'stdio',
      command: server.command || '',
      args: server.args || [],
      url: server.url || '',
      env: server.env || {},
      scope: 'project'
    });
    renderMcpTab();
  } catch (err) {
    logger.error('Failed to install MCP server', { error: err.message || String(err) });
    alert('Failed to install MCP server: ' + err);
  }
}

// View MCP server details
function viewMcpServer(name) {
  const server = toolsState.mcpServers.find(s => s.name === name);
  if (!server) return;

  const modal = document.getElementById('toolsModal');
  const title = document.getElementById('toolsModalTitle');
  const body = document.getElementById('toolsModalBody');
  const footer = document.getElementById('toolsModalFooter');

  if (!modal || !title || !body || !footer) return;

  toolsState.modalMode = 'view';
  toolsState.modalItem = server;

  const envEntries = server.env ? Object.entries(server.env) : [];

  title.textContent = `MCP Server: ${server.name}`;
  body.innerHTML = `
    <div class="mcp-info-content">
      <div class="mcp-info-row">
        <span class="mcp-info-label">Name:</span>
        <span class="mcp-info-value">${server.name}</span>
      </div>
      <div class="mcp-info-row">
        <span class="mcp-info-label">Type:</span>
        <span class="mcp-info-value">${server.type || 'stdio'}</span>
      </div>
      <div class="mcp-info-row">
        <span class="mcp-info-label">Scope:</span>
        <span class="mcp-info-value">${server.scope === 'user' ? 'User (global)' : 'Project'}</span>
      </div>
      ${server.command ? `
        <div class="mcp-info-row">
          <span class="mcp-info-label">Command:</span>
          <span class="mcp-info-value"><code>${server.command}</code></span>
        </div>
      ` : ''}
      ${server.args && server.args.length > 0 ? `
        <div class="mcp-info-row">
          <span class="mcp-info-label">Args:</span>
          <span class="mcp-info-value"><code>${server.args.join(' ')}</code></span>
        </div>
      ` : ''}
      ${server.url ? `
        <div class="mcp-info-row">
          <span class="mcp-info-label">URL:</span>
          <span class="mcp-info-value"><code>${server.url}</code></span>
        </div>
      ` : ''}
      ${envEntries.length > 0 ? `
        <div class="mcp-info-row">
          <span class="mcp-info-label">Environment:</span>
          <div class="mcp-info-env">
            ${envEntries.map(([key, val]) => `
              <div class="mcp-env-entry">
                <code>${key}</code>=<code>${val.startsWith('$') ? val : '***'}</code>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  footer.innerHTML = `
    <button id="closeMcpViewBtn" class="primary-btn">Close</button>
  `;

  footer.querySelector('#closeMcpViewBtn')?.addEventListener('click', closeToolsModal);
  modal.classList.remove('hidden');
}

// Show add MCP server modal
function showAddMcpModal() {
  const modal = document.getElementById('toolsModal');
  const title = document.getElementById('toolsModalTitle');
  const body = document.getElementById('toolsModalBody');
  const footer = document.getElementById('toolsModalFooter');

  if (!modal || !title || !body || !footer) return;

  toolsState.modalMode = 'create';
  toolsState.modalItem = null;

  title.textContent = 'Add MCP Server';
  body.innerHTML = `
    <div class="mcp-create-form">
      <div class="form-group">
        <label for="mcpName">Server Name</label>
        <input type="text" id="mcpName" placeholder="my-server" class="tools-input" />
      </div>
      <div class="form-group">
        <label for="mcpType">Type</label>
        <select id="mcpType" class="tools-select">
          <option value="stdio">stdio (command)</option>
          <option value="http">http (URL)</option>
        </select>
      </div>
      <div id="mcpStdioFields">
        <div class="form-group">
          <label for="mcpCommand">Command</label>
          <input type="text" id="mcpCommand" placeholder="npx" class="tools-input" />
        </div>
        <div class="form-group">
          <label for="mcpArgs">Arguments (space separated)</label>
          <input type="text" id="mcpArgs" placeholder="-y @modelcontextprotocol/server-name" class="tools-input" />
        </div>
      </div>
      <div id="mcpHttpFields" style="display:none;">
        <div class="form-group">
          <label for="mcpUrl">URL</label>
          <input type="text" id="mcpUrl" placeholder="https://mcp.example.com/mcp" class="tools-input" />
        </div>
      </div>
      <div class="form-group">
        <label for="mcpEnv">Environment Variables (KEY=value, one per line)</label>
        <textarea id="mcpEnv" class="tools-textarea" placeholder="API_KEY=your-key-here"></textarea>
      </div>
    </div>
  `;

  // Toggle fields based on type
  const typeSelect = body.querySelector('#mcpType');
  const stdioFields = body.querySelector('#mcpStdioFields');
  const httpFields = body.querySelector('#mcpHttpFields');

  typeSelect?.addEventListener('change', () => {
    if (typeSelect.value === 'stdio') {
      stdioFields.style.display = 'block';
      httpFields.style.display = 'none';
    } else {
      stdioFields.style.display = 'none';
      httpFields.style.display = 'block';
    }
  });

  footer.innerHTML = `
    <button id="cancelAddMcpBtn" class="secondary-btn">Cancel</button>
    <button id="addMcpBtn" class="primary-btn">Add Server</button>
  `;

  footer.querySelector('#cancelAddMcpBtn')?.addEventListener('click', closeToolsModal);
  footer.querySelector('#addMcpBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('mcpName')?.value?.trim();
    const type = document.getElementById('mcpType')?.value;
    const command = document.getElementById('mcpCommand')?.value?.trim();
    const argsStr = document.getElementById('mcpArgs')?.value?.trim();
    const url = document.getElementById('mcpUrl')?.value?.trim();
    const envStr = document.getElementById('mcpEnv')?.value?.trim();

    if (!name) {
      alert('Please enter a server name');
      return;
    }

    // Parse args
    const args = argsStr ? argsStr.split(/\s+/) : [];

    // Parse env
    const env = {};
    if (envStr) {
      envStr.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          env[key.trim()] = valueParts.join('=').trim();
        }
      });
    }

    const server = {
      name,
      type,
      command: type === 'stdio' ? command : '',
      args: type === 'stdio' ? args : [],
      url: type === 'http' ? url : '',
      env,
      scope: 'project'
    };

    try {
      await AddMCPServer(state.activeProject.path, server);
      closeToolsModal();
      renderMcpTab();
    } catch (err) {
      logger.error('Failed to add MCP server', { error: err.message || String(err) });
      alert('Failed to add MCP server: ' + err);
    }
  });

  modal.classList.remove('hidden');
}

// Delete MCP server confirmation
async function deleteMcpServerConfirm(name) {
  if (confirm(`Remove MCP server "${name}" from this project?`)) {
    try {
      await RemoveMCPServer(state.activeProject.path, name);
      renderMcpTab();
    } catch (err) {
      logger.error('Failed to remove MCP server', { error: err.message || String(err) });
      alert('Failed to remove MCP server: ' + err);
    }
  }
}

function showLibraryInfo(lib) {
  toolsState.modalMode = 'info';
  toolsState.modalItem = lib;

  const modal = document.getElementById('toolsModal');
  const title = document.getElementById('toolsModalTitle');
  const body = document.getElementById('toolsModalBody');
  const footer = document.getElementById('toolsModalFooter');

  if (!modal || !title || !body || !footer) return;

  title.textContent = lib.name;
  body.innerHTML = `
    <div class="lib-info-content">
      <div class="lib-info-header">
        <span class="lib-info-name">${lib.name}</span>
        <span class="lib-info-category">${lib.category}</span>
      </div>
      <p class="lib-info-description">${lib.description}</p>
      <div class="lib-info-install">
        <code>npm install ${lib.name}</code>
        <button class="lib-info-copy" data-cmd="npm install ${lib.name}">Copy</button>
      </div>
    </div>
  `;

  footer.innerHTML = `
    <button id="closeLibInfoBtn" class="primary-btn">Close</button>
  `;

  // Add event listeners
  body.querySelector('.lib-info-copy')?.addEventListener('click', (e) => {
    const cmd = e.target.dataset.cmd;
    navigator.clipboard.writeText(cmd);
    e.target.textContent = 'Copied!';
    setTimeout(() => { e.target.textContent = 'Copy'; }, 1500);
  });

  footer.querySelector('#closeLibInfoBtn')?.addEventListener('click', closeToolsModal);

  modal.classList.remove('hidden');
}

// View agent content (read-only)
async function viewAgent(path) {
  try {
    const content = await GetAgentContent(path);
    const agent = toolsState.agents.find(a => a.path === path);

    const modal = document.getElementById('toolsModal');
    const title = document.getElementById('toolsModalTitle');
    const body = document.getElementById('toolsModalBody');
    const footer = document.getElementById('toolsModalFooter');

    if (!modal || !title || !body || !footer) return;

    toolsState.modalMode = 'view';
    toolsState.modalItem = { path, content };

    title.textContent = `View: ${agent?.name || 'Agent'}`;
    body.innerHTML = `
      <textarea class="tools-editor" readonly>${escapeHtml(content)}</textarea>
    `;
    footer.innerHTML = `
      <button id="closeAgentViewBtn" class="primary-btn">Close</button>
    `;

    footer.querySelector('#closeAgentViewBtn')?.addEventListener('click', closeToolsModal);
    modal.classList.remove('hidden');
  } catch (err) {
    logger.error('Failed to load agent', { error: err.message || String(err) });
    alert('Failed to load agent content');
  }
}

// Edit agent content
async function editAgent(path) {
  try {
    const content = await GetAgentContent(path);
    const agent = toolsState.agents.find(a => a.path === path);

    const modal = document.getElementById('toolsModal');
    const title = document.getElementById('toolsModalTitle');
    const body = document.getElementById('toolsModalBody');
    const footer = document.getElementById('toolsModalFooter');

    if (!modal || !title || !body || !footer) return;

    toolsState.modalMode = 'edit';
    toolsState.modalItem = { path, content };

    title.textContent = `Edit: ${agent?.name || 'Agent'}`;
    body.innerHTML = `
      <textarea class="tools-editor" id="agentEditor">${escapeHtml(content)}</textarea>
    `;
    footer.innerHTML = `
      <button id="cancelAgentEditBtn" class="secondary-btn">Cancel</button>
      <button id="saveAgentBtn" class="primary-btn">Save</button>
    `;

    footer.querySelector('#cancelAgentEditBtn')?.addEventListener('click', closeToolsModal);
    footer.querySelector('#saveAgentBtn')?.addEventListener('click', async () => {
      const editor = document.getElementById('agentEditor');
      if (editor) {
        try {
          await SaveAgentContent(path, editor.value);
          closeToolsModal();
          renderAgentsTab();
        } catch (err) {
          logger.error('Failed to save agent', { error: err.message || String(err) });
          alert('Failed to save agent: ' + err);
        }
      }
    });

    modal.classList.remove('hidden');
  } catch (err) {
    logger.error('Failed to load agent', { error: err.message || String(err) });
    alert('Failed to load agent content');
  }
}

// Install skill
async function doInstallSkill(skillName) {
  if (!state.activeProject) {
    alert('No project selected');
    return;
  }

  try {
    await InstallSkill(state.activeProject.path, skillName);
    alert(`Skill "${skillName}" installed successfully!`);
    renderSkillsTab();
  } catch (err) {
    logger.error('Failed to install skill', { error: err.message || String(err) });
    alert('Failed to install skill: ' + err);
  }
}

// Install hook
async function doInstallHook(hookName) {
  if (!state.activeProject) {
    alert('No project selected');
    return;
  }

  try {
    await InstallHook(state.activeProject.path, hookName);
    alert(`Hook "${hookName}" installed successfully!`);
    renderHooksTab();
  } catch (err) {
    logger.error('Failed to install hook', { error: err.message || String(err) });
    alert('Failed to install hook: ' + err);
  }
}

// Render CLAUDE.md editor tab
async function renderClaudemdTab() {
  const container = document.getElementById('claudemdEditor');
  if (!container) return;

  if (!state.activeProject) {
    container.innerHTML = `
      <div class="tools-empty-state">
        <div class="empty-icon">📄</div>
        <p>Select a project to edit CLAUDE.md</p>
      </div>
    `;
    return;
  }

  try {
    // Load content only if not dirty (preserve unsaved changes)
    if (!toolsState.claudemdDirty) {
      toolsState.claudemd = await GetClaudemd(state.activeProject.path);
    }

    // Configure marked for safe rendering
    marked.setOptions({
      breaks: true,
      gfm: true
    });

    const renderedMarkdown = marked.parse(toolsState.claudemd || '');
    const isPreviewMode = toolsState.claudemdPreview || false;

    container.innerHTML = `
      <div class="claudemd-editor">
        <div class="claudemd-toolbar">
          <div class="claudemd-toolbar-left">
            <span class="claudemd-filepath">CLAUDE.md</span>
            ${toolsState.claudemdDirty ? '<span class="claudemd-dirty">• Unsaved</span>' : ''}
          </div>
          <div class="claudemd-toolbar-right">
            <div class="claudemd-mode-toggle">
              <button class="claudemd-mode-btn ${!isPreviewMode ? 'active' : ''}" id="claudemdEditMode">Edit</button>
              <button class="claudemd-mode-btn ${isPreviewMode ? 'active' : ''}" id="claudemdPreviewMode">Preview</button>
            </div>
            <button class="claudemd-btn claudemd-save-btn" id="saveClaudemdBtn" ${!toolsState.claudemdDirty ? 'disabled' : ''}>
              💾 Save
            </button>
          </div>
        </div>
        <div class="claudemd-content">
          <textarea
            id="claudemdTextarea"
            class="claudemd-textarea ${isPreviewMode ? 'hidden' : ''}"
            placeholder="# Project Instructions for Claude

Add instructions, context, and guidelines for Claude when working with this project.

## Common sections:
- Project overview
- Code style preferences
- Important files and directories
- Testing guidelines
- Deployment notes"
          >${escapeHtml(toolsState.claudemd)}</textarea>
          <div id="claudemdPreview" class="claudemd-preview ${!isPreviewMode ? 'hidden' : ''}">${renderedMarkdown}</div>
        </div>
      </div>
    `;

    // Add event listeners
    const textarea = document.getElementById('claudemdTextarea');
    const preview = document.getElementById('claudemdPreview');
    const saveBtn = document.getElementById('saveClaudemdBtn');
    const editModeBtn = document.getElementById('claudemdEditMode');
    const previewModeBtn = document.getElementById('claudemdPreviewMode');

    // Mode toggle
    editModeBtn?.addEventListener('click', () => {
      toolsState.claudemdPreview = false;
      textarea.classList.remove('hidden');
      preview.classList.add('hidden');
      editModeBtn.classList.add('active');
      previewModeBtn.classList.remove('active');
      textarea.focus();
    });

    previewModeBtn?.addEventListener('click', () => {
      toolsState.claudemdPreview = true;
      preview.innerHTML = marked.parse(toolsState.claudemd || '');
      textarea.classList.add('hidden');
      preview.classList.remove('hidden');
      editModeBtn.classList.remove('active');
      previewModeBtn.classList.add('active');
    });

    if (textarea) {
      textarea.addEventListener('input', () => {
        toolsState.claudemd = textarea.value;
        toolsState.claudemdDirty = true;
        saveBtn.disabled = false;

        // Update dirty indicator
        const dirtyIndicator = container.querySelector('.claudemd-dirty');
        if (!dirtyIndicator) {
          const filepath = container.querySelector('.claudemd-filepath');
          if (filepath) {
            filepath.insertAdjacentHTML('afterend', '<span class="claudemd-dirty">• Unsaved</span>');
          }
        }
      });

      // Handle Ctrl+S / Cmd+S to save
      textarea.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          if (toolsState.claudemdDirty) {
            saveClaudemd();
          }
        }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', saveClaudemd);
    }
  } catch (err) {
    logger.error('Failed to load CLAUDE.md', { error: err.message || String(err) });
    container.innerHTML = `
      <div class="tools-empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Error loading CLAUDE.md</p>
      </div>
    `;
  }
}

// Save CLAUDE.md content
async function saveClaudemd() {
  if (!state.activeProject) return;

  try {
    await SaveClaudemd(state.activeProject.path, toolsState.claudemd);
    toolsState.claudemdDirty = false;

    // Update UI
    const dirtyIndicator = document.querySelector('.claudemd-dirty');
    if (dirtyIndicator) {
      dirtyIndicator.remove();
    }
    const saveBtn = document.getElementById('saveClaudemdBtn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '✓ Saved';
      setTimeout(() => {
        saveBtn.textContent = '💾 Save';
      }, 1500);
    }
  } catch (err) {
    logger.error('Failed to save CLAUDE.md', { error: err.message || String(err) });
    alert('Failed to save CLAUDE.md: ' + err);
  }
}

export function closeToolsModal() {
  const modal = document.getElementById('toolsModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('fullscreen');
  }
  toolsState.modalMode = null;
  toolsState.modalItem = null;
}

function toggleModalFullscreen() {
  const modal = document.getElementById('toolsModal');
  const btn = document.getElementById('fullscreenToolsModal');
  if (modal) {
    modal.classList.toggle('fullscreen');
    if (btn) {
      btn.textContent = modal.classList.contains('fullscreen') ? '⛶' : '⛶';
      btn.title = modal.classList.contains('fullscreen') ? 'Exit fullscreen' : 'Toggle fullscreen';
    }
  }
}

// Refresh tools panel when project changes
export function refreshToolsPanel() {
  // Reset CLAUDE.md state when project changes
  toolsState.claudemd = '';
  toolsState.claudemdDirty = false;
  toolsState.claudemdPreview = false;

  // Reset prompts state when project changes
  toolsState.prompts = [];
  toolsState.promptCategories = [];
  toolsState.activePromptCategory = 'all';
  // Note: globalPrompts persist across project switches

  // Restore minimized state from toolsState (global, not per-project)
  restoreToolsPanelState();

  if (state.activeProject) {
    renderToolsPanel();
  }
}

// Restore tools panel CSS state from toolsState.minimized
function restoreToolsPanelState() {
  const panel = document.getElementById('projectToolsPanel');
  const resizer = document.getElementById('toolsPanelResizer');
  const panelContent = document.querySelector('.main-panel > .panel-content');
  const collapseBtn = document.getElementById('collapseToolsPanel');

  if (!panel) return;

  if (toolsState.minimized) {
    panel.classList.add('minimized');
    if (resizer) resizer.style.display = 'none';
    if (panelContent) panelContent.style.flex = '1 1 auto';
    if (collapseBtn) { collapseBtn.textContent = '▲'; collapseBtn.title = 'Expand panel'; }
  } else {
    panel.classList.remove('minimized');
    if (resizer) resizer.style.display = 'flex';
    if (panelContent && panel) {
      panelContent.style.flex = `1 1 ${100 - toolsState.panelHeight}%`;
      panel.style.flex = `0 0 ${toolsState.panelHeight}%`;
    }
    if (collapseBtn) { collapseBtn.textContent = '▼'; collapseBtn.title = 'Minimize panel'; }
  }
}

// ============================================
// Project Switcher Handler
// ============================================

/**
 * Initialize tools panel handler for project switching
 * Call this during app initialization
 */
export function initToolsPanelHandler() {
  registerStateHandler('toolsPanel', {
    priority: 100,

    onBeforeSwitch: async (ctx) => {
      // Nothing to cleanup for tools panel
    },

    onSave: async (ctx) => {
      // Tools panel state is saved as needed
    },

    onLoad: async (ctx) => {
      // Tools panel will be refreshed in onAfterSwitch
    },

    onAfterSwitch: async (ctx) => {
      // Refresh tools panel after project switch
      refreshToolsPanel();
    }
  });
}
