// Projects module - project tabs and workspace info

import { state } from './state.js';
import { DeleteProject, UpdateProject, SelectDirectory } from '../../wailsjs/go/main/App';
import { updateAllProjectClaudeStatus } from './claude-status.js';
import { switchProject } from './project-switcher.js';
import { renderITermPanel, focusProjectTab } from './iterm-panel.js';

// Open edit project modal
export function openEditProjectModal() {
  if (!state.activeProject) return;

  const modal = document.getElementById('editProjectModal');
  const nameInput = document.getElementById('editProjectName');
  const pathInput = document.getElementById('editProjectPath');

  if (!modal || !nameInput || !pathInput) return;

  // Fill form with current values
  nameInput.value = state.activeProject.name;
  pathInput.value = state.activeProject.path;

  // Render color picker
  renderEditColorPicker(state.activeProject.color);

  // Render icon picker
  renderEditIconPicker(state.activeProject.icon);

  modal.classList.remove('hidden');
}

// Render color picker for edit modal
function renderEditColorPicker(selectedColor) {
  const container = document.getElementById('editColorPicker');
  if (!container) return;

  container.innerHTML = state.colors.map(color => `
    <div class="color-option ${color === selectedColor ? 'selected' : ''}"
         data-color="${color}"
         style="background-color: ${color}"></div>
  `).join('');

  container.querySelectorAll('.color-option').forEach(opt => {
    opt.addEventListener('click', () => {
      container.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });
}

// Render icon picker for edit modal
function renderEditIconPicker(selectedIcon) {
  const container = document.getElementById('editIconPicker');
  if (!container) return;

  container.innerHTML = state.icons.map(icon => `
    <div class="icon-option ${icon === selectedIcon ? 'selected' : ''}" data-icon="${icon}">${icon}</div>
  `).join('');

  container.querySelectorAll('.icon-option').forEach(opt => {
    opt.addEventListener('click', () => {
      container.querySelectorAll('.icon-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });
}

// Setup edit project modal event listeners
export function setupEditProjectModal() {
  const modal = document.getElementById('editProjectModal');
  const form = document.getElementById('editProjectForm');
  const cancelBtn = document.getElementById('cancelEditProject');
  const browseBtn = document.getElementById('editBrowseBtn');

  if (!modal || !form) return;

  // Cancel button
  cancelBtn?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  // Close on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
    }
  });

  // Browse button
  browseBtn?.addEventListener('click', async () => {
    const path = await SelectDirectory();
    if (path) {
      document.getElementById('editProjectPath').value = path;
    }
  });

  // Form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.activeProject) return;

    const name = document.getElementById('editProjectName').value;
    const path = document.getElementById('editProjectPath').value;
    const colorEl = document.querySelector('#editColorPicker .color-option.selected');
    const iconEl = document.querySelector('#editIconPicker .icon-option.selected');

    const color = colorEl?.dataset.color || state.activeProject.color;
    const icon = iconEl?.dataset.icon || state.activeProject.icon;

    try {
      // UpdateProject expects full project object
      const updatedProject = {
        ...state.activeProject,
        name,
        path,
        color,
        icon
      };

      await UpdateProject(updatedProject);

      // Update local state
      state.activeProject.name = name;
      state.activeProject.path = path;
      state.activeProject.color = color;
      state.activeProject.icon = icon;

      // Update in projects array
      const idx = state.projects.findIndex(p => p.id === state.activeProject.id);
      if (idx >= 0) {
        state.projects[idx] = { ...state.activeProject };
      }

      // Update UI
      renderProjectTabs();
      updateWorkspaceInfo();

      // Refresh git status for new path
      refreshGitStatus();

      // Close modal
      modal.classList.add('hidden');
    } catch (err) {
      alert('Error updating project: ' + err);
    }
  });
}

// Render project tabs
export function renderProjectTabs() {
  const container = document.getElementById('projectTabs');
  if (!container) return;

  container.innerHTML = state.projects.map(p => `
    <div class="project-tab ${state.activeProject?.id === p.id ? 'active' : ''}"
         data-id="${p.id}"
         style="--project-color: ${p.color}">
      <span class="project-icon">${p.icon}</span>
      <span class="project-name">${p.name}</span>
      <button class="close-project" data-id="${p.id}" title="Remove project">×</button>
    </div>
  `).join('');

  container.querySelectorAll('.project-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      if (!e.target.classList.contains('close-project')) {
        selectProject(tab.dataset.id);
      }
    });
  });

  container.querySelectorAll('.close-project').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Remove this project?')) {
        await DeleteProject(btn.dataset.id);
        state.projects = state.projects.filter(p => p.id !== btn.dataset.id);
        if (state.activeProject?.id === btn.dataset.id) {
          state.activeProject = null;
          updateWorkspaceInfo();
        }
        renderProjectTabs();
      }
    });
  });

  // Re-apply Claude status to all project tabs after render
  updateAllProjectClaudeStatus();
}

// Select a project
export async function selectProject(id) {
  if (state.activeProject?.id === id) return;

  // Use the centralized project switcher
  const success = await switchProject(id);

  if (success) {
    // Update project tabs and workspace info
    renderProjectTabs();
    updateWorkspaceInfo();

    // Update iTerm panel for new project and focus its tab
    renderITermPanel();
    focusProjectTab();

  }
}

// Update workspace info in sidebar
export function updateWorkspaceInfo() {
  const container = document.getElementById('workspaceInfo');
  if (!container) return;

  if (state.activeProject) {
    container.innerHTML = `
      <div class="project-info" title="Double-click to edit">
        <div class="project-header">
          <span class="icon" style="color: ${state.activeProject.color}">${state.activeProject.icon}</span>
          <span class="name">${state.activeProject.name}</span>
        </div>
        <p class="path">${state.activeProject.path}</p>
      </div>
    `;

    // Add double-click handler to open edit modal
    const projectInfo = container.querySelector('.project-info');
    if (projectInfo) {
      projectInfo.style.cursor = 'pointer';
      projectInfo.addEventListener('dblclick', openEditProjectModal);
    }
  } else {
    container.innerHTML = `<p class="no-project">No project selected</p>`;
  }
}
