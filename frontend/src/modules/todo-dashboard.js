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

// Drag-and-drop reorder state
let dragState = {
  active: false,
  itemEl: null,
  itemId: null,
  startY: 0,
  startX: 0,
  dropIndex: -1,
  sourceIndex: -1,
  indicator: null,
};
const DRAG_THRESHOLD = 5;

function getDropIndicator() {
  if (!dragState.indicator) {
    const el = document.createElement('div');
    el.className = 'sidebar-todo-drop-indicator';
    dragState.indicator = el;
  }
  return dragState.indicator;
}

function onTodoDragStart(e) {
  if (e.button !== 0) return;

  const target = e.target;
  if (target.matches('input, button, .sidebar-todo-checkbox, .sidebar-todo-btn, .sidebar-todo-input')) return;

  const itemEl = target.closest('.sidebar-todo-item');
  if (!itemEl || !itemEl.dataset.id) return;

  const itemId = itemEl.dataset.id;
  const todos = getCurrentTodos();
  const sourceIndex = todos.findIndex(t => t.id === itemId);
  if (sourceIndex === -1) return;

  dragState.startY = e.clientY;
  dragState.startX = e.clientX;
  dragState.itemEl = itemEl;
  dragState.itemId = itemId;
  dragState.sourceIndex = sourceIndex;
  dragState.active = false;
  dragState.dropIndex = -1;

  document.addEventListener('mousemove', onTodoDragMove);
  document.addEventListener('mouseup', onTodoDragEnd);
  e.preventDefault();
}

function onTodoDragMove(e) {
  const deltaY = Math.abs(e.clientY - dragState.startY);
  const deltaX = Math.abs(e.clientX - dragState.startX);

  if (!dragState.active) {
    if (deltaY < DRAG_THRESHOLD && deltaX < DRAG_THRESHOLD) return;
    dragState.active = true;
    dragState.itemEl.classList.add('sidebar-todo-dragging');
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  }

  const todoList = document.getElementById('todoList');
  if (!todoList) return;

  const items = Array.from(todoList.querySelectorAll('.sidebar-todo-item'));
  const mouseY = e.clientY;
  let dropIndex = items.length;

  for (let i = 0; i < items.length; i++) {
    const rect = items[i].getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (mouseY < midY) {
      dropIndex = i;
      break;
    }
  }

  dragState.dropIndex = dropIndex;
  updateDropIndicator(todoList, items, dropIndex);
}

function updateDropIndicator(todoList, items, dropIndex) {
  const indicator = getDropIndicator();

  if (dropIndex === dragState.sourceIndex || dropIndex === dragState.sourceIndex + 1) {
    indicator.remove();
    return;
  }

  const listRect = todoList.getBoundingClientRect();
  let indicatorY;

  if (dropIndex === 0) {
    const rect = items[0].getBoundingClientRect();
    indicatorY = rect.top - listRect.top;
  } else if (dropIndex >= items.length) {
    const rect = items[items.length - 1].getBoundingClientRect();
    indicatorY = rect.bottom - listRect.top;
  } else {
    const prevRect = items[dropIndex - 1].getBoundingClientRect();
    const nextRect = items[dropIndex].getBoundingClientRect();
    indicatorY = ((prevRect.bottom + nextRect.top) / 2) - listRect.top;
  }

  indicator.style.top = `${indicatorY}px`;

  if (!indicator.parentNode) {
    todoList.style.position = 'relative';
    todoList.appendChild(indicator);
  }
}

function onTodoDragEnd(e) {
  document.removeEventListener('mousemove', onTodoDragMove);
  document.removeEventListener('mouseup', onTodoDragEnd);

  if (!dragState.active) {
    resetDragState();
    return;
  }

  if (dragState.itemEl) {
    dragState.itemEl.classList.remove('sidebar-todo-dragging');
  }
  document.body.style.cursor = '';
  document.body.style.userSelect = '';

  const indicator = getDropIndicator();
  indicator.remove();

  const { sourceIndex, dropIndex } = dragState;
  if (dropIndex !== -1 && dropIndex !== sourceIndex && dropIndex !== sourceIndex + 1) {
    const todos = getCurrentTodos();
    const [movedItem] = todos.splice(sourceIndex, 1);
    const insertAt = dropIndex > sourceIndex ? dropIndex - 1 : dropIndex;
    todos.splice(insertAt, 0, movedItem);

    setCurrentTodos(todos);
    saveTodos();
    renderTodoDashboard();
  }

  resetDragState();
}

function resetDragState() {
  dragState.active = false;
  dragState.itemEl = null;
  dragState.itemId = null;
  dragState.startY = 0;
  dragState.startX = 0;
  dragState.dropIndex = -1;
  dragState.sourceIndex = -1;
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

  // Drag-to-reorder
  const todoList = document.getElementById('todoList');
  if (todoList) {
    todoList.addEventListener('mousedown', onTodoDragStart);
  }

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
      align-items: flex-start;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 8px;
      transition: background 0.15s;
    }

    .sidebar-todo-item .sidebar-todo-checkbox {
      margin-top: 2px;
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
      font-size: 14px;
      color: #e2e8f0;
      cursor: default;
      word-break: break-word;
      white-space: normal;
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

    /* Drag-to-reorder */
    .sidebar-todo-text {
      cursor: grab;
    }

    .sidebar-todo-item.sidebar-todo-dragging {
      opacity: 0.4;
      background: #334155;
    }

    .sidebar-todo-item.sidebar-todo-dragging .sidebar-todo-text {
      cursor: grabbing;
    }

    .sidebar-todo-drop-indicator {
      position: absolute;
      left: 8px;
      right: 8px;
      height: 2px;
      background: #89b4fa;
      border-radius: 1px;
      pointer-events: none;
      z-index: 10;
      transition: top 0.1s ease;
    }

    .sidebar-todo-drop-indicator::before {
      content: '';
      position: absolute;
      left: -3px;
      top: -3px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #89b4fa;
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
