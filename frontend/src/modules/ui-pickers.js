// UI Pickers module - color and icon pickers

import { state } from './state.js';

// Render color picker for project creation
export function renderColorPicker() {
  const container = document.getElementById('colorPicker');
  if (!container) return;

  container.innerHTML = state.colors.map((color, i) => `
    <div class="color-option ${i === 0 ? 'selected' : ''}"
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

// Render icon picker for project creation
export function renderIconPicker() {
  const container = document.getElementById('iconPicker');
  if (!container) return;

  container.innerHTML = state.icons.map((icon, i) => `
    <div class="icon-option ${i === 0 ? 'selected' : ''}" data-icon="${icon}">${icon}</div>
  `).join('');

  container.querySelectorAll('.icon-option').forEach(opt => {
    opt.addEventListener('click', () => {
      container.querySelectorAll('.icon-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });
}
