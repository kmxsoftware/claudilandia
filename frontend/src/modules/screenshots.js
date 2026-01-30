// Screenshots module - capture, save, and manage browser screenshots

import { state } from './state.js';

// Callbacks set by main.js
let screenshotCallbacks = {
  saveScreenshot: async () => '',
  getScreenshots: async () => [],
  deleteScreenshot: async () => {},
  insertToTerminal: () => {}
};

export function setScreenshotCallbacks(callbacks) {
  screenshotCallbacks = { ...screenshotCallbacks, ...callbacks };
}

// Capture screenshot - no longer available since embedded browser was removed
// Screenshots can be captured in external browsers like Responsively or Chrome
export async function captureScreenshot() {
  showScreenshotToast('Screenshot capture is available in external browsers like Responsively', 'info');
}

// Open screenshot gallery modal
export async function openScreenshotGallery() {
  if (!state.activeProject) return;

  const modal = document.getElementById('screenshotGalleryModal');
  const gallery = document.getElementById('screenshotGallery');

  if (!modal || !gallery) return;

  // Load screenshots
  gallery.innerHTML = '<div class="gallery-loading">Loading screenshots...</div>';
  modal.classList.remove('hidden');

  try {
    const screenshots = await screenshotCallbacks.getScreenshots(state.activeProject.id);

    if (!screenshots || screenshots.length === 0) {
      gallery.innerHTML = '<div class="gallery-empty">No screenshots yet. Use the camera button to capture one.</div>';
      return;
    }

    // Sort by timestamp descending (newest first)
    screenshots.sort((a, b) => b.timestamp - a.timestamp);

    gallery.innerHTML = screenshots.map(s => `
      <div class="screenshot-item" data-path="${escapeHtml(s.path)}" data-filename="${escapeHtml(s.filename)}">
        <div class="screenshot-thumb">
          <img src="file://${escapeHtml(s.path)}" alt="${escapeHtml(s.filename)}" />
        </div>
        <div class="screenshot-info">
          <span class="screenshot-name">${escapeHtml(s.filename)}</span>
          <span class="screenshot-date">${formatDate(s.timestamp)}</span>
        </div>
        <div class="screenshot-actions">
          <button class="small-btn screenshot-copy-btn" title="Copy path">Copy</button>
          <button class="small-btn screenshot-insert-btn" title="Insert to terminal">Insert</button>
          <button class="small-btn screenshot-delete-btn danger" title="Delete">Delete</button>
        </div>
      </div>
    `).join('');

    // Setup event listeners for screenshot items
    setupGalleryEventListeners();
  } catch (err) {
    console.error('Failed to load screenshots:', err);
    gallery.innerHTML = '<div class="gallery-error">Failed to load screenshots</div>';
  }
}

// Close screenshot gallery
export function closeScreenshotGallery() {
  const modal = document.getElementById('screenshotGalleryModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

// Setup event listeners for gallery items
function setupGalleryEventListeners() {
  document.querySelectorAll('.screenshot-copy-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = btn.closest('.screenshot-item');
      const path = item.dataset.path;
      try {
        await navigator.clipboard.writeText(path);
        showScreenshotToast('Path copied to clipboard', 'success');
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    });
  });

  document.querySelectorAll('.screenshot-insert-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = btn.closest('.screenshot-item');
      const path = item.dataset.path;
      screenshotCallbacks.insertToTerminal(path);
      showScreenshotToast('Path inserted to terminal', 'success');
      closeScreenshotGallery();
    });
  });

  document.querySelectorAll('.screenshot-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = btn.closest('.screenshot-item');
      const filename = item.dataset.filename;

      if (!confirm(`Delete ${filename}?`)) return;

      try {
        await screenshotCallbacks.deleteScreenshot(state.activeProject.id, filename);
        item.remove();

        // Check if gallery is empty
        const gallery = document.getElementById('screenshotGallery');
        if (gallery && gallery.children.length === 0) {
          gallery.innerHTML = '<div class="gallery-empty">No screenshots yet. Use the camera button to capture one.</div>';
        }

        showScreenshotToast('Screenshot deleted', 'success');
      } catch (err) {
        console.error('Failed to delete screenshot:', err);
        showScreenshotToast('Failed to delete screenshot', 'error');
      }
    });
  });

  // Click on thumbnail to view full size
  document.querySelectorAll('.screenshot-thumb').forEach(thumb => {
    thumb.addEventListener('click', (e) => {
      const item = thumb.closest('.screenshot-item');
      const path = item.dataset.path;
      viewFullScreenshot(path);
    });
  });
}

// View full size screenshot
function viewFullScreenshot(path) {
  const viewer = document.getElementById('screenshotViewer');
  const viewerImg = document.getElementById('screenshotViewerImg');

  if (viewer && viewerImg) {
    viewerImg.src = `file://${path}`;
    viewer.classList.remove('hidden');
  }
}

// Close full size viewer
export function closeScreenshotViewer() {
  const viewer = document.getElementById('screenshotViewer');
  if (viewer) {
    viewer.classList.add('hidden');
  }
}

// Show toast notification
function showScreenshotToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `screenshot-toast screenshot-toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// Helper functions
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Render screenshot gallery modal HTML
export function renderScreenshotGalleryModal() {
  return `
    <div id="screenshotGalleryModal" class="modal hidden">
      <div class="modal-content screenshot-gallery-modal">
        <div class="gallery-header">
          <h2>Screenshots</h2>
          <button id="closeGalleryModal" class="modal-close-btn">&times;</button>
        </div>
        <div id="screenshotGallery" class="screenshot-gallery">
          <div class="gallery-loading">Loading screenshots...</div>
        </div>
      </div>
    </div>

    <div id="screenshotViewer" class="screenshot-viewer hidden">
      <div class="viewer-backdrop" id="closeViewerBackdrop"></div>
      <img id="screenshotViewerImg" src="" alt="Screenshot" />
      <button id="closeScreenshotViewer" class="viewer-close-btn">&times;</button>
    </div>
  `;
}

// Setup screenshot gallery event listeners
export function setupScreenshotGalleryModal() {
  const closeBtn = document.getElementById('closeGalleryModal');
  const modal = document.getElementById('screenshotGalleryModal');
  const viewerCloseBtn = document.getElementById('closeScreenshotViewer');
  const viewerBackdrop = document.getElementById('closeViewerBackdrop');

  closeBtn?.addEventListener('click', closeScreenshotGallery);
  modal?.addEventListener('click', (e) => {
    if (e.target.id === 'screenshotGalleryModal') {
      closeScreenshotGallery();
    }
  });

  viewerCloseBtn?.addEventListener('click', closeScreenshotViewer);
  viewerBackdrop?.addEventListener('click', closeScreenshotViewer);
}

// Add capture button to browser toolbar
export function addCaptureButton(toolbar) {
  if (!toolbar) return;

  // Check if button already exists
  if (document.getElementById('captureScreenshotBtn')) return;

  const divider = document.createElement('div');
  divider.className = 'browser-toolbar-divider';

  const captureBtn = document.createElement('button');
  captureBtn.id = 'captureScreenshotBtn';
  captureBtn.className = 'small-btn capture-btn';
  captureBtn.title = 'Capture Screenshot';
  captureBtn.innerHTML = '📸';
  captureBtn.addEventListener('click', captureScreenshot);

  const galleryBtn = document.createElement('button');
  galleryBtn.id = 'openGalleryBtn';
  galleryBtn.className = 'small-btn gallery-btn';
  galleryBtn.title = 'Screenshot Gallery';
  galleryBtn.innerHTML = '🖼️';
  galleryBtn.addEventListener('click', openScreenshotGallery);

  // Add screenshot buttons to toolbar
  toolbar.appendChild(divider);
  toolbar.appendChild(captureBtn);
  toolbar.appendChild(galleryBtn);
}
