// Notes module - project notes management

import { state } from './state.js';
import { registerStateHandler } from './project-switcher.js';

// Callbacks set by main.js
let notesCallbacks = {
  saveNotes: () => {},
  getNotes: () => '',
  insertToTerminal: () => {}
};

export function setNotesCallbacks(callbacks) {
  notesCallbacks = { ...notesCallbacks, ...callbacks };
}

// Render notes section in sidebar
export function renderNotesSection() {
  const notesSection = document.getElementById('notesSection');
  if (!notesSection) return;

  const notes = state.activeProject?.notes || '';
  const preview = notes ? notes.split('\n')[0].substring(0, 50) : 'No notes yet';
  const hasNotes = notes && notes.trim().length > 0;

  notesSection.innerHTML = `
    <div class="notes-header" id="notesHeader">
      <span class="notes-toggle">${state.notesExpanded ? '▼' : '▶'}</span>
      <h3>Notes</h3>
      <span class="notes-icon">${hasNotes ? '📝' : '📄'}</span>
    </div>
    <div id="notesContent" class="notes-content ${state.notesExpanded ? '' : 'collapsed'}">
      <div class="notes-preview ${hasNotes ? '' : 'empty'}" id="notesPreview">${hasNotes ? escapeHtml(preview) + (notes.length > 50 ? '...' : '') : 'Click to add notes...'}</div>
      <div class="notes-actions">
        <button class="small-btn notes-edit-btn" id="editNotesBtn">Edit</button>
        ${hasNotes ? '<button class="small-btn notes-copy-btn" id="copyNotesBtn">Copy</button>' : ''}
        ${hasNotes ? '<button class="small-btn notes-insert-btn" id="insertNotesBtn" title="Insert to terminal">Insert</button>' : ''}
      </div>
    </div>
  `;

  setupNotesEventListeners();
}

// Setup event listeners for notes section
function setupNotesEventListeners() {
  const notesHeader = document.getElementById('notesHeader');
  const editNotesBtn = document.getElementById('editNotesBtn');
  const copyNotesBtn = document.getElementById('copyNotesBtn');
  const insertNotesBtn = document.getElementById('insertNotesBtn');
  const notesPreview = document.getElementById('notesPreview');

  notesHeader?.addEventListener('click', toggleNotesSection);
  editNotesBtn?.addEventListener('click', openNotesEditor);
  copyNotesBtn?.addEventListener('click', copyNotes);
  insertNotesBtn?.addEventListener('click', insertNotesToTerminal);
  notesPreview?.addEventListener('click', openNotesEditor);
}

// Toggle notes section expand/collapse
export function toggleNotesSection() {
  state.notesExpanded = !state.notesExpanded;
  const content = document.getElementById('notesContent');
  const toggle = document.querySelector('.notes-toggle');

  if (content) {
    content.classList.toggle('collapsed', !state.notesExpanded);
  }
  if (toggle) {
    toggle.textContent = state.notesExpanded ? '▼' : '▶';
  }
}

// Open notes editor modal
export function openNotesEditor() {
  if (!state.activeProject) return;

  const modal = document.getElementById('notesModal');
  const textarea = document.getElementById('notesTextarea');

  if (modal && textarea) {
    textarea.value = state.activeProject.notes || '';
    modal.classList.remove('hidden');
    textarea.focus();
  }
}

// Close notes editor modal
export function closeNotesEditor() {
  const modal = document.getElementById('notesModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('fullscreen');
  }
}

// Save notes
export async function saveNotes() {
  if (!state.activeProject) return;

  const textarea = document.getElementById('notesTextarea');
  if (!textarea) return;

  const notes = textarea.value;

  try {
    await notesCallbacks.saveNotes(state.activeProject.id, notes);
    state.activeProject.notes = notes;
    renderNotesSection();
    closeNotesEditor();
  } catch (err) {
    console.error('Failed to save notes:', err);
    alert('Failed to save notes: ' + err);
  }
}

// Copy notes to clipboard
export async function copyNotes() {
  if (!state.activeProject?.notes) return;

  try {
    await navigator.clipboard.writeText(state.activeProject.notes);
    showNotesToast('Notes copied to clipboard');
  } catch (err) {
    console.error('Failed to copy notes:', err);
  }
}

// Insert notes to active terminal
export function insertNotesToTerminal() {
  if (!state.activeProject?.notes) return;
  notesCallbacks.insertToTerminal(state.activeProject.notes);
  showNotesToast('Notes inserted to terminal');
}

// Show toast notification
function showNotesToast(message) {
  const toast = document.createElement('div');
  toast.className = 'notes-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// Helper to escape HTML
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Toggle notes modal fullscreen
export function toggleNotesModalFullscreen() {
  const modal = document.getElementById('notesModal');
  const btn = document.getElementById('fullscreenNotesModal');
  if (modal) {
    modal.classList.toggle('fullscreen');
    if (btn) {
      btn.title = modal.classList.contains('fullscreen') ? 'Exit fullscreen' : 'Toggle fullscreen';
    }
  }
}

// Render notes modal HTML
export function renderNotesModal() {
  return `
    <div id="notesModal" class="modal hidden">
      <div class="modal-content notes-modal-content">
        <div class="notes-modal-header">
          <h2>Project Notes</h2>
          <div class="notes-modal-header-actions">
            <button id="fullscreenNotesModal" class="notes-modal-fullscreen" title="Toggle fullscreen">⛶</button>
            <button id="closeNotesModal" class="notes-modal-close">&times;</button>
          </div>
        </div>
        <textarea id="notesTextarea" class="notes-textarea" placeholder="Write your project notes here... (Markdown supported)"></textarea>
        <div class="notes-modal-footer">
          <button id="cancelNotesBtn" class="secondary-btn">Cancel</button>
          <button id="saveNotesBtn" class="primary-btn">Save</button>
        </div>
      </div>
    </div>
  `;
}

// Setup notes modal event listeners (called after render)
export function setupNotesModal() {
  const closeBtn = document.getElementById('closeNotesModal');
  const cancelBtn = document.getElementById('cancelNotesBtn');
  const saveBtn = document.getElementById('saveNotesBtn');
  const fullscreenBtn = document.getElementById('fullscreenNotesModal');
  const modal = document.getElementById('notesModal');

  closeBtn?.addEventListener('click', closeNotesEditor);
  cancelBtn?.addEventListener('click', closeNotesEditor);
  saveBtn?.addEventListener('click', saveNotes);
  fullscreenBtn?.addEventListener('click', toggleNotesModalFullscreen);

  modal?.addEventListener('click', (e) => {
    if (e.target.id === 'notesModal') {
      closeNotesEditor();
    }
  });

  // Ctrl+S to save
  document.getElementById('notesTextarea')?.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      saveNotes();
    }
  });
}

// ============================================
// Project Switcher Handler
// ============================================

/**
 * Initialize notes handler for project switching
 * Call this during app initialization
 */
export function initNotesHandler() {
  registerStateHandler('notes', {
    priority: 70,

    onBeforeSwitch: async (ctx) => {
      // Nothing to cleanup for notes
    },

    onSave: async (ctx) => {
      // Notes are saved via saveNotes callback on user action
    },

    onLoad: async (ctx) => {
      // Update notes section for the new project
      renderNotesSection();
    },

    onAfterSwitch: async (ctx) => {
      // Notes section is already rendered in onLoad
    }
  });
}
