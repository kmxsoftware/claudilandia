/**
 * iTerm2 Integration Panel
 * Displays iTerm2 connection status and tab information
 */

import { GetITermStatus, LaunchITerm, CreateITermTab, SwitchITermTab, FocusITerm } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { state } from './state.js';

// Module state
let itermStatus = { running: false, tabs: [] };
let panelContainer = null;
let initialized = false;

/**
 * Initialize the iTerm panel module
 */
export function initITermPanel() {
    // Prevent duplicate initialization (memory leak fix)
    if (initialized) {
        return;
    }
    initialized = true;

    // Listen for iTerm2 status changes from backend
    EventsOn('iterm-status-changed', (status) => {
        itermStatus = status;
        renderITermPanel();
    });

    // Initial fetch
    fetchITermStatus();
}

/**
 * Fetch the current iTerm2 status
 */
async function fetchITermStatus() {
    try {
        itermStatus = await GetITermStatus();
        renderITermPanel();
    } catch (err) {
        console.error('Failed to fetch iTerm2 status:', err);
    }
}

/**
 * Get the active project's working directory
 */
function getActiveProjectPath() {
    return state.activeProject?.path || '';
}

/**
 * Get the active project name
 */
function getActiveProjectName() {
    return state.activeProject?.name || 'project';
}

/**
 * Get tabs matching the current project (by name prefix)
 */
function getProjectTabs() {
    const projectName = getActiveProjectName();
    const allTabs = itermStatus.tabs || [];

    // Filter tabs that start with the project name
    return allTabs.filter(tab => tab.name.startsWith(projectName + ' '));
}

/**
 * Get the next tab number for the project
 */
function getNextTabNumber() {
    const projectName = getActiveProjectName();
    const projectTabs = getProjectTabs();

    // Extract numbers from existing tabs
    const numbers = projectTabs.map(tab => {
        const match = tab.name.match(new RegExp(`^${escapeRegex(projectName)} (\\d+)$`));
        return match ? parseInt(match[1], 10) : 0;
    });

    // Find the next available number
    const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;
    return maxNum + 1;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Launch iTerm2
 */
async function handleLaunchITerm() {
    try {
        await LaunchITerm();
        // Status will update via event
    } catch (err) {
        console.error('Failed to launch iTerm2:', err);
    }
}

/**
 * Create a new iTerm2 tab at project directory
 */
async function handleCreateTab() {
    const projectPath = getActiveProjectPath();
    const projectName = getActiveProjectName();
    if (!projectPath) {
        console.error('No active project');
        return;
    }

    const tabNumber = getNextTabNumber();
    const tabName = `${projectName} ${tabNumber}`;

    try {
        await CreateITermTab(projectPath, tabName);
        // Refresh to show new tab
        setTimeout(fetchITermStatus, 500);
    } catch (err) {
        console.error('Failed to create iTerm2 tab:', err);
    }
}

/**
 * Switch to a specific iTerm2 tab
 */
async function handleSwitchTab(windowId, tabIndex) {
    // Immediately update UI to show the clicked tab as active
    if (itermStatus.tabs) {
        itermStatus.tabs.forEach(tab => {
            tab.isActive = (tab.windowId === windowId && tab.tabIndex === tabIndex);
        });
        renderITermPanel();
    }

    try {
        await SwitchITermTab(windowId, tabIndex);
    } catch (err) {
        console.error('Failed to switch iTerm2 tab:', err);
    }
}

/**
 * Focus iTerm2 window
 */
async function handleFocusITerm() {
    try {
        await FocusITerm();
    } catch (err) {
        console.error('Failed to focus iTerm2:', err);
    }
}

/**
 * Focus the first tab for the current project (called on project switch)
 */
export async function focusProjectTab() {
    if (!itermStatus.running) return;

    const projectTabs = getProjectTabs();
    if (projectTabs.length === 0) return;

    // Switch to the first project tab (or the active one if any)
    const targetTab = projectTabs.find(t => t.isActive) || projectTabs[0];
    try {
        await SwitchITermTab(targetTab.windowId, targetTab.tabIndex);
    } catch (err) {
        console.error('Failed to focus project tab:', err);
    }
}

/**
 * Render the iTerm panel
 */
export function renderITermPanel() {
    if (!panelContainer) {
        panelContainer = document.getElementById('iterm-panel');
    }
    if (!panelContainer) return;

    const projectPath = getActiveProjectPath();
    const projectName = getActiveProjectName();
    const projectTabs = getProjectTabs();

    let html = '';

    if (!itermStatus.running) {
        // iTerm2 not running - show launch button
        html = `
            <div class="iterm-tabs-row">
                <button class="iterm-tab-btn launch" onclick="window.itermLaunch()" title="Launch iTerm2">
                    Open iTerm2
                </button>
            </div>
        `;
    } else {
        // iTerm2 running - show tab buttons
        const tabButtonsHtml = projectTabs.map(tab => `
            <button class="iterm-tab-btn ${tab.isActive ? 'active' : ''}"
                    onclick="window.itermSwitchTab(${tab.windowId}, ${tab.tabIndex})"
                    title="${escapeHtml(tab.name)}">
                ${escapeHtml(tab.name)}
            </button>
        `).join('');

        html = `
            <div class="iterm-tabs-row">
                ${tabButtonsHtml}
            </div>
        `;
    }

    panelContainer.innerHTML = html;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Expose functions to window for onclick handlers
window.itermLaunch = handleLaunchITerm;
window.itermCreateTab = handleCreateTab;
window.itermSwitchTab = handleSwitchTab;
window.itermFocus = handleFocusITerm;
window.itermRefresh = fetchITermStatus;

// Export for external use
export { itermStatus, fetchITermStatus };
