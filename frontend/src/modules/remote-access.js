import { state } from './state.js';
import QRCode from 'qrcode';
import {
  StartRemoteAccess,
  StopRemoteAccess,
  GetRemoteAccessStatus,
  GetRemoteAccessClients,
  AddApprovedClient,
  RemoveApprovedClient,
  GetApprovedClients
} from '../../wailsjs/go/main/App';

// Remote access state
let remoteStatus = {
  enabled: false,
  savedDevicesOnly: false,
  running: false,
  port: 9090,
  localUrl: '',
  publicUrl: '',
  token: '',
  clientCount: 0,
  clients: []
};

// Approved clients list
let approvedClients = [];

let statusInterval = null;
let isTabActive = false;

// Initialize remote access panel
export function initRemoteAccess() {
  // Status polling is now managed by tab visibility
}

// Called when switching TO the Remote tab
export function showRemoteAccessPanel() {
  isTabActive = true;
  renderRemoteAccessPanel();
  loadRemoteStatus();
  loadApprovedClients();

  // Start polling only when tab is active
  if (!statusInterval) {
    statusInterval = setInterval(() => {
      if (isTabActive && remoteStatus.running) {
        loadRemoteStatus();
      }
    }, 5000);
  }
}

// Called when switching AWAY from the Remote tab
export function hideRemoteAccessPanel() {
  isTabActive = false;

  // Stop polling when tab is not visible
  if (statusInterval) {
    clearInterval(statusInterval);
    statusInterval = null;
  }
}

// Load current remote access status
export async function loadRemoteStatus() {
  try {
    const status = await GetRemoteAccessStatus();
    if (status) {
      remoteStatus = status;
      updateRemoteAccessUI();
    }
  } catch (err) {
    console.error('Failed to get remote access status:', err);
  }
}

// Start remote access
export async function startRemoteAccess() {
  const panel = document.getElementById('remoteAccessPanel');
  if (!panel) return;

  // Get config from form
  const port = parseInt(document.getElementById('remotePort')?.value) || 9090;
  const ngrokPlan = document.getElementById('ngrokPlan')?.value || 'free';
  const subdomain = document.getElementById('ngrokSubdomain')?.value || '';
  const tokenExpiry = parseInt(document.getElementById('tokenExpiry')?.value) || 24;
  const enableNgrok = document.getElementById('enableNgrok')?.checked || false;
  const savedDevicesOnly = document.getElementById('savedDevicesOnly')?.checked || false;

  const config = {
    enabled: enableNgrok,
    savedDevicesOnly: savedDevicesOnly,
    port: port,
    ngrokPlan: ngrokPlan,
    subdomain: subdomain,
    tokenExpiry: tokenExpiry
  };

  try {
    const startBtn = document.getElementById('startRemoteBtn');
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.textContent = 'Starting...';
    }

    const status = await StartRemoteAccess(config);
    if (status) {
      remoteStatus = status;
      updateRemoteAccessUI();
    }
  } catch (err) {
    console.error('Failed to start remote access:', err);
    alert('Failed to start remote access: ' + err);
  } finally {
    const startBtn = document.getElementById('startRemoteBtn');
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = 'Start Remote Access';
    }
  }
}

// Stop remote access
export async function stopRemoteAccess() {
  try {
    const stopBtn = document.getElementById('stopRemoteBtn');
    if (stopBtn) {
      stopBtn.disabled = true;
      stopBtn.textContent = 'Stopping...';
    }

    await StopRemoteAccess();
    remoteStatus = {
      enabled: false,
      running: false,
      port: remoteStatus.port,
      localUrl: '',
      publicUrl: '',
      token: '',
      clientCount: 0,
      clients: []
    };
    updateRemoteAccessUI();
  } catch (err) {
    console.error('Failed to stop remote access:', err);
  } finally {
    const stopBtn = document.getElementById('stopRemoteBtn');
    if (stopBtn) {
      stopBtn.disabled = false;
      stopBtn.textContent = 'Stop';
    }
  }
}

// Copy URL to clipboard
export function copyRemoteUrl(type) {
  const url = type === 'public' ? remoteStatus.publicUrl : remoteStatus.localUrl;
  if (url) {
    navigator.clipboard.writeText(url);
    showCopyNotification('URL copied to clipboard!');
  }
}

// Generate QR code locally using qrcode library
async function generateQRCode(text, size = 200) {
  try {
    const qrDataUrl = await QRCode.toDataURL(text, {
      width: size,
      margin: 2,
      color: {
        dark: '#1e1e2e',  // Catppuccin dark color
        light: '#ffffff'
      },
      errorCorrectionLevel: 'M'
    });
    return qrDataUrl;
  } catch (err) {
    console.error('Failed to generate QR code:', err);
    return null;
  }
}

// Show QR code modal with locally generated QR code
export async function showQRCode() {
  const url = remoteStatus.publicUrl || remoteStatus.localUrl;
  if (!url) return;

  const existingModal = document.getElementById('qrModal');
  if (existingModal) existingModal.remove();

  // Generate QR code locally
  const qrDataUrl = await generateQRCode(url, 200);

  const modal = document.createElement('div');
  modal.id = 'qrModal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content qr-modal">
      <div class="qr-modal-header">
        <h2>Scan with iPhone</h2>
        <button class="close-modal-btn" id="closeQrModal">×</button>
      </div>
      <div class="qr-content">
        ${qrDataUrl ? `
          <div class="qr-placeholder">
            <img src="${qrDataUrl}" alt="QR Code" class="qr-image" />
          </div>
        ` : `
          <div class="qr-placeholder qr-error">
            <p>Failed to generate QR code</p>
          </div>
        `}
        <p class="qr-url">${escapeHtml(url)}</p>
        <button class="copy-btn" id="copyQrUrlBtn">
          Copy URL
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('closeQrModal').addEventListener('click', () => {
    modal.remove();
  });

  document.getElementById('copyQrUrlBtn').addEventListener('click', () => {
    copyRemoteUrl(remoteStatus.publicUrl ? 'public' : 'local');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Show copy notification
function showCopyNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'copy-notification';
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

// Update UI based on status
function updateRemoteAccessUI() {
  const panel = document.getElementById('remoteAccessPanel');
  if (!panel) return;

  const statusSection = panel.querySelector('.remote-status');
  const configSection = panel.querySelector('.remote-config');
  const actionsSection = panel.querySelector('.remote-actions');
  const clientsSection = panel.querySelector('.remote-clients');

  if (remoteStatus.running) {
    // Show running state
    if (statusSection) {
      const modeText = remoteStatus.savedDevicesOnly ? ' (Saved Devices Only)' : '';
      statusSection.innerHTML = `
        <div class="status-indicator running">
          <span class="status-dot"></span>
          <span>Running on port ${remoteStatus.port}${modeText}</span>
        </div>
        <div class="remote-urls">
          ${remoteStatus.localUrl ? `
            <div class="url-row">
              <label>Local:</label>
              <input type="text" readonly value="${escapeHtml(remoteStatus.localUrl)}" class="url-input" />
              <button class="small-btn" id="copyLocalUrlBtn">Copy</button>
            </div>
          ` : ''}
          ${remoteStatus.publicUrl ? `
            <div class="url-row public">
              <label>Public:</label>
              <input type="text" readonly value="${escapeHtml(remoteStatus.publicUrl)}" class="url-input" />
              <button class="small-btn" id="copyPublicUrlBtn">Copy</button>
            </div>
          ` : ''}
        </div>
        <button class="qr-btn" id="showQrBtn">
          Show QR Code
        </button>
      `;

      // Add event listeners
      document.getElementById('copyLocalUrlBtn')?.addEventListener('click', () => copyRemoteUrl('local'));
      document.getElementById('copyPublicUrlBtn')?.addEventListener('click', () => copyRemoteUrl('public'));
      document.getElementById('showQrBtn')?.addEventListener('click', showQRCode);
    }

    if (configSection) {
      configSection.style.display = 'none';
    }

    if (actionsSection) {
      actionsSection.innerHTML = `
        <button id="stopRemoteBtn" class="stop-btn">
          Stop Remote Access
        </button>
      `;
      document.getElementById('stopRemoteBtn')?.addEventListener('click', stopRemoteAccess);
    }

    if (clientsSection) {
      clientsSection.innerHTML = `
        <h4>Connected Clients (${remoteStatus.clientCount})</h4>
        ${remoteStatus.clients && remoteStatus.clients.length > 0 ? `
          <ul class="clients-list">
            ${remoteStatus.clients.map(c => `
              <li>
                <span class="client-addr">${escapeHtml(c.remoteAddr || '')}</span>
                <span class="client-term">${escapeHtml(c.terminalId || 'No terminal')}</span>
              </li>
            `).join('')}
          </ul>
        ` : '<p class="no-clients">No clients connected</p>'}
      `;
      clientsSection.style.display = 'block';
    }
  } else {
    // Show stopped state
    if (statusSection) {
      statusSection.innerHTML = `
        <div class="status-indicator stopped">
          <span class="status-dot"></span>
          <span>Not running</span>
        </div>
      `;
    }

    if (configSection) {
      configSection.style.display = 'block';
    }

    if (actionsSection) {
      actionsSection.innerHTML = `
        <button id="startRemoteBtn" class="start-btn">
          Start Remote Access
        </button>
      `;
      document.getElementById('startRemoteBtn')?.addEventListener('click', startRemoteAccess);
    }

    if (clientsSection) {
      clientsSection.style.display = 'none';
    }
  }
}

// Handle ngrok plan change
export function onNgrokPlanChange() {
  const plan = document.getElementById('ngrokPlan')?.value;
  const subdomainRow = document.getElementById('subdomainRow');
  if (subdomainRow) {
    subdomainRow.style.display = plan === 'premium' ? 'flex' : 'none';
  }
}

// Render the remote access panel
export function renderRemoteAccessPanel() {
  const container = document.getElementById('remoteAccessPanel');
  if (!container) return;

  container.innerHTML = `
    <div class="remote-access-content">
      <div class="remote-header">
        <h3>Remote iTerm2 Access</h3>
        <p class="remote-description">
          Control your iTerm2 terminals from iPhone or any device via browser
        </p>
      </div>

      <div class="remote-status">
        <div class="status-indicator stopped">
          <span class="status-dot"></span>
          <span>Not running</span>
        </div>
      </div>

      <div class="remote-config">
        <div class="config-section">
          <div class="config-section-title">Server Settings</div>

          <div class="config-row">
            <label for="remotePort">Port</label>
            <input type="number" id="remotePort" value="${remoteStatus.port}" min="1024" max="65535" />
          </div>

          <div class="config-row" id="tokenExpiryRow">
            <label for="tokenExpiry">Token Expiry</label>
            <select id="tokenExpiry">
              <option value="1">1 hour</option>
              <option value="8">8 hours</option>
              <option value="24" selected>24 hours</option>
              <option value="72">3 days</option>
              <option value="168">1 week</option>
            </select>
          </div>
        </div>

        <div class="config-section">
          <div class="config-section-title">Access Mode</div>

          <div class="checkbox-row">
            <label class="checkbox-label">
              <input type="checkbox" id="savedDevicesOnly" />
              <span class="checkbox-text">Saved Devices Only</span>
              <span class="checkbox-hint">Only approved devices can connect (no temporary token)</span>
            </label>
          </div>

          <div class="checkbox-row">
            <label class="checkbox-label">
              <input type="checkbox" id="enableNgrok" checked />
              <span class="checkbox-text">Enable ngrok tunnel</span>
              <span class="checkbox-hint">Make terminal accessible from anywhere</span>
            </label>
          </div>

          <div class="ngrok-config" id="ngrokConfig">
            <div class="config-row">
              <label for="ngrokPlan">Plan</label>
              <select id="ngrokPlan">
                <option value="free">Free (random URL)</option>
                <option value="premium" selected>Premium (custom subdomain)</option>
              </select>
            </div>

            <div class="config-row" id="subdomainRow">
              <label for="ngrokSubdomain">Subdomain</label>
              <div class="subdomain-input-wrapper">
                <input type="text" id="ngrokSubdomain" value="claudilandia" placeholder="e.g., projecthub" />
                <span class="subdomain-suffix">.ngrok.io</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="remote-actions">
        <button id="startRemoteBtn" class="start-btn">
          Start Remote Access
        </button>
      </div>

      <div class="remote-clients" style="display: none;">
        <h4>Connected Clients (0)</h4>
        <p class="no-clients">No clients connected</p>
      </div>

      <div class="approved-clients-section">
        <div class="config-section">
          <div class="config-section-title">Approved Devices (Permanent Access)</div>
          <p class="approved-description">
            Add devices for permanent access. Their tokens never expire and are saved in the browser.
          </p>
          <div class="add-approved-row">
            <input type="text" id="approvedClientName" placeholder="Device name (e.g., iPhone)" />
            <button id="addApprovedBtn" class="small-btn">Add Device</button>
          </div>
          <div id="approvedClientsList" class="approved-list"></div>
        </div>
      </div>
    </div>
  `;

  // Toggle ngrok config visibility
  const enableNgrok = document.getElementById('enableNgrok');
  const ngrokConfig = document.getElementById('ngrokConfig');
  const ngrokPlanSelect = document.getElementById('ngrokPlan');
  const subdomainRow = document.getElementById('subdomainRow');
  const savedDevicesOnly = document.getElementById('savedDevicesOnly');
  const tokenExpiryRow = document.getElementById('tokenExpiryRow');

  if (enableNgrok && ngrokConfig) {
    enableNgrok.addEventListener('change', () => {
      ngrokConfig.style.display = enableNgrok.checked ? 'block' : 'none';
    });
    // Show by default since checkbox is checked
    ngrokConfig.style.display = 'block';
  }

  if (savedDevicesOnly && tokenExpiryRow) {
    savedDevicesOnly.addEventListener('change', () => {
      // Hide token expiry when using saved devices only
      tokenExpiryRow.style.display = savedDevicesOnly.checked ? 'none' : 'flex';
    });
  }

  if (ngrokPlanSelect) {
    ngrokPlanSelect.addEventListener('change', onNgrokPlanChange);
    // Show subdomain row by default since premium is selected
    if (subdomainRow) {
      subdomainRow.style.display = 'flex';
    }
  }

  // Add event listener for start button
  document.getElementById('startRemoteBtn')?.addEventListener('click', startRemoteAccess);

  // Add event listener for adding approved client
  document.getElementById('addApprovedBtn')?.addEventListener('click', addApprovedClientHandler);
  document.getElementById('approvedClientName')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addApprovedClientHandler();
  });
}

// ============================================
// Approved Clients Management
// ============================================

// Load approved clients from backend
async function loadApprovedClients() {
  try {
    approvedClients = await GetApprovedClients() || [];
    renderApprovedClientsList();
  } catch (err) {
    console.error('Failed to load approved clients:', err);
    approvedClients = [];
  }
}

// Render the approved clients list
function renderApprovedClientsList() {
  const container = document.getElementById('approvedClientsList');
  if (!container) return;

  if (!approvedClients || approvedClients.length === 0) {
    container.innerHTML = '<p class="no-approved">No approved devices yet</p>';
    return;
  }

  container.innerHTML = approvedClients.map(client => {
    const createdDate = new Date(client.createdAt).toLocaleDateString();
    const lastUsedDate = client.lastUsed ? new Date(client.lastUsed).toLocaleDateString() : 'Never';

    return `
      <div class="approved-client-item" data-token="${escapeHtml(client.token)}">
        <div class="approved-client-info">
          <span class="approved-client-name">${escapeHtml(client.name)}</span>
          <span class="approved-client-meta">Added: ${createdDate} | Last used: ${lastUsedDate}</span>
        </div>
        <div class="approved-client-actions">
          <button class="copy-token-btn small-btn" data-token="${escapeHtml(client.token)}">Copy URL</button>
          <button class="remove-approved-btn small-btn danger" data-token="${escapeHtml(client.token)}">Remove</button>
        </div>
      </div>
    `;
  }).join('');

  // Add event listeners
  container.querySelectorAll('.copy-token-btn').forEach(btn => {
    btn.addEventListener('click', () => copyApprovedClientUrl(btn.dataset.token));
  });

  container.querySelectorAll('.remove-approved-btn').forEach(btn => {
    btn.addEventListener('click', () => removeApprovedClientHandler(btn.dataset.token));
  });
}

// Add a new approved client
async function addApprovedClientHandler() {
  const nameInput = document.getElementById('approvedClientName');
  const name = nameInput?.value.trim();

  if (!name) {
    alert('Please enter a device name');
    return;
  }

  try {
    const client = await AddApprovedClient(name);
    if (client) {
      approvedClients.push(client);
      renderApprovedClientsList();
      nameInput.value = '';

      // Show the URL for this new client
      const baseUrl = remoteStatus.publicUrl || remoteStatus.localUrl || `http://localhost:${remoteStatus.port}`;
      const url = baseUrl.split('?')[0] + '?token=' + client.token;
      showCopyNotification('Device added! URL copied to clipboard.');
      navigator.clipboard.writeText(url);
    }
  } catch (err) {
    console.error('Failed to add approved client:', err);
    alert('Failed to add device: ' + err);
  }
}

// Remove an approved client
async function removeApprovedClientHandler(token) {
  if (!confirm('Remove this device? It will need to be re-added to access remotely.')) {
    return;
  }

  try {
    await RemoveApprovedClient(token);
    approvedClients = approvedClients.filter(c => c.token !== token);
    renderApprovedClientsList();
    showCopyNotification('Device removed');
  } catch (err) {
    console.error('Failed to remove approved client:', err);
  }
}

// Copy the URL for an approved client
function copyApprovedClientUrl(token) {
  const baseUrl = remoteStatus.publicUrl || remoteStatus.localUrl || `http://localhost:${remoteStatus.port}`;
  const url = baseUrl.split('?')[0] + '?token=' + token;
  navigator.clipboard.writeText(url);
  showCopyNotification('URL copied to clipboard!');
}

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  if (statusInterval) {
    clearInterval(statusInterval);
  }
});
