import { state } from './state.js';
import { registerStateHandler } from './project-switcher.js';

// Special tab ID for Dashboard (Todo List)
export const DASHBOARD_TAB_ID = 'tab-dashboard';

// Project todos storage
let projectTodos = new Map(); // projectId -> todos[]

// Callbacks for backend operations
let todoDashboardCallbacks = {
  getTodos: async () => [],
  saveTodos: async () => {}
};

export function setTodoDashboardCallbacks(callbacks) {
  todoDashboardCallbacks = { ...todoDashboardCallbacks, ...callbacks };
}

// Generate unique ID
function generateId() {
  return `todo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Get current project's todos
function getCurrentTodos() {
  if (!state.activeProject) return [];
  if (!projectTodos.has(state.activeProject.id)) {
    projectTodos.set(state.activeProject.id, []);
  }
  return projectTodos.get(state.activeProject.id);
}

// Set current project's todos
function setCurrentTodos(todos) {
  if (!state.activeProject) return;
  projectTodos.set(state.activeProject.id, todos);
}

// Load todos from backend for current project
export async function loadTodos() {
  if (!state.activeProject) return;

  try {
    const todos = await todoDashboardCallbacks.getTodos(state.activeProject.id);
    if (todos && Array.isArray(todos)) {
      // Convert timestamps from string to Date if needed
      const converted = todos.map(todo => ({
        ...todo,
        createdAt: todo.createdAt ? new Date(todo.createdAt) : new Date()
      }));
      projectTodos.set(state.activeProject.id, converted);
    } else {
      projectTodos.set(state.activeProject.id, []);
    }
  } catch (err) {
    console.error('Failed to load todos:', err);
    projectTodos.set(state.activeProject.id, []);
  }

  renderTodoDashboard();
}

// Save todos to backend
async function saveTodos() {
  if (!state.activeProject) return;

  const todos = getCurrentTodos();
  try {
    await todoDashboardCallbacks.saveTodos(state.activeProject.id, todos.map(todo => ({
      ...todo,
      createdAt: todo.createdAt instanceof Date ? todo.createdAt.toISOString() : todo.createdAt
    })));
  } catch (err) {
    console.error('Failed to save todos:', err);
  }
}

// Add a new todo
function addTodo(text) {
  if (!text.trim()) return;

  const todos = getCurrentTodos();
  const newTodo = {
    id: generateId(),
    text: text.trim(),
    completed: false,
    createdAt: new Date()
  };

  todos.push(newTodo);
  setCurrentTodos(todos);
  saveTodos();
  renderTodoDashboard();
}

// Toggle todo completion
function toggleTodo(id) {
  const todos = getCurrentTodos();
  const todo = todos.find(t => t.id === id);
  if (todo) {
    todo.completed = !todo.completed;
    setCurrentTodos(todos);
    saveTodos();
    renderTodoDashboard();
  }
}

// Delete a todo
function deleteTodo(id) {
  let todos = getCurrentTodos();
  todos = todos.filter(t => t.id !== id);
  setCurrentTodos(todos);
  saveTodos();
  renderTodoDashboard();
}

// Copy todo text to clipboard
async function copyTodo(id) {
  const todos = getCurrentTodos();
  const todo = todos.find(t => t.id === id);
  if (todo) {
    try {
      await navigator.clipboard.writeText(todo.text);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
}

// Update todo text
function updateTodoText(id, text) {
  const todos = getCurrentTodos();
  const todo = todos.find(t => t.id === id);
  if (todo) {
    todo.text = text;
    setCurrentTodos(todos);
    saveTodos();
  }
}

// Escape HTML for safe display
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Render the Todo Dashboard content (in right sidebar)
export function renderTodoDashboard() {
  const container = document.getElementById('todoSidebarSection');
  if (!container) return;

  const todos = getCurrentTodos();
  const completedCount = todos.filter(t => t.completed).length;
  const totalCount = todos.length;

  container.innerHTML = `
    <div class="sidebar-todo-header">
      <span class="sidebar-todo-icon">✅</span>
      <span class="sidebar-todo-title">Todo List</span>
      <span class="sidebar-todo-count">${completedCount}/${totalCount}</span>
    </div>
    <div class="sidebar-todo-list" id="todoList">
      ${todos.map(todo => `
        <div class="sidebar-todo-item ${todo.completed ? 'completed' : ''}" data-id="${todo.id}">
          <input type="checkbox" class="sidebar-todo-checkbox" ${todo.completed ? 'checked' : ''} data-id="${todo.id}">
          <span class="sidebar-todo-text" data-id="${todo.id}">${escapeHtml(todo.text)}</span>
          <div class="sidebar-todo-actions">
            <button class="sidebar-todo-btn todo-copy" data-id="${todo.id}" title="Copy">📋</button>
            <button class="sidebar-todo-btn todo-delete" data-id="${todo.id}" title="Delete">🗑️</button>
          </div>
        </div>
      `).join('')}
      <div class="sidebar-todo-input-row">
        <input type="checkbox" class="sidebar-todo-checkbox placeholder-checkbox" disabled>
        <input type="text" class="sidebar-todo-input" id="todoNewInput" placeholder="Add todo...">
      </div>
    </div>
  `;

  // Setup event listeners
  setupTodoEventListeners();
}

// Setup event listeners for todo interactions
function setupTodoEventListeners() {
  // Checkbox toggle
  document.querySelectorAll('.sidebar-todo-checkbox:not(.placeholder-checkbox)').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      toggleTodo(id);
    });
  });

  // Copy button
  document.querySelectorAll('.todo-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      copyTodo(id);
    });
  });

  // Delete button
  document.querySelectorAll('.todo-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      deleteTodo(id);
    });
  });

  // New todo input
  const newInput = document.getElementById('todoNewInput');
  if (newInput) {
    newInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && e.target.value.trim()) {
        addTodo(e.target.value);
        e.target.value = '';
      }
    });
  }

  // Make todo text editable
  document.querySelectorAll('.sidebar-todo-text').forEach(span => {
    span.addEventListener('dblclick', (e) => {
      const id = e.target.dataset.id;
      const todos = getCurrentTodos();
      const todo = todos.find(t => t.id === id);
      if (!todo) return;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'sidebar-todo-edit-input';
      input.value = todo.text;

      input.addEventListener('blur', () => {
        updateTodoText(id, input.value);
        renderTodoDashboard();
      });

      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          updateTodoText(id, input.value);
          renderTodoDashboard();
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          renderTodoDashboard();
        }
      });

      e.target.replaceWith(input);
      input.focus();
      input.select();
    });
  });
}

// Show/hide dashboard panel (now shows terminal dashboard in center)
export function showDashboardPanel(show) {
  const dashboardPanel = document.getElementById('dashboardPanel');
  const browserInnerContent = document.getElementById('browserInnerContent');
  const qaPanel = document.getElementById('qaPanel');
  const structurePanel = document.getElementById('structurePanel');
  const gitPanel = document.getElementById('gitHistoryPanel');

  if (dashboardPanel) {
    dashboardPanel.style.display = show ? 'flex' : 'none';
  }

  if (show) {
    // Hide other panels when showing dashboard
    if (browserInnerContent) browserInnerContent.style.display = 'none';
    if (qaPanel) qaPanel.style.display = 'none';
    if (structurePanel) structurePanel.style.display = 'none';
    if (gitPanel) gitPanel.style.display = 'none';
  }
}

// Check if Dashboard tab is active
export function isDashboardTabActive() {
  return state.browser.activeTabId === DASHBOARD_TAB_ID;
}

// Create the todo dashboard (called on init)
export function createTodoDashboard() {
  // Add CSS styles
  addTodoDashboardStyles();
}

// Add CSS styles for todo sidebar
function addTodoDashboardStyles() {
  if (document.getElementById('todo-dashboard-styles')) return;

  const style = document.createElement('style');
  style.id = 'todo-dashboard-styles';
  style.textContent = `
    /* Sidebar Todo Section */
    #todoSidebarSection {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .sidebar-todo-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid #334155;
      background: rgba(255, 255, 255, 0.02);
    }

    .sidebar-todo-icon {
      font-size: 16px;
    }

    .sidebar-todo-title {
      font-size: 13px;
      font-weight: 600;
      color: #f1f5f9;
      flex: 1;
    }

    .sidebar-todo-count {
      font-size: 11px;
      color: #64748b;
      background: #334155;
      padding: 2px 8px;
      border-radius: 10px;
    }

    /* Todo List */
    .sidebar-todo-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px;
      overflow-y: auto;
      flex: 1;
    }

    .sidebar-todo-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 8px;
      transition: background 0.15s;
    }

    .sidebar-todo-item:hover {
      background: #334155;
    }

    .sidebar-todo-item.completed .sidebar-todo-text {
      text-decoration: line-through;
      color: #64748b;
    }

    .sidebar-todo-checkbox {
      width: 14px;
      height: 14px;
      cursor: pointer;
      accent-color: #22c55e;
      flex-shrink: 0;
    }

    .sidebar-todo-text {
      flex: 1;
      font-size: 12px;
      color: #e2e8f0;
      cursor: default;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sidebar-todo-actions {
      display: flex;
      gap: 2px;
      opacity: 0;
      transition: opacity 0.15s;
    }

    .sidebar-todo-item:hover .sidebar-todo-actions {
      opacity: 1;
    }

    .sidebar-todo-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 11px;
      padding: 4px;
      border-radius: 4px;
      transition: background 0.15s;
    }

    .sidebar-todo-btn:hover {
      background: #475569;
    }

    .sidebar-todo-btn.todo-delete:hover {
      background: #ef444440;
    }

    /* Todo Input Row */
    .sidebar-todo-input-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      margin-top: 4px;
      border-top: 1px solid #334155;
    }

    .sidebar-todo-input-row .placeholder-checkbox {
      opacity: 0.3;
    }

    .sidebar-todo-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: #e2e8f0;
      font-size: 12px;
      padding: 4px 0;
    }

    .sidebar-todo-input::placeholder {
      color: #64748b;
    }

    /* Inline edit input */
    .sidebar-todo-edit-input {
      flex: 1;
      background: #334155;
      border: 1px solid #475569;
      border-radius: 4px;
      color: #e2e8f0;
      font-size: 12px;
      padding: 4px 8px;
      outline: none;
    }

    .sidebar-todo-edit-input:focus {
      border-color: #89b4fa;
    }

    /* Scrollbar */
    .sidebar-todo-list::-webkit-scrollbar {
      width: 4px;
    }

    .sidebar-todo-list::-webkit-scrollbar-track {
      background: transparent;
    }

    .sidebar-todo-list::-webkit-scrollbar-thumb {
      background: #334155;
      border-radius: 2px;
    }
  `;
  document.head.appendChild(style);
}

// Initialize todo dashboard on load
export function initTodoDashboard() {
  createTodoDashboard();
}

// ============================================
// Project Switcher Handler
// ============================================

/**
 * Initialize todo dashboard handler for project switching
 * Call this during app initialization
 */
export function initTodoDashboardHandler() {
  registerStateHandler('todoDashboard', {
    priority: 85,

    onBeforeSwitch: async (ctx) => {
      // Nothing to cleanup - todos are per-project
    },

    onSave: async (ctx) => {
      // Todos are saved to backend as they change
    },

    onLoad: async (ctx) => {
      // Load todos from backend and refresh dashboard
      await loadTodos();
    },

    onAfterSwitch: async (ctx) => {
      // Always render todos in sidebar after project switch
      setTimeout(() => renderTodoDashboard(), 100);
    }
  });
}
