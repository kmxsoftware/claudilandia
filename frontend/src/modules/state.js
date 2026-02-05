// Device presets for responsive mode
export const DEVICES = [
  { name: 'Desktop', width: null, height: null, icon: '🖥️' },
  { name: 'iPhone SE', width: 375, height: 667, icon: '📱' },
  { name: 'iPhone 14 Pro', width: 393, height: 852, icon: '📱' },
  { name: 'iPhone 14 Pro Max', width: 430, height: 932, icon: '📱' },
  { name: 'iPad Mini', width: 768, height: 1024, icon: '📱' },
  { name: 'iPad Pro 11"', width: 834, height: 1194, icon: '📱' },
  { name: 'iPad Pro 12.9"', width: 1024, height: 1366, icon: '📱' },
  { name: 'Samsung Galaxy S21', width: 360, height: 800, icon: '📱' },
  { name: 'Samsung Galaxy Tab', width: 800, height: 1280, icon: '📱' },
  { name: 'Pixel 7', width: 412, height: 915, icon: '📱' },
  { name: 'Custom', width: 375, height: 667, icon: '⚙️', custom: true }
];

// Application State - reactive view state only (backend is source of truth)
export const state = {
  projects: [],
  activeProject: null,
  projectTerminals: new Map(), // projectId -> Map(termId -> { terminal, fitAddon, info, resizeObserver })
  activeTerminalId: null,
  activeTab: 'terminal',
  dockerAvailable: false,
  containers: [],
  colors: [],
  icons: [],
  browser: {
    device: DEVICES[0],
    rotated: false,
    scale: 100,
    url: '',
    loading: false,
    error: null,
    history: [],       // URL history for back/forward
    historyIndex: -1,  // Current position in history
    devToolsOpen: false,
    devToolsTab: 'console', // 'console' | 'network'
    consoleLogs: [],   // Console entries from iframe
    networkRequests: [], // Network requests from iframe
    bookmarks: [],      // Dynamic bookmarks
    tabs: [],           // Browser tabs array [{id, url, title, active}]
    activeTabId: null,  // Active tab ID
    minimized: false    // Panel minimized to sidebar
  },
  splitView: true, // Always show terminal + browser side by side
  splitRatio: 50,
  git: {
    isRepo: false,
    branch: '',
    changedFiles: [],
    expanded: true,
    currentDiffFile: null
  },
  claudeStatus: new Map(), // terminalId -> status
  testStatus: new Map(), // terminalId -> { runner, status, passed, failed, skipped, total, duration, coveragePercent, failedTests }
  terminalFontSize: 14, // Terminal font size
  terminalTheme: 'dracula', // Terminal color theme
  diffSelection: {
    active: false,
    pane: null,       // 'old' | 'new'
    startLine: null,
    endLine: null,
    filePath: null,
    rawLines: []      // Original line content for copying
  },
  // Notes section state
  notesExpanded: true,
  // Pomodoro timer state
  pomodoro: {
    sessionMinutes: 25,    // Default 25 min session
    breakMinutes: 5,       // Default 5 min break
    isRunning: false,
    isBreak: false,
    timeRemaining: 25 * 60, // Seconds remaining
    isCompleted: false      // True when timer hits 0, waiting for OK
  }
};

// Helper to get current project's terminals
export function getTerminals() {
  if (!state.activeProject) return new Map();
  if (!state.projectTerminals.has(state.activeProject.id)) {
    state.projectTerminals.set(state.activeProject.id, new Map());
  }
  return state.projectTerminals.get(state.activeProject.id);
}
