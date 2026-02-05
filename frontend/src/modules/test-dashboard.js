import { state, getTerminals } from './state.js';
import { registerStateHandler } from './project-switcher.js';
import { textToBase64 } from './utils.js';

// Coverage state
let projectCoverage = new Map(); // projectPath -> coverage summary
let coverageHistory = new Map(); // projectPath -> history entries
let projectTestHistory = new Map(); // projectId -> array of test runs
let projectTestDiscovery = new Map(); // projectPath -> TestDiscovery

// Callbacks for backend operations
let testDashboardCallbacks = {
  getTestHistory: async () => [],
  addTestRun: async () => {},
  getTestDiscovery: async () => null,
  scanProjectTests: async () => null,
  writeTerminal: async () => {},
  getPackageScripts: async () => ({}),
  watchProjectCoverage: async () => {},
  checkProjectCoverage: async () => {}
};

export function setTestDashboardCallbacks(callbacks) {
  testDashboardCallbacks = { ...testDashboardCallbacks, ...callbacks };
}

// Test status colors and icons
const STATUS_CONFIG = {
  none: { icon: '○', color: '#6b7280', label: 'No tests' },
  running: { icon: '◐', color: '#eab308', label: 'Running', animate: true },
  passed: { icon: '✓', color: '#22c55e', label: 'Passed' },
  failed: { icon: '✗', color: '#ef4444', label: 'Failed' },
  mixed: { icon: '◑', color: '#f97316', label: 'Mixed' }
};

const RUNNER_ICONS = {
  unknown: '🧪',
  vitest: '⚡',
  playwright: '🎭',
  jest: '🃏',
  mocha: '☕',
  pytest: '🐍',
  go: '🐹'
};

// Special tab ID for QA (tests)
export const QA_TAB_ID = 'tab-qa';

// Helper to escape HTML attributes
function escapeAttr(str) {
  return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Health Score calculation
function calculateHealthScore(coverage, passRate, lastRunTimestamp) {
  // Base score from coverage (0-60 points)
  const coverageScore = Math.min(coverage || 0, 100) * 0.6;

  // Pass rate score (0-30 points)
  const passScore = (passRate || 0) * 0.3;

  // Freshness penalty (0-10 points)
  const hoursSinceRun = lastRunTimestamp
    ? (Date.now() - new Date(lastRunTimestamp).getTime()) / (1000 * 60 * 60)
    : 24; // Default to 24 hours if no run
  const freshnessScore = Math.max(0, 10 - hoursSinceRun);

  return Math.round(coverageScore + passScore + freshnessScore);
}

function getHealthLabel(score) {
  if (score >= 90) return { label: 'Excellent', color: '#22c55e', icon: '🌟' };
  if (score >= 70) return { label: 'Good', color: '#84cc16', icon: '✓' };
  if (score >= 50) return { label: 'Fair', color: '#eab308', icon: '○' };
  if (score >= 30) return { label: 'Poor', color: '#f97316', icon: '⚠' };
  return { label: 'Critical', color: '#ef4444', icon: '✗' };
}

// Load test history from backend for current project
export async function loadTestHistory() {
  if (!state.activeProject) return;

  try {
    const history = await testDashboardCallbacks.getTestHistory(state.activeProject.id);
    if (history && Array.isArray(history)) {
      const converted = history.map(run => ({
        ...run,
        timestamp: run.timestamp ? new Date(run.timestamp) : new Date()
      }));
      projectTestHistory.set(state.activeProject.id, converted);
    } else {
      projectTestHistory.set(state.activeProject.id, []);
    }
  } catch (err) {
    console.error('Failed to load test history:', err);
    projectTestHistory.set(state.activeProject.id, []);
  }

  // Load test discovery
  await loadTestDiscovery();

  // Load package.json scripts
  await loadPackageScripts();

  // Start watching coverage for this project
  if (state.activeProject?.path) {
    await testDashboardCallbacks.watchProjectCoverage(state.activeProject.path);
  }

  // Always render dashboard content
  renderTestDashboardContent();
}

// Load test discovery from backend
async function loadTestDiscovery() {
  if (!state.activeProject?.path) return;

  try {
    const discovery = await testDashboardCallbacks.getTestDiscovery(state.activeProject.path);
    if (discovery) {
      projectTestDiscovery.set(state.activeProject.path, discovery);
    }
  } catch (err) {
    console.error('Failed to load test discovery:', err);
  }
}

// Scan tests (force rescan)
async function scanTests() {
  if (!state.activeProject?.path) return;

  const scanBtn = document.querySelector('.qa-scan-btn');
  if (scanBtn) {
    scanBtn.disabled = true;
    scanBtn.innerHTML = '⟳ Scanning...';
  }

  try {
    const discovery = await testDashboardCallbacks.scanProjectTests(state.activeProject.path);
    if (discovery) {
      projectTestDiscovery.set(state.activeProject.path, discovery);
      renderTestDashboardContent();
    }
  } catch (err) {
    console.error('Failed to scan tests:', err);
  } finally {
    if (scanBtn) {
      scanBtn.disabled = false;
      scanBtn.innerHTML = '🔄 Scan Tests';
    }
  }
}

// Get test discovery for active project
function getTestDiscovery() {
  if (!state.activeProject?.path) return null;
  return projectTestDiscovery.get(state.activeProject.path);
}

// Get current project's test run history
function getTestRunHistory() {
  if (!state.activeProject) return [];
  if (!projectTestHistory.has(state.activeProject.id)) {
    projectTestHistory.set(state.activeProject.id, []);
  }
  return projectTestHistory.get(state.activeProject.id);
}

// Get terminal IDs for current project
function getCurrentProjectTerminalIds() {
  const terminals = getTerminals();
  return new Set(terminals.keys());
}

// Check if terminal belongs to current project
function isTerminalInCurrentProject(terminalId) {
  return getCurrentProjectTerminalIds().has(terminalId);
}

// Send command to terminal
async function sendCommandToTerminal(command) {
  if (!state.activeTerminalId) {
    alert('No active terminal. Please open a terminal first.');
    return;
  }

  try {
    await testDashboardCallbacks.writeTerminal(state.activeTerminalId, textToBase64(command + '\r'));
  } catch (err) {
    console.error('Failed to send command:', err);
  }
}

// Cached package.json scripts per project
let projectScripts = new Map(); // projectPath -> scripts object

// Load scripts from package.json
async function loadPackageScripts() {
  if (!state.activeProject?.path) return;

  try {
    const scripts = await testDashboardCallbacks.getPackageScripts(state.activeProject.path);
    if (scripts) {
      projectScripts.set(state.activeProject.path, scripts);
    }
  } catch (err) {
    // Silently ignore - project may not have package.json
  }
}

// Get scripts for active project
function getProjectScripts() {
  if (!state.activeProject?.path) return {};
  return projectScripts.get(state.activeProject.path) || {};
}

// Get command for running specific test type
function getTestTypeCommand(type) {
  const scripts = getProjectScripts();

  // Map test types to possible script names (in priority order)
  const typeScriptMap = {
    unit: ['test:unit', 'test'],
    integration: ['test:integration', 'test:int'],
    e2e: ['test:e2e', 'e2e', 'playwright', 'cypress'],
    all: ['test', 'test:all']
  };

  const scriptKeys = typeScriptMap[type] || ['test'];

  for (const key of scriptKeys) {
    if (scripts[key]) {
      // For unit tests, add coverage flag automatically
      if (type === 'unit' || type === 'all') {
        const scriptValue = scripts[key];
        // Check if vitest and doesn't already have coverage
        if (scriptValue.includes('vitest') && !scriptValue.includes('coverage')) {
          // Add coverage with json-summary reporter for dashboard parsing
          return `npm run ${key} -- --coverage --coverage.reporter=json-summary --coverage.reporter=text`;
        }
      }
      return `npm run ${key}`;
    }
  }

  // Fallback commands if no script found
  const fallbacks = {
    unit: 'npm test',
    integration: 'npm test -- --testPathPattern=integration',
    e2e: 'npx playwright test',
    all: 'npm test'
  };

  return fallbacks[type] || 'npm test';
}

// Check if a test type command is available
function hasTestTypeCommand(type) {
  const scripts = getProjectScripts();
  const typeScriptMap = {
    unit: ['test:unit', 'test'],
    integration: ['test:integration', 'test:int'],
    e2e: ['test:e2e', 'e2e', 'playwright', 'cypress'],
    all: ['test', 'test:all']
  };

  const scriptKeys = typeScriptMap[type] || ['test'];
  return scriptKeys.some(key => scripts[key]);
}

// Run tests for a specific type
function runTestType(type) {
  const command = getTestTypeCommand(type);
  sendCommandToTerminal(command);
}

// Run failed tests only
function runFailedTests() {
  const scripts = getProjectScripts();
  // Try vitest specific command first
  if (scripts['test'] && scripts['test'].includes('vitest')) {
    sendCommandToTerminal('npm test -- --failed');
  } else if (scripts['test:failed']) {
    sendCommandToTerminal('npm run test:failed');
  } else {
    sendCommandToTerminal('npm test -- --onlyFailures');
  }
}

// Update test status from backend event
export function updateTestStatus(terminalId, summary) {
  state.testStatus.set(terminalId, summary);

  // Add to history when test run completes
  if ((summary.status === 'passed' || summary.status === 'failed' || summary.status === 'mixed')
      && isTerminalInCurrentProject(terminalId) && state.activeProject) {
    const history = getTestRunHistory();

    // Check for duplicate
    const isDuplicate = history.length > 0 && history.some(run => {
      const timeDiff = Math.abs(new Date().getTime() - new Date(run.timestamp).getTime());
      return run.terminalId === terminalId &&
             run.passed === summary.passed &&
             run.failed === summary.failed &&
             run.total === summary.total &&
             timeDiff < 5000;
    });

    if (!isDuplicate) {
      const newRun = {
        id: Date.now(),
        terminalId,
        runner: summary.runner,
        status: summary.status,
        passed: summary.passed,
        failed: summary.failed,
        skipped: summary.skipped,
        total: summary.total,
        duration: summary.duration,
        timestamp: new Date()
      };

      history.unshift(newRun);

      if (history.length > 20) {
        projectTestHistory.set(state.activeProject.id, history.slice(0, 20));
      }

      testDashboardCallbacks.addTestRun(state.activeProject.id, {
        ...newRun,
        timestamp: newRun.timestamp.toISOString()
      }).catch(err => console.error('Failed to save test run:', err));
    }
  }

  updateTestDashboard();
  updateTestIndicators(terminalId);
}

// Update test indicators on terminal tabs
function updateTestIndicators(terminalId) {
  const terminalTab = document.querySelector(`.terminal-tab[data-id="${terminalId}"]`);
  if (terminalTab) {
    updateTestIndicatorElement(terminalTab, terminalId);
  }

  const terminalItem = document.querySelector(`.terminal-item[data-id="${terminalId}"]`);
  if (terminalItem) {
    updateTestIndicatorElement(terminalItem, terminalId);
  }
}

function updateTestIndicatorElement(element, terminalId) {
  const summary = state.testStatus.get(terminalId);

  const existingIndicator = element.querySelector('.test-status-indicator');
  if (existingIndicator) {
    existingIndicator.remove();
  }

  if (!summary || summary.status === 'none') return;

  const config = STATUS_CONFIG[summary.status] || STATUS_CONFIG.none;
  const indicator = document.createElement('span');
  indicator.className = `test-status-indicator test-status-${summary.status}`;
  indicator.style.cssText = `
    margin-left: 4px;
    color: ${config.color};
    font-size: 10px;
    ${config.animate ? 'animation: spin 1s linear infinite;' : ''}
  `;
  indicator.textContent = config.icon;
  indicator.title = `Tests: ${summary.passed}/${summary.total} ${config.label}`;

  const nameEl = element.querySelector('.name');
  if (nameEl) {
    nameEl.after(indicator);
  } else {
    element.appendChild(indicator);
  }
}

// Update the main test dashboard panel
export function updateTestDashboard() {
  if (isQATabActive()) {
    renderTestDashboardContent();
  }
}

// Create sparkline SVG for coverage trend
function createSparkline(history, width = 120, height = 24) {
  if (!history || history.length < 2) {
    return `<svg width="${width}" height="${height}" class="sparkline-empty">
      <text x="${width/2}" y="${height/2 + 4}" text-anchor="middle" fill="#64748b" font-size="10">No trend data</text>
    </svg>`;
  }

  const values = history.map(h => h.lines || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - 4) + 2;
    const y = height - 4 - ((v - min) / range) * (height - 8);
    return `${x},${y}`;
  }).join(' ');

  const lastValue = values[values.length - 1];
  const firstValue = values[0];
  const delta = lastValue - firstValue;
  const deltaColor = delta >= 0 ? '#22c55e' : '#ef4444';

  return `
    <svg width="${width}" height="${height}" class="sparkline">
      <polyline fill="none" stroke="${deltaColor}" stroke-width="2" points="${points}" />
      <circle cx="${(width - 4)}" cy="${height - 4 - ((lastValue - min) / range) * (height - 8)}" r="3" fill="${deltaColor}" />
    </svg>
  `;
}

// Create the test dashboard panel
export function createTestDashboard() {
  addTestDashboardStyles();
  renderTestDashboardContent();
}

// Render the full test dashboard content
function renderTestDashboardContent() {
  const panel = document.getElementById('qaPanel');
  if (!panel) return;

  const projectTerminalIds = getCurrentProjectTerminalIds();
  const discovery = getTestDiscovery();
  const coverage = getActiveCoverage();
  const history = getTestRunHistory();
  const covHistory = state.activeProject?.path ? coverageHistory.get(state.activeProject.path) : null;

  // Aggregate test results from terminal status
  let passedRun = 0, failedRun = 0, skippedRun = 0;
  let isRunning = false;

  for (const [terminalId, summary] of state.testStatus) {
    if (!projectTerminalIds.has(terminalId)) continue;
    if (summary.status === 'running') isRunning = true;
    passedRun += summary.passed || 0;
    failedRun += summary.failed || 0;
    skippedRun += summary.skipped || 0;
  }

  // Coverage data
  const coveragePct = coverage?.total?.lines?.pct || 0;
  const coverageFunctions = coverage?.total?.functions?.pct || 0;
  const coverageBranches = coverage?.total?.branches?.pct || 0;
  const coverageStatements = coverage?.total?.statements?.pct || 0;

  // Calculate health score
  const totalRun = passedRun + failedRun;
  const passRate = totalRun > 0 ? (passedRun / totalRun) * 100 : 0;
  const lastRun = history.length > 0 ? history[0].timestamp : null;
  const healthScore = calculateHealthScore(coveragePct, passRate, lastRun);
  const health = getHealthLabel(healthScore);

  // Test discovery counts
  const totalTests = discovery?.totalTests || 0;
  const unitTests = discovery?.unitTests || 0;
  const e2eTests = discovery?.e2eTests || 0;
  const integrationTests = discovery?.integrationTests || 0;

  // Calculate coverage delta
  let coverageDelta = null;
  if (covHistory?.entries?.length >= 2) {
    const latest = covHistory.entries[covHistory.entries.length - 1].lines;
    const previous = covHistory.entries[covHistory.entries.length - 2].lines;
    coverageDelta = latest - previous;
  }

  // Get last run for specific test type from history
  // Only returns runs if this test type has a dedicated command
  function getLastRunForType(testType) {
    // Don't show inherited runs if there's no dedicated command for this type
    if (!hasTestTypeCommand(testType)) {
      return null;
    }

    const typeRunners = {
      unit: ['vitest', 'jest', 'mocha'],
      integration: ['vitest', 'jest'],  // Only used if test:integration exists
      e2e: ['playwright', 'cypress']
    };
    const runners = typeRunners[testType] || [];
    return history.find(run => runners.includes(run.runner)) || null;
  }

  // Get test count - prefer runtime count over scan count
  // But only use runtime count if there's a command for this type
  function getTestCount(testType, scanCount) {
    if (!hasTestTypeCommand(testType)) {
      // No command = only show scan count
      return { count: scanCount, source: 'scan' };
    }
    const lastRun = getLastRunForType(testType);
    if (lastRun && lastRun.total > 0) {
      return { count: lastRun.total, source: 'run' };
    }
    return { count: scanCount, source: 'scan' };
  }

  // Infer test type from runner
  function getTestTypeFromRunner(runner) {
    if (runner === 'playwright' || runner === 'cypress') return 'e2e';
    return 'unit'; // Default to unit for vitest/jest
  }

  // Helper to render big test type card
  function renderBigTestCard(type, icon, label, scanCount, coveragePct, colorClass) {
    const lastTypeRun = getLastRunForType(type);
    const hasCommand = hasTestTypeCommand(type);
    const { count, source } = getTestCount(type, scanCount);

    return `
      <div class="qa-big-card ${colorClass}">
        <div class="qa-big-header">
          <span class="qa-big-icon">${icon}</span>
          <span class="qa-big-label">${label}</span>
        </div>

        <div class="qa-big-main">
          <div class="qa-big-count">${count}</div>
          <div class="qa-big-count-label">tests ${source === 'scan' ? '<span class="qa-count-source">(scanned)</span>' : ''}</div>
        </div>

        <div class="qa-big-stats">
          ${lastTypeRun ? `
            <div class="qa-stat-row">
              <span class="qa-stat-label">Last run:</span>
              <span class="qa-stat-value">${formatRelativeTime(lastTypeRun.timestamp)}</span>
            </div>
            <div class="qa-stat-row">
              <span class="qa-stat-label">Result:</span>
              <span class="qa-stat-value ${lastTypeRun.status}">
                ${lastTypeRun.status === 'passed' ? '✓' : '✗'} ${lastTypeRun.passed}/${lastTypeRun.total}
              </span>
            </div>
          ` : `
            <div class="qa-stat-row">
              <span class="qa-stat-label">Last run:</span>
              <span class="qa-stat-value dim">Never</span>
            </div>
          `}
          <div class="qa-stat-row">
            <span class="qa-stat-label">Coverage:</span>
            ${coveragePct > 0 ? `
              <div class="qa-stat-bar">
                <div class="qa-stat-fill" style="width: ${coveragePct}%; background: ${getCoverageColor(coveragePct)}"></div>
              </div>
              <span class="qa-stat-value">${coveragePct.toFixed(0)}%</span>
            ` : `<span class="qa-stat-value dim">--</span>`}
          </div>
        </div>

        ${hasCommand ? `
          <button class="qa-big-run" onclick="window.__qaRunTestType?.('${type}')">
            ▶ Run ${label}
          </button>
        ` : `
          <div class="qa-big-no-cmd">No test command</div>
        `}
      </div>
    `;
  }

  panel.innerHTML = `
    <div class="qa-dashboard">
      <div class="qa-header">
        <h2>QA Dashboard</h2>
        <div class="qa-header-actions">
          <span class="qa-health-badge" style="background: ${health.color}20; color: ${health.color}">
            ${health.icon} ${health.label} (${healthScore}/100)
          </span>
          <button class="qa-scan-btn" onclick="window.__qaScanTests?.()">🔄 Scan</button>
        </div>
      </div>

      <!-- Test Type Cards - 3 columns -->
      <div class="qa-big-cards">
        ${renderBigTestCard('unit', '⚡', 'Unit Tests', unitTests, coveragePct, 'unit')}
        ${renderBigTestCard('integration', '🔗', 'Integration', integrationTests, 0, 'integration')}
        ${renderBigTestCard('e2e', '🎭', 'E2E Tests', e2eTests, 0, 'e2e')}
      </div>

      <!-- Current Run Status -->
      ${isRunning ? `
        <div class="qa-running-banner">
          <span class="qa-running-icon">⟳</span>
          <span class="qa-running-text">Running tests...</span>
          <span class="qa-running-counts">✓${passedRun} ✗${failedRun}</span>
        </div>
      ` : ''}

      <!-- Recent Runs - Enhanced -->
      <div class="qa-section qa-recent-runs">
        <div class="qa-section-header">
          <span>Recent Runs</span>
          ${history.length > 0 ? `<span class="qa-section-count">${history.length} runs</span>` : ''}
        </div>
        <div class="qa-runs-grid">
          ${history.length === 0 ? `
            <div class="qa-runs-empty">
              <div class="qa-empty-icon">🧪</div>
              <div class="qa-empty-text">No test runs yet</div>
              <div class="qa-empty-hint">Run tests using the buttons above</div>
            </div>
          ` : history.slice(0, 6).map(run => {
            const testType = getTestTypeFromRunner(run.runner);
            const typeIcon = testType === 'e2e' ? '🎭' : testType === 'integration' ? '🔗' : '⚡';
            const typeLabel = testType === 'e2e' ? 'E2E' : testType === 'integration' ? 'INTEGRATION' : 'UNIT';
            const passRate = run.total > 0 ? Math.round((run.passed / run.total) * 100) : 0;
            return `
              <div class="qa-run-card status-${run.status}">
                <div class="qa-run-card-header">
                  <span class="qa-run-type">${typeIcon} <span class="qa-run-type-label">${typeLabel}</span></span>
                  <span class="qa-run-status-badge ${run.status}">
                    ${run.status === 'passed' ? '✓ Passed' : run.status === 'failed' ? '✗ Failed' : '◑ Mixed'}
                  </span>
                </div>
                <div class="qa-run-card-main">
                  <div class="qa-run-passed">${run.passed}</div>
                  <div class="qa-run-sep">/</div>
                  <div class="qa-run-total">${run.total}</div>
                </div>
                <div class="qa-run-card-bar">
                  <div class="qa-run-bar-fill" style="width: ${passRate}%"></div>
                </div>
                <div class="qa-run-card-footer">
                  <span class="qa-run-time">${formatRelativeTime(run.timestamp)}</span>
                  <span class="qa-run-runner">${run.runner || 'unknown'}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  // Attach global handlers
  window.__qaScanTests = scanTests;
  window.__qaRunTestType = runTestType;
  window.__qaRunFailed = runFailedTests;
}

function getCoverageColor(percent) {
  if (percent >= 80) return '#22c55e';
  if (percent >= 60) return '#eab308';
  if (percent >= 40) return '#f97316';
  return '#ef4444';
}

function formatRelativeTime(date) {
  if (!date) return '-';
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Show/hide QA panel
export function showQAPanel(show) {
  const qaPanel = document.getElementById('qaPanel');
  const browserInnerContent = document.getElementById('browserInnerContent');
  const dashboardPanel = document.getElementById('dashboardPanel');
  const structurePanel = document.getElementById('structurePanel');
  const gitPanel = document.getElementById('gitHistoryPanel');

  if (qaPanel) {
    qaPanel.style.display = show ? 'flex' : 'none';
  }

  if (show) {
    if (browserInnerContent) browserInnerContent.style.display = 'none';
    if (dashboardPanel) dashboardPanel.style.display = 'none';
    if (structurePanel) structurePanel.style.display = 'none';
    if (gitPanel) gitPanel.style.display = 'none';
  }
}

// Check if tests tab is active
export function isQATabActive() {
  return state.browser.activeTabId === QA_TAB_ID;
}

function addTestDashboardStyles() {
  if (document.getElementById('test-dashboard-styles')) return;

  const style = document.createElement('style');
  style.id = 'test-dashboard-styles';
  style.textContent = `
    /* QA Dashboard Container */
    .qa-dashboard {
      padding: 20px;
      background: #0f172a;
      color: #e2e8f0;
      overflow-y: auto;
      height: 100%;
    }

    .qa-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .qa-header h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #f1f5f9;
    }

    .qa-scan-btn {
      padding: 8px 16px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      color: #94a3b8;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.2s;
    }

    .qa-scan-btn:hover {
      background: #334155;
      color: #f1f5f9;
    }

    .qa-scan-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Summary Cards */
    .qa-summary-cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 20px;
    }

    .qa-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 16px;
      display: flex;
      gap: 12px;
      transition: all 0.2s;
    }

    .qa-card:hover {
      border-color: #475569;
      transform: translateY(-2px);
    }

    .qa-card-icon {
      font-size: 32px;
    }

    .qa-card-content {
      flex: 1;
      min-width: 0;
    }

    .qa-card-label {
      font-size: 12px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }

    .qa-card-value {
      font-size: 28px;
      font-weight: 700;
      color: #f1f5f9;
      line-height: 1.2;
    }

    .qa-card-detail {
      font-size: 12px;
      color: #64748b;
      margin-top: 4px;
    }

    .qa-card-detail .passed { color: #22c55e; }
    .qa-card-detail .failed { color: #ef4444; }
    .qa-card-detail .skipped { color: #64748b; }
    .qa-card-detail .running { color: #eab308; animation: pulse 1s infinite; }
    .qa-card-detail .hint { color: #64748b; font-style: italic; }

    .qa-card.has-passed { border-color: #22c55e40; }
    .qa-card.has-failed { border-color: #ef444440; }
    .qa-card.has-failed .qa-card-value { color: #ef4444; }

    /* Coverage card */
    .qa-card-bar {
      height: 6px;
      background: #334155;
      border-radius: 3px;
      margin-top: 8px;
      overflow: hidden;
    }

    .qa-card-bar-fill {
      height: 100%;
      background: #22c55e;
      transition: width 0.3s;
    }

    .qa-card-coverage.good .qa-card-value { color: #22c55e; }
    .qa-card-coverage.good .qa-card-bar-fill { background: #22c55e; }
    .qa-card-coverage.warning .qa-card-value { color: #eab308; }
    .qa-card-coverage.warning .qa-card-bar-fill { background: #eab308; }
    .qa-card-coverage.low .qa-card-value { color: #ef4444; }
    .qa-card-coverage.low .qa-card-bar-fill { background: #ef4444; }

    .qa-card-delta {
      font-size: 11px;
      margin-top: 4px;
    }
    .qa-card-delta.positive { color: #22c55e; }
    .qa-card-delta.negative { color: #ef4444; }

    /* Health card */
    .qa-health-value {
      color: var(--health-color, #64748b);
    }

    /* Section styling */
    .qa-section {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 16px;
    }

    .qa-section-header {
      font-size: 13px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
      font-weight: 500;
    }

    /* Quick Actions */
    .qa-actions-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .qa-action-btn {
      padding: 10px 16px;
      background: #334155;
      border: 1px solid #475569;
      border-radius: 8px;
      color: #f1f5f9;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s;
    }

    .qa-action-btn:hover {
      background: #475569;
      transform: translateY(-1px);
    }

    .qa-action-btn:active {
      transform: translateY(0);
    }

    .qa-action-retry {
      background: #f9731620;
      border-color: #f9731640;
      color: #f97316;
    }

    .qa-action-retry:hover {
      background: #f9731630;
    }

    .qa-no-scripts {
      color: #64748b;
      font-size: 12px;
      margin: 8px 0 0 0;
      font-style: italic;
    }

    /* Test Breakdown */
    .qa-breakdown-rows {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .qa-breakdown-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .qa-breakdown-icon {
      width: 24px;
      font-size: 16px;
    }

    .qa-breakdown-label {
      width: 80px;
      font-size: 13px;
      color: #94a3b8;
    }

    .qa-breakdown-bar {
      flex: 1;
      height: 8px;
      background: #334155;
      border-radius: 4px;
      overflow: hidden;
    }

    .qa-breakdown-fill {
      height: 100%;
      transition: width 0.3s;
    }

    .qa-breakdown-fill.unit { background: #3b82f6; }
    .qa-breakdown-fill.integration { background: #8b5cf6; }
    .qa-breakdown-fill.e2e { background: #ec4899; }

    .qa-breakdown-count {
      width: 70px;
      text-align: right;
      font-size: 13px;
      color: #64748b;
    }

    /* Coverage Breakdown */
    .qa-coverage-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }

    .qa-coverage-metric {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .qa-coverage-label {
      font-size: 12px;
      color: #64748b;
    }

    .qa-coverage-bar-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .qa-coverage-bar {
      flex: 1;
      height: 6px;
      background: #334155;
      border-radius: 3px;
      overflow: hidden;
    }

    .qa-coverage-fill {
      height: 100%;
      transition: width 0.3s;
    }

    .qa-coverage-pct {
      width: 48px;
      text-align: right;
      font-size: 12px;
      color: #94a3b8;
    }

    .qa-coverage-trend {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid #334155;
    }

    .qa-trend-label {
      font-size: 12px;
      color: #64748b;
    }

    .qa-trend-delta {
      font-size: 12px;
      font-weight: 500;
    }
    .qa-trend-delta.positive { color: #22c55e; }
    .qa-trend-delta.negative { color: #ef4444; }

    .sparkline {
      display: block;
    }

    /* Recent Runs */
    .qa-runs-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .qa-runs-empty {
      text-align: center;
      color: #64748b;
      padding: 24px;
      font-size: 13px;
    }

    .qa-run-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      background: #0f172a;
      border-radius: 8px;
      font-size: 13px;
    }

    .qa-run-item.status-passed { border-left: 3px solid #22c55e; }
    .qa-run-item.status-failed { border-left: 3px solid #ef4444; }
    .qa-run-item.status-mixed { border-left: 3px solid #f97316; }

    .qa-run-status {
      font-size: 14px;
      width: 20px;
    }

    .qa-run-item.status-passed .qa-run-status { color: #22c55e; }
    .qa-run-item.status-failed .qa-run-status { color: #ef4444; }
    .qa-run-item.status-mixed .qa-run-status { color: #f97316; }

    .qa-run-time {
      color: #64748b;
      width: 80px;
    }

    .qa-run-runner {
      color: #94a3b8;
      flex: 1;
    }

    .qa-run-results {
      color: #f1f5f9;
      font-weight: 500;
    }

    .qa-run-duration {
      color: #64748b;
      width: 50px;
      text-align: right;
    }

    /* Header Actions */
    .qa-header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .qa-health-badge {
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
    }

    /* Big Test Cards - 3 columns */
    .qa-big-cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 20px;
    }

    .qa-big-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      transition: all 0.2s;
    }

    .qa-big-card:hover {
      border-color: #475569;
      transform: translateY(-2px);
    }

    .qa-big-card.unit { border-top: 3px solid #3b82f6; }
    .qa-big-card.integration { border-top: 3px solid #8b5cf6; }
    .qa-big-card.e2e { border-top: 3px solid #ec4899; }

    .qa-big-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }

    .qa-big-icon {
      font-size: 24px;
    }

    .qa-big-label {
      font-size: 14px;
      font-weight: 600;
      color: #f1f5f9;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .qa-big-main {
      text-align: center;
      margin-bottom: 16px;
    }

    .qa-big-count {
      font-size: 48px;
      font-weight: 700;
      color: #f1f5f9;
      line-height: 1;
    }

    .qa-big-count-label {
      font-size: 12px;
      color: #64748b;
      margin-top: 4px;
    }

    .qa-count-source {
      font-size: 10px;
      color: #475569;
      font-style: italic;
    }

    .qa-big-stats {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }

    .qa-stat-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .qa-stat-label {
      font-size: 12px;
      color: #64748b;
      min-width: 70px;
    }

    .qa-stat-value {
      font-size: 12px;
      color: #f1f5f9;
      font-weight: 500;
    }

    .qa-stat-value.dim { color: #475569; }
    .qa-stat-value.passed { color: #22c55e; }
    .qa-stat-value.failed { color: #ef4444; }
    .qa-stat-value.mixed { color: #f97316; }

    .qa-stat-bar {
      flex: 1;
      height: 6px;
      background: #334155;
      border-radius: 3px;
      overflow: hidden;
      max-width: 80px;
    }

    .qa-stat-fill {
      height: 100%;
      transition: width 0.3s;
    }

    .qa-big-run {
      width: 100%;
      padding: 12px;
      background: #334155;
      border: 1px solid #475569;
      border-radius: 8px;
      color: #f1f5f9;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.2s;
    }

    .qa-big-run:hover {
      background: #22c55e;
      border-color: #22c55e;
      color: white;
    }

    .qa-big-no-cmd {
      text-align: center;
      font-size: 12px;
      color: #475569;
      padding: 12px;
    }

    /* Running Banner */
    .qa-running-banner {
      background: #eab30815;
      border: 1px solid #eab30840;
      border-radius: 10px;
      padding: 12px 20px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .qa-running-icon {
      font-size: 20px;
      animation: spin 1s linear infinite;
    }

    .qa-running-text {
      flex: 1;
      color: #eab308;
      font-weight: 500;
    }

    .qa-running-counts {
      font-size: 13px;
      color: #94a3b8;
    }

    /* Recent Runs - Grid Layout */
    .qa-section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .qa-section-count {
      font-size: 11px;
      color: #64748b;
      font-weight: normal;
    }

    .qa-runs-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }

    .qa-runs-empty {
      grid-column: 1 / -1;
      text-align: center;
      padding: 40px 20px;
    }

    .qa-empty-icon {
      font-size: 40px;
      margin-bottom: 12px;
      opacity: 0.5;
    }

    .qa-empty-text {
      color: #94a3b8;
      font-size: 14px;
      margin-bottom: 4px;
    }

    .qa-empty-hint {
      color: #64748b;
      font-size: 12px;
    }

    .qa-run-card {
      background: #0f172a;
      border-radius: 10px;
      padding: 14px;
      border-left: 3px solid #334155;
    }

    .qa-run-card.status-passed { border-left-color: #22c55e; }
    .qa-run-card.status-failed { border-left-color: #ef4444; }
    .qa-run-card.status-mixed { border-left-color: #f97316; }

    .qa-run-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .qa-run-type {
      font-size: 18px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .qa-run-type-label {
      font-size: 10px;
      font-weight: 700;
      color: #94a3b8;
      letter-spacing: 0.5px;
    }

    .qa-run-status-badge {
      font-size: 10px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 10px;
      text-transform: uppercase;
    }

    .qa-run-status-badge.passed { background: #22c55e20; color: #22c55e; }
    .qa-run-status-badge.failed { background: #ef444420; color: #ef4444; }
    .qa-run-status-badge.mixed { background: #f9731620; color: #f97316; }

    .qa-run-card-main {
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: 4px;
      margin-bottom: 8px;
    }

    .qa-run-passed {
      font-size: 28px;
      font-weight: 700;
      color: #22c55e;
    }

    .qa-run-sep {
      font-size: 20px;
      color: #475569;
    }

    .qa-run-total {
      font-size: 20px;
      color: #94a3b8;
    }

    .qa-run-card-bar {
      height: 4px;
      background: #334155;
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 10px;
    }

    .qa-run-card.status-passed .qa-run-bar-fill { background: #22c55e; width: 100%; }
    .qa-run-card.status-failed .qa-run-bar-fill { background: #ef4444; }
    .qa-run-card.status-mixed .qa-run-bar-fill { background: #f97316; }

    .qa-run-card-footer {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #64748b;
    }

    .qa-run-runner {
      text-transform: capitalize;
    }

    /* Test status indicator on terminal tabs */
    .test-status-indicator {
      display: inline-block;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    /* Responsive */
    @media (max-width: 1200px) {
      .qa-big-cards {
        grid-template-columns: repeat(2, 1fr);
      }
      .qa-runs-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 800px) {
      .qa-big-cards {
        grid-template-columns: 1fr;
      }
      .qa-runs-grid {
        grid-template-columns: 1fr;
      }
      .qa-header {
        flex-direction: column;
        gap: 12px;
        align-items: flex-start;
      }
      .qa-header-actions {
        width: 100%;
        justify-content: space-between;
      }
    }

  `;
  document.head.appendChild(style);
}

// Initialize test dashboard on load
export function initTestDashboard() {
  createTestDashboard();

  if (window.runtime && window.runtime.EventsOn) {
    window.runtime.EventsOn('test-status', (data) => {
      if (data && data.terminalId && data.summary) {
        updateTestStatus(data.terminalId, data.summary);
      }
    });

    window.runtime.EventsOn('coverage-update', (data) => {
      if (data && data.projectPath && data.summary) {
        updateCoverage(data.projectPath, data.summary);
      }
    });
  }
}

// Update coverage data from backend
export function updateCoverage(projectPath, summary) {
  projectCoverage.set(projectPath, summary);

  // Update history
  if (!coverageHistory.has(projectPath)) {
    coverageHistory.set(projectPath, { entries: [] });
  }
  const history = coverageHistory.get(projectPath);
  history.entries.push({
    timestamp: new Date(),
    lines: summary.total?.lines?.pct || 0,
    functions: summary.total?.functions?.pct || 0,
    branches: summary.total?.branches?.pct || 0
  });
  // Keep last 50 entries
  if (history.entries.length > 50) {
    history.entries = history.entries.slice(-50);
  }

  updateTestDashboard();
}

// Get coverage for the active project
export function getActiveCoverage() {
  if (!state.activeProject) return null;
  return projectCoverage.get(state.activeProject.path);
}

// Clear test status for a terminal
export function clearTestStatus(terminalId) {
  state.testStatus.delete(terminalId);
  updateTestDashboard();
}

// Get overall test status (for current project only)
export function getOverallTestStatus() {
  const projectTerminalIds = getCurrentProjectTerminalIds();
  let isRunning = false;
  let hasFailed = false;
  let hasPassed = false;

  for (const [terminalId, summary] of state.testStatus) {
    if (!projectTerminalIds.has(terminalId)) continue;
    if (summary.status === 'running') isRunning = true;
    if (summary.failed > 0) hasFailed = true;
    if (summary.passed > 0) hasPassed = true;
  }

  if (isRunning) return 'running';
  if (hasFailed) return hasPassed ? 'mixed' : 'failed';
  if (hasPassed) return 'passed';
  return 'none';
}

// Project Switcher Handler
export function initTestDashboardHandler() {
  registerStateHandler('testDashboard', {
    priority: 80,

    onBeforeSwitch: async (ctx) => {
      // Nothing to cleanup
    },

    onSave: async (ctx) => {
      // Test runs are saved to backend as they happen
    },

    onLoad: async (ctx) => {
      await loadTestHistory();
    },

    onAfterSwitch: async (ctx) => {
      setTimeout(() => updateTestDashboard(), 100);
    }
  });
}
