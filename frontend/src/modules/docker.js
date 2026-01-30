import { state } from './state.js';
import { escapeHtml } from './utils.js';
import {
  GetContainers,
  StartContainer,
  StopContainer,
  RestartContainer,
  GetContainerLogs
} from '../../wailsjs/go/main/App';

export async function refreshContainers() {
  if (!state.dockerAvailable) return;

  try {
    state.containers = await GetContainers(true) || [];
    renderContainers();
  } catch (err) {
    console.error('Failed to get containers:', err);
  }
}

export function renderContainers() {
  const container = document.getElementById('containerList');
  if (!container) return;

  if (state.containers.length === 0) {
    container.innerHTML = '<p class="no-containers">No containers found</p>';
    return;
  }

  container.innerHTML = state.containers.map(c => `
    <div class="container-item">
      <div class="container-info">
        <span class="status ${c.state}">${c.state === 'running' ? '🟢' : '🔴'}</span>
        <div class="details">
          <span class="name">${c.name}</span>
          <span class="image">${c.image}</span>
        </div>
      </div>
      <div class="container-actions">
        ${c.state === 'running' ? `
          <button class="small-btn" onclick="window.stopContainer('${c.id}')">Stop</button>
          <button class="small-btn" onclick="window.restartContainer('${c.id}')">Restart</button>
        ` : `
          <button class="small-btn" onclick="window.startContainer('${c.id}')">Start</button>
        `}
        <button class="small-btn" onclick="window.showContainerLogs('${c.id}')">Logs</button>
      </div>
    </div>
  `).join('');
}

export function showLogsModal(title, content) {
  const existingModal = document.getElementById('logsModal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'logsModal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content logs-modal">
      <div class="logs-modal-header">
        <h2>Logs: ${title}</h2>
        <button class="close-modal-btn" id="closeLogsModal">×</button>
      </div>
      <pre class="logs-content">${escapeHtml(content)}</pre>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('closeLogsModal').addEventListener('click', () => {
    modal.remove();
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// Setup global window functions for onclick handlers
export function setupDockerWindowFunctions() {
  window.startContainer = async (id) => {
    await StartContainer(id);
    refreshContainers();
  };

  window.stopContainer = async (id) => {
    await StopContainer(id);
    refreshContainers();
  };

  window.restartContainer = async (id) => {
    await RestartContainer(id);
    refreshContainers();
  };

  window.showContainerLogs = async (id) => {
    try {
      const container = state.containers.find(c => c.id === id);
      const containerName = container ? container.name : id;
      const logs = await GetContainerLogs(id);
      showLogsModal(containerName, logs || 'No logs available');
    } catch (err) {
      showLogsModal('Error', 'Error getting logs: ' + err);
    }
  };
}
