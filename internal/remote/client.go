package remote

// clientHTML is the embedded HTML for the mobile web client
// Uses Catppuccin Mocha color theme to match ProjectHub desktop app
const clientHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="theme-color" content="#181825">
    <meta name="referrer" content="no-referrer">
    <title>Claudilandia Remote</title>
    <link rel="stylesheet" href="https://unpkg.com/xterm@5.3.0/css/xterm.css">
    <style>
        :root {
            --bg-primary: #1e1e2e;
            --bg-secondary: #181825;
            --bg-tertiary: #11111b;
            --bg-surface: #313244;
            --text-primary: #cdd6f4;
            --text-secondary: #a6adc8;
            --text-muted: #6c7086;
            --accent: #89b4fa;
            --success: #a6e3a1;
            --error: #f38ba8;
            --warning: #fab387;
            --border: #45475a;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        html, body {
            height: 100%;
            width: 100%;
            overflow: hidden;
            background: var(--bg-secondary);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .container {
            display: flex;
            flex-direction: column;
            height: 100%;
            width: 100%;
            padding-top: env(safe-area-inset-top);
            background: var(--bg-primary);
        }

        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
        }

        .header h1 {
            font-size: 14px;
            color: var(--accent);
            font-weight: 600;
        }

        .status {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: var(--text-muted);
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--text-muted);
        }

        .status-dot.connected {
            background: var(--success);
        }

        .status-dot.disconnected {
            background: var(--error);
        }

        /* Projects bar */
        .projects-bar {
            display: flex;
            gap: 6px;
            padding: 8px 12px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
            overflow-x: auto;
            flex-shrink: 0;
            -webkit-overflow-scrolling: touch;
        }

        .project-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 14px;
            background: var(--bg-surface);
            color: var(--text-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            font-size: 13px;
            white-space: nowrap;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .project-btn:active {
            transform: scale(0.98);
        }

        .project-btn.active {
            background: var(--accent);
            color: var(--bg-tertiary);
            border-color: var(--accent);
        }

        .project-icon {
            font-size: 16px;
        }

        .project-color {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }

        /* Terminals tabs */
        .terminals-bar {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 6px 12px;
            background: var(--bg-tertiary);
            border-bottom: 1px solid var(--border);
            overflow-x: auto;
            flex-shrink: 0;
            -webkit-overflow-scrolling: touch;
        }

        .terminal-tab {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: transparent;
            color: var(--text-muted);
            border: none;
            border-radius: 6px;
            font-size: 12px;
            white-space: nowrap;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .terminal-tab:active {
            transform: scale(0.98);
        }

        .terminal-tab.active {
            background: var(--bg-surface);
            color: var(--text-primary);
        }

        .terminal-tab .running-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--success);
        }

        .terminal-tab .stopped-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--text-muted);
        }

        .terminal-actions {
            display: flex;
            gap: 4px;
            margin-left: auto;
            padding-left: 8px;
        }

        .action-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            background: var(--bg-surface);
            color: var(--text-secondary);
            border: 1px solid var(--border);
            border-radius: 6px;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .action-btn:active {
            transform: scale(0.95);
            background: var(--accent);
            color: var(--bg-tertiary);
        }

        .action-btn.danger:active {
            background: var(--error);
        }

        .terminal-container {
            flex: 1;
            overflow: auto;
            padding: 4px;
            padding-bottom: calc(4px + env(safe-area-inset-bottom));
            background: var(--bg-primary);
            -webkit-overflow-scrolling: touch;
        }

        /* Make scrollbars visible on touch devices */
        .terminal-container::-webkit-scrollbar,
        .xterm-viewport::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }

        .terminal-container::-webkit-scrollbar-track,
        .xterm-viewport::-webkit-scrollbar-track {
            background: var(--bg-tertiary);
        }

        .terminal-container::-webkit-scrollbar-thumb,
        .xterm-viewport::-webkit-scrollbar-thumb {
            background: var(--bg-surface);
            border-radius: 3px;
        }

        .terminal-container::-webkit-scrollbar-thumb:active,
        .xterm-viewport::-webkit-scrollbar-thumb:active {
            background: var(--accent);
        }

        #terminal {
            height: 100%;
            width: 100%;
            position: relative;
        }

        .term-wrapper {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
        }

        .xterm {
            height: 100%;
            padding: 4px;
        }

        .xterm-viewport {
            overflow: auto !important;
            -webkit-overflow-scrolling: touch;
        }

        .xterm-screen {
            touch-action: pan-x pan-y;
        }

        /* Horizontal scroll wrapper for terminal content */
        .xterm-rows {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
        }

        /* Mobile keyboard helper */
        .keyboard-helper {
            display: none;
            padding: 8px;
            background: var(--bg-secondary);
            border-top: 1px solid var(--border);
            flex-shrink: 0;
        }

        .keyboard-helper.active {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }

        .key-btn {
            background: var(--bg-surface);
            color: var(--text-primary);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 8px 12px;
            font-size: 11px;
            font-family: 'SF Mono', Monaco, monospace;
            touch-action: manipulation;
            transition: all 0.15s ease;
        }

        .key-btn:active {
            background: var(--accent);
            color: var(--bg-tertiary);
            border-color: var(--accent);
        }

        /* Bottom status bar */
        .status-bar {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            padding-bottom: calc(8px + env(safe-area-inset-bottom));
            background: var(--bg-secondary);
            border-top: 1px solid var(--border);
            gap: 8px;
            flex-shrink: 0;
        }

        .toolbar-btn {
            height: 44px;
            padding: 0 16px;
            border-radius: 8px;
            background: var(--bg-surface);
            border: 1px solid var(--border);
            color: var(--text-primary);
            font-size: 13px;
            font-weight: 500;
            font-family: 'SF Mono', Monaco, monospace;
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;
            transition: all 0.15s ease;
            cursor: pointer;
        }

        .toolbar-btn:active {
            background: var(--accent);
            border-color: var(--accent);
            color: var(--bg-tertiary);
            transform: scale(0.95);
        }

        .toolbar-spacer {
            flex: 1;
        }

        .mic-btn {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: var(--bg-surface);
            border: 1px solid var(--border);
            color: var(--text-secondary);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            touch-action: none;
            user-select: none;
            -webkit-user-select: none;
            transition: all 0.15s ease;
            cursor: pointer;
            flex-shrink: 0;
        }

        .mic-btn:active,
        .mic-btn.recording {
            background: var(--error);
            border-color: var(--error);
            color: white;
            transform: scale(1.1);
        }

        .mic-btn.recording {
            animation: pulse 1s infinite;
        }

        @keyframes pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(243, 139, 168, 0.4); }
            50% { box-shadow: 0 0 0 12px rgba(243, 139, 168, 0); }
        }

        .mic-status {
            font-size: 11px;
            color: var(--text-muted);
            max-width: 120px;
            text-align: right;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .mic-status.recording {
            color: var(--error);
            font-weight: 500;
        }

        /* Empty state */
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--text-muted);
            text-align: center;
            padding: 20px;
        }

        .empty-state h3 {
            font-size: 16px;
            margin-bottom: 8px;
            color: var(--text-secondary);
        }

        .empty-state p {
            font-size: 13px;
        }

        /* Modal */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(17, 17, 27, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 200;
            padding: 20px;
        }

        .modal-overlay.hidden {
            display: none;
        }

        .modal {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 20px;
            width: 100%;
            max-width: 320px;
        }

        .modal h3 {
            font-size: 16px;
            color: var(--text-primary);
            margin-bottom: 16px;
        }

        .modal input {
            width: 100%;
            padding: 10px 12px;
            background: var(--bg-surface);
            color: var(--text-primary);
            border: 1px solid var(--border);
            border-radius: 8px;
            font-size: 14px;
            margin-bottom: 16px;
        }

        .modal input:focus {
            outline: none;
            border-color: var(--accent);
        }

        .modal-actions {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }

        .modal-btn {
            padding: 10px 16px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .modal-btn.cancel {
            background: transparent;
            color: var(--text-secondary);
            border: 1px solid var(--border);
        }

        .modal-btn.primary {
            background: var(--accent);
            color: var(--bg-tertiary);
            border: none;
        }

        .modal-btn.danger {
            background: var(--error);
            color: var(--bg-tertiary);
            border: none;
        }

        /* Overlay states */
        .overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(17, 17, 27, 0.95);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 100;
        }

        .overlay.hidden {
            display: none;
        }

        .overlay h2 {
            color: var(--accent);
            margin-bottom: 16px;
            font-size: 18px;
        }

        .overlay p {
            color: var(--text-muted);
            text-align: center;
            max-width: 300px;
            font-size: 14px;
        }

        .spinner {
            width: 40px;
            height: 40px;
            border: 3px solid var(--bg-surface);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 16px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .retry-btn {
            margin-top: 16px;
            background: var(--accent);
            color: var(--bg-tertiary);
            border: none;
            border-radius: 8px;
            padding: 12px 24px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .retry-btn:active {
            transform: scale(0.98);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Claudilandia Remote</h1>
            <div class="status">
                <div class="status-dot" id="statusDot"></div>
                <span id="statusText">Connecting...</span>
            </div>
        </div>

        <div class="projects-bar" id="projectsBar">
            <!-- Projects will be rendered here -->
        </div>

        <div class="terminals-bar" id="terminalsBar">
            <!-- Terminals will be rendered here -->
            <div class="terminal-actions">
                <button class="action-btn" id="addTerminalBtn" title="New Terminal">+</button>
                <button class="action-btn" id="editTerminalBtn" title="Rename Terminal">✎</button>
                <button class="action-btn danger" id="deleteTerminalBtn" title="Close Terminal">×</button>
            </div>
        </div>

        <div class="terminal-container" id="terminalContainer">
            <div id="terminal"></div>
            <div class="empty-state hidden" id="emptyState">
                <h3>No Terminal Selected</h3>
                <p>Select a project and terminal above, or create a new terminal</p>
            </div>
        </div>

        <div class="keyboard-helper" id="keyboardHelper">
            <button class="key-btn" data-key="Escape">ESC</button>
            <button class="key-btn" data-key="Tab">TAB</button>
            <button class="key-btn" data-key="Control">CTRL</button>
            <button class="key-btn" data-seq="\x03">^C</button>
            <button class="key-btn" data-seq="\x04">^D</button>
            <button class="key-btn" data-seq="\x1a">^Z</button>
            <button class="key-btn" data-key="ArrowUp">↑</button>
            <button class="key-btn" data-key="ArrowDown">↓</button>
            <button class="key-btn" data-key="ArrowLeft">←</button>
            <button class="key-btn" data-key="ArrowRight">→</button>
        </div>

        <div class="status-bar" id="statusBar">
            <button class="toolbar-btn" id="shiftTabBtn" title="Shift+Tab">⇧+TAB</button>
            <button class="toolbar-btn" id="escBtn" title="Escape">ESC</button>
            <button class="toolbar-btn" id="enterBtn" title="Enter">↵</button>
            <span class="toolbar-spacer"></span>
            <span class="mic-status" id="micStatus"></span>
            <button class="mic-btn" id="micBtn" title="Voice input">🎤</button>
        </div>
    </div>

    <!-- Create/Rename Modal -->
    <div class="modal-overlay hidden" id="terminalModal">
        <div class="modal">
            <h3 id="modalTitle">New Terminal</h3>
            <input type="text" id="terminalNameInput" placeholder="Terminal name" />
            <div class="modal-actions">
                <button class="modal-btn cancel" id="modalCancel">Cancel</button>
                <button class="modal-btn primary" id="modalConfirm">Create</button>
            </div>
        </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div class="modal-overlay hidden" id="deleteModal">
        <div class="modal">
            <h3>Close Terminal?</h3>
            <p style="color: var(--text-muted); margin-bottom: 16px; font-size: 13px;">
                This will close the terminal session. This action cannot be undone.
            </p>
            <div class="modal-actions">
                <button class="modal-btn cancel" id="deleteCancel">Cancel</button>
                <button class="modal-btn danger" id="deleteConfirm">Close</button>
            </div>
        </div>
    </div>

    <div class="overlay" id="loadingOverlay">
        <div class="spinner"></div>
        <h2>Connecting...</h2>
        <p>Establishing secure connection to terminal</p>
    </div>

    <div class="overlay hidden" id="errorOverlay">
        <h2 id="errorTitle">Connection Lost</h2>
        <p id="errorMessage">Unable to connect to the remote terminal.</p>
        <button class="retry-btn" onclick="reconnect()">Reconnect</button>
    </div>

    <script src="https://unpkg.com/xterm@5.3.0/lib/xterm.js"></script>
    <script src="https://unpkg.com/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>
    <script src="https://unpkg.com/xterm-addon-webgl@0.16.0/lib/xterm-addon-webgl.js"></script>
    <script>
        const STORAGE_KEY = 'claudilandia_remote_token';

        // Get token from URL or localStorage
        const params = new URLSearchParams(window.location.search);
        let token = params.get('token');

        if (!token) {
            token = localStorage.getItem(STORAGE_KEY);
        }

        if (!token) {
            showError('No Token', 'Access token is required. Please use the link from ProjectHub.');
        }

        // Check if token is approved and save to localStorage
        async function checkAndSaveToken() {
            if (!token) return;
            try {
                const response = await fetch('/api/token-info?token=' + encodeURIComponent(token));
                if (response.ok) {
                    const data = await response.json();
                    if (data.approved) {
                        localStorage.setItem(STORAGE_KEY, token);
                    }
                } else if (response.status === 401) {
                    localStorage.removeItem(STORAGE_KEY);
                    showError('Invalid Token', 'Your saved token is no longer valid.');
                }
            } catch (err) {
                console.error('Failed to check token:', err);
            }
        }

        // State
        let ws = null;
        let projects = [];
        let currentProjectId = null;
        let currentTerminalId = null;
        let reconnectAttempts = 0;
        let reconnectTimeout = null;
        let ctrlPressed = false;
        let modalMode = null; // 'create' or 'rename'

        // Terminal instances - persisted across project switches
        const terminalInstances = new Map(); // termId -> { term, fitAddon, wrapper }

        // Terminal theme config
        const terminalTheme = {
            background: '#1e1e2e',
            foreground: '#cdd6f4',
            cursor: '#89b4fa',
            cursorAccent: '#1e1e2e',
            selectionBackground: 'rgba(137, 180, 250, 0.3)',
            black: '#45475a',
            red: '#f38ba8',
            green: '#a6e3a1',
            yellow: '#f9e2af',
            blue: '#89b4fa',
            magenta: '#cba6f7',
            cyan: '#94e2d5',
            white: '#bac2de',
            brightBlack: '#585b70',
            brightRed: '#f38ba8',
            brightGreen: '#a6e3a1',
            brightYellow: '#f9e2af',
            brightBlue: '#89b4fa',
            brightMagenta: '#cba6f7',
            brightCyan: '#94e2d5',
            brightWhite: '#a6adc8'
        };

        // Get or create terminal instance
        function getOrCreateTerminal(termId) {
            if (terminalInstances.has(termId)) {
                return terminalInstances.get(termId);
            }

            // Create new terminal instance
            const term = new Terminal({
                cursorBlink: true,
                cursorStyle: 'block',
                fontSize: 14,
                fontFamily: '"SF Mono", "Monaco", "Inconsolata", "Fira Code", monospace',
                scrollback: 2000,
                smoothScrollDuration: 100,
                theme: terminalTheme,
                allowProposedApi: true
            });

            const fitAddon = new FitAddon.FitAddon();
            term.loadAddon(fitAddon);

            // Create wrapper div
            const wrapper = document.createElement('div');
            wrapper.id = 'term-wrapper-' + termId;
            wrapper.className = 'term-wrapper';
            wrapper.style.display = 'none';
            wrapper.style.height = '100%';
            wrapper.style.width = '100%';
            document.getElementById('terminal').appendChild(wrapper);

            term.open(wrapper);

            // Load WebGL addon
            try {
                const webglAddon = new WebglAddon.WebglAddon();
                webglAddon.onContextLoss(() => webglAddon.dispose());
                term.loadAddon(webglAddon);
            } catch (e) {
                console.warn('WebGL addon failed for terminal', termId, e);
            }

            // Handle input
            term.onData(data => {
                if (ws && ws.readyState === WebSocket.OPEN && currentTerminalId === termId) {
                    ws.send(JSON.stringify({
                        type: 'input',
                        termId: termId,
                        data: data
                    }));
                }
            });

            // Handle focus for keyboard helper
            term.textarea.addEventListener('focus', () => {
                document.getElementById('keyboardHelper').classList.add('active');
            });
            term.textarea.addEventListener('blur', () => {
                setTimeout(() => {
                    document.getElementById('keyboardHelper').classList.remove('active');
                }, 200);
            });

            const instance = { term, fitAddon, wrapper };
            terminalInstances.set(termId, instance);

            return instance;
        }

        // Get current terminal instance
        function getCurrentTerminal() {
            if (!currentTerminalId) return null;
            return terminalInstances.get(currentTerminalId);
        }

        // Initialize (just setup resize handler)
        function initTerminal() {
            window.addEventListener('resize', () => {
                const current = getCurrentTerminal();
                if (current) {
                    current.fitAddon.fit();
                    sendResize();
                }
            });
        }

        // Connect WebSocket
        function connect() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = protocol + '//' + window.location.host + '/ws/terminal?token=' + token;

            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                hideOverlays();
                setStatus('connected', 'Connected');
                reconnectAttempts = 0;
                ws.send(JSON.stringify({ type: 'list' }));
                checkAndSaveToken();
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    handleMessage(msg);
                } catch (err) {
                    console.error('Error handling message:', err, event.data);
                }
            };

            ws.onclose = () => {
                setStatus('disconnected', 'Disconnected');
                scheduleReconnect();
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                setStatus('disconnected', 'Error');
            };
        }

        // Decode base64 to UTF-8 string (atob returns Latin-1, not UTF-8)
        function base64ToUtf8(base64) {
            try {
                const binary = atob(base64);
                const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
                return new TextDecoder('utf-8').decode(bytes);
            } catch (err) {
                console.error('base64ToUtf8 error:', err, base64);
                return base64 || '';
            }
        }

        // Handle server messages
        function handleMessage(msg) {
            switch (msg.type) {
                case 'output':
                    // Write to terminal instance (even if not currently displayed)
                    const termInstance = terminalInstances.get(msg.termId);
                    if (termInstance) {
                        const decoded = base64ToUtf8(msg.data);
                        termInstance.term.write(decoded);
                    }
                    break;

                case 'projects':
                    console.log('Received projects message:', msg);
                    updateProjects(msg.projects || []);
                    break;

                case 'terminals':
                    // Legacy support - convert to projects format if needed
                    break;

                case 'createTerminal':
                    // Terminal was created (either by us or by Claudilandia)
                    if (msg.success && msg.terminal) {
                        selectTerminal(msg.terminal.id, msg.terminal.projectId);
                    }
                    break;

                case 'renameTerminal':
                case 'deleteTerminal':
                    // Projects list will be broadcast automatically
                    break;

                case 'error':
                    console.error('Server error:', msg.message);
                    const current = getCurrentTerminal();
                    if (current) {
                        current.term.write('\r\n\x1b[31mError: ' + msg.message + '\x1b[0m\r\n');
                    }
                    break;

                case 'pong':
                    break;
            }
        }

        // Update projects UI
        function updateProjects(newProjects) {
            console.log('updateProjects:', newProjects?.length, 'projects');
            projects = newProjects;
            renderProjects();

            // Auto-select first project if none selected
            if (!currentProjectId && projects.length > 0) {
                console.log('Auto-selecting first project:', projects[0].id, projects[0].name);
                selectProject(projects[0].id);
            } else if (currentProjectId) {
                // Re-render terminals for current project
                renderTerminals();
            }
        }

        // Render projects bar
        function renderProjects() {
            const bar = document.getElementById('projectsBar');
            bar.innerHTML = projects.map(p => {
                const isActive = p.id === currentProjectId;
                return '<button class="project-btn' + (isActive ? ' active' : '') + '" data-id="' + p.id + '">' +
                    '<span class="project-icon">' + (p.icon || '📁') + '</span>' +
                    '<span>' + escapeHtml(p.name) + '</span>' +
                    '</button>';
            }).join('');

            // Add click handlers
            bar.querySelectorAll('.project-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    selectProject(btn.dataset.id);
                });
            });
        }

        // Select project
        function selectProject(projectId) {
            console.log('selectProject:', projectId);
            currentProjectId = projectId;
            // Hide all terminal wrappers first
            hideAllTerminals();
            currentTerminalId = null;
            renderProjects();
            renderTerminals();

            // Auto-select first terminal if available, otherwise show empty state
            const project = projects.find(p => p.id === projectId);
            if (project && project.terminals && project.terminals.length > 0) {
                selectTerminal(project.terminals[0].id, projectId);
            } else {
                // No terminals - show empty state
                showEmptyState(true);
            }
        }

        // Hide all terminal wrappers
        function hideAllTerminals() {
            terminalInstances.forEach(instance => {
                instance.wrapper.style.display = 'none';
            });
        }

        // Render terminals tabs
        function renderTerminals() {
            const bar = document.getElementById('terminalsBar');
            const project = projects.find(p => p.id === currentProjectId);
            const terminals = project ? (project.terminals || []) : [];

            // Keep action buttons
            const actionsHtml = '<div class="terminal-actions">' +
                '<button class="action-btn" id="addTerminalBtn" title="New Terminal">+</button>' +
                '<button class="action-btn" id="editTerminalBtn" title="Rename Terminal">✎</button>' +
                '<button class="action-btn danger" id="deleteTerminalBtn" title="Close Terminal">×</button>' +
                '</div>';

            const tabsHtml = terminals.map(t => {
                const isActive = t.id === currentTerminalId;
                const dotClass = t.running ? 'running-dot' : 'stopped-dot';
                return '<button class="terminal-tab' + (isActive ? ' active' : '') + '" data-id="' + t.id + '">' +
                    '<span class="' + dotClass + '"></span>' +
                    '<span>' + escapeHtml(t.name) + '</span>' +
                    '</button>';
            }).join('');

            bar.innerHTML = tabsHtml + actionsHtml;

            // Add click handlers for tabs
            bar.querySelectorAll('.terminal-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    selectTerminal(tab.dataset.id, currentProjectId);
                });
            });

            // Add click handlers for action buttons
            document.getElementById('addTerminalBtn').addEventListener('click', showCreateModal);
            document.getElementById('editTerminalBtn').addEventListener('click', showRenameModal);
            document.getElementById('deleteTerminalBtn').addEventListener('click', showDeleteModal);
        }

        // Select terminal
        function selectTerminal(termId, projectId) {
            console.log('selectTerminal:', termId, 'projectId:', projectId, 'current:', currentTerminalId);

            // Hide current terminal
            if (currentTerminalId && terminalInstances.has(currentTerminalId)) {
                terminalInstances.get(currentTerminalId).wrapper.style.display = 'none';
            }

            currentTerminalId = termId;
            if (projectId) currentProjectId = projectId;
            console.log('currentTerminalId set to:', currentTerminalId);

            renderProjects();
            renderTerminals();
            showEmptyState(false);

            // Get or create terminal instance and show it
            const instance = getOrCreateTerminal(termId);
            instance.wrapper.style.display = 'block';
            instance.fitAddon.fit();
            instance.term.focus();

            setTimeout(sendResize, 100);
        }

        // Show/hide empty state
        function showEmptyState(show) {
            const container = document.getElementById('terminal');
            const empty = document.getElementById('emptyState');

            if (show) {
                container.style.display = 'none';
                empty.classList.remove('hidden');
            } else {
                container.style.display = 'block';
                empty.classList.add('hidden');
            }
        }

        // Modal functions
        function showCreateModal() {
            if (!currentProjectId) {
                alert('Please select a project first');
                return;
            }
            modalMode = 'create';
            document.getElementById('modalTitle').textContent = 'New Terminal';
            document.getElementById('terminalNameInput').value = '';  // Empty = auto-generate
            document.getElementById('terminalNameInput').placeholder = 'Leave empty for auto-name';
            document.getElementById('modalConfirm').textContent = 'Create';
            document.getElementById('modalConfirm').className = 'modal-btn primary';
            document.getElementById('terminalModal').classList.remove('hidden');
            document.getElementById('terminalNameInput').focus();
        }

        function showRenameModal() {
            if (!currentTerminalId) {
                alert('Please select a terminal first');
                return;
            }
            modalMode = 'rename';
            const project = projects.find(p => p.id === currentProjectId);
            const terminal = project?.terminals?.find(t => t.id === currentTerminalId);

            document.getElementById('modalTitle').textContent = 'Rename Terminal';
            document.getElementById('terminalNameInput').value = terminal?.name || '';
            document.getElementById('modalConfirm').textContent = 'Rename';
            document.getElementById('modalConfirm').className = 'modal-btn primary';
            document.getElementById('terminalModal').classList.remove('hidden');
            document.getElementById('terminalNameInput').focus();
        }

        function showDeleteModal() {
            if (!currentTerminalId) {
                alert('Please select a terminal first');
                return;
            }
            document.getElementById('deleteModal').classList.remove('hidden');
        }

        function hideModals() {
            document.getElementById('terminalModal').classList.add('hidden');
            document.getElementById('deleteModal').classList.add('hidden');
        }

        // Modal event handlers
        document.getElementById('modalCancel').addEventListener('click', hideModals);
        document.getElementById('deleteCancel').addEventListener('click', hideModals);

        document.getElementById('modalConfirm').addEventListener('click', () => {
            const name = document.getElementById('terminalNameInput').value.trim();

            if (modalMode === 'create') {
                // Name can be empty - backend will auto-generate
                ws.send(JSON.stringify({
                    type: 'createTerminal',
                    projectId: currentProjectId,
                    name: name  // Can be empty
                }));
            } else if (modalMode === 'rename') {
                // Rename requires a name
                if (!name) {
                    alert('Please enter a name');
                    return;
                }
                ws.send(JSON.stringify({
                    type: 'renameTerminal',
                    projectId: currentProjectId,
                    termId: currentTerminalId,
                    name: name
                }));
            }
            hideModals();
        });

        document.getElementById('deleteConfirm').addEventListener('click', () => {
            const termIdToDelete = currentTerminalId;
            ws.send(JSON.stringify({
                type: 'deleteTerminal',
                projectId: currentProjectId,
                termId: termIdToDelete
            }));
            // Clean up terminal instance
            if (terminalInstances.has(termIdToDelete)) {
                const instance = terminalInstances.get(termIdToDelete);
                instance.term.dispose();
                instance.wrapper.remove();
                terminalInstances.delete(termIdToDelete);
            }
            currentTerminalId = null;
            hideModals();
            // Don't auto-create - let Claudilandia handle terminal creation
            // The projects list will be updated via WebSocket and UI will refresh
        });

        // Close modal on overlay click
        document.getElementById('terminalModal').addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) hideModals();
        });
        document.getElementById('deleteModal').addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) hideModals();
        });

        // Send resize
        function sendResize() {
            const current = getCurrentTerminal();
            if (ws && ws.readyState === WebSocket.OPEN && currentTerminalId && current) {
                console.log('Sending resize:', current.term.rows, 'x', current.term.cols, 'for terminal:', currentTerminalId);
                ws.send(JSON.stringify({
                    type: 'resize',
                    termId: currentTerminalId,
                    rows: current.term.rows,
                    cols: current.term.cols
                }));
            }
        }

        // Status helpers
        function setStatus(state, text) {
            document.getElementById('statusDot').className = 'status-dot ' + state;
            document.getElementById('statusText').textContent = text;
        }

        // Overlay helpers
        function hideOverlays() {
            document.getElementById('loadingOverlay').classList.add('hidden');
            document.getElementById('errorOverlay').classList.add('hidden');
        }

        function showError(title, message) {
            document.getElementById('loadingOverlay').classList.add('hidden');
            document.getElementById('errorOverlay').classList.remove('hidden');
            document.getElementById('errorTitle').textContent = title;
            document.getElementById('errorMessage').textContent = message;
        }

        // Reconnect logic
        function scheduleReconnect() {
            if (reconnectAttempts >= 10) {
                showError('Connection Failed', 'Unable to reconnect after multiple attempts.');
                return;
            }

            reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
            setStatus('disconnected', 'Reconnecting in ' + (delay / 1000) + 's...');

            reconnectTimeout = setTimeout(() => {
                setStatus('disconnected', 'Reconnecting...');
                connect();
            }, delay);
        }

        function reconnect() {
            clearTimeout(reconnectTimeout);
            reconnectAttempts = 0;
            hideOverlays();
            document.getElementById('loadingOverlay').classList.remove('hidden');
            connect();
        }

        // Keyboard helper buttons
        document.querySelectorAll('.key-btn').forEach(btn => {
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();

                const key = btn.dataset.key;
                const seq = btn.dataset.seq;

                if (key === 'Control') {
                    ctrlPressed = true;
                    btn.style.background = '#89b4fa';
                    btn.style.color = '#11111b';
                    return;
                }

                if (seq) {
                    if (ws && ws.readyState === WebSocket.OPEN && currentTerminalId) {
                        ws.send(JSON.stringify({
                            type: 'input',
                            termId: currentTerminalId,
                            data: seq
                        }));
                    }
                } else if (key) {
                    let data = '';
                    switch (key) {
                        case 'Escape': data = '\x1b'; break;
                        case 'Tab': data = '\t'; break;
                        case 'ArrowUp': data = '\x1b[A'; break;
                        case 'ArrowDown': data = '\x1b[B'; break;
                        case 'ArrowRight': data = '\x1b[C'; break;
                        case 'ArrowLeft': data = '\x1b[D'; break;
                    }

                    if (ctrlPressed && data.length === 1) {
                        data = String.fromCharCode(data.charCodeAt(0) - 96);
                    }

                    if (ws && ws.readyState === WebSocket.OPEN && currentTerminalId) {
                        ws.send(JSON.stringify({
                            type: 'input',
                            termId: currentTerminalId,
                            data: data
                        }));
                    }
                }

                ctrlPressed = false;
                const ctrlBtn = document.querySelector('[data-key="Control"]');
                if (ctrlBtn) {
                    ctrlBtn.style.background = '';
                    ctrlBtn.style.color = '';
                }
            });
        });

        // Toolbar buttons
        function sendTerminalInput(data) {
            if (ws && ws.readyState === WebSocket.OPEN && currentTerminalId) {
                ws.send(JSON.stringify({
                    type: 'input',
                    termId: currentTerminalId,
                    data: data
                }));
            }
        }

        // Shift+Tab button
        document.getElementById('shiftTabBtn').addEventListener('touchstart', (e) => {
            e.preventDefault();
            sendTerminalInput('\x1b[Z'); // Shift+Tab escape sequence
        }, { passive: false });
        document.getElementById('shiftTabBtn').addEventListener('click', () => {
            sendTerminalInput('\x1b[Z');
        });

        // ESC button
        document.getElementById('escBtn').addEventListener('touchstart', (e) => {
            e.preventDefault();
            sendTerminalInput('\x1b'); // Escape
        }, { passive: false });
        document.getElementById('escBtn').addEventListener('click', () => {
            sendTerminalInput('\x1b');
        });

        // Enter button
        document.getElementById('enterBtn').addEventListener('touchstart', (e) => {
            e.preventDefault();
            sendTerminalInput('\r'); // Carriage return (Enter)
        }, { passive: false });
        document.getElementById('enterBtn').addEventListener('click', () => {
            sendTerminalInput('\r');
        });

        // Helper function
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Heartbeat only - no polling needed, server pushes all changes via WebSocket
        setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);

        // Speech recognition (push-to-talk)
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        let recognition = null;
        let isRecording = false;

        function initSpeechRecognition() {
            const micBtn = document.getElementById('micBtn');
            const micStatus = document.getElementById('micStatus');

            if (!SpeechRecognition) {
                micStatus.textContent = 'Not supported';
                micBtn.style.opacity = '0.5';
                micBtn.disabled = true;
                return;
            }

            micStatus.textContent = '';

            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'pl-PL'; // Polish, change as needed

            let finalTranscript = '';

            recognition.onstart = () => {
                isRecording = true;
                micBtn.classList.add('recording');
                micStatus.classList.add('recording');
                micStatus.textContent = 'Listening...';
                finalTranscript = '';
            };

            recognition.onresult = (event) => {
                let interimTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }
                micStatus.textContent = finalTranscript + interimTranscript || 'Listening...';
            };

            recognition.onend = () => {
                isRecording = false;
                micBtn.classList.remove('recording');
                micStatus.classList.remove('recording');

                if (finalTranscript.trim()) {
                    // Send to terminal and press Enter
                    if (ws && ws.readyState === WebSocket.OPEN && currentTerminalId) {
                        ws.send(JSON.stringify({
                            type: 'input',
                            termId: currentTerminalId,
                            data: finalTranscript.trim() + '\n'
                        }));
                        micStatus.textContent = 'Sent: ' + finalTranscript.trim().substring(0, 30) + (finalTranscript.length > 30 ? '...' : '');
                    }
                } else {
                    micStatus.textContent = '';
                }

                setTimeout(() => {
                    if (!isRecording) {
                        micStatus.textContent = '';
                    }
                }, 2000);
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                isRecording = false;
                micBtn.classList.remove('recording');
                micStatus.classList.remove('recording');

                if (event.error === 'not-allowed') {
                    micStatus.textContent = 'Mic access denied';
                } else {
                    micStatus.textContent = 'Error: ' + event.error;
                }
            };

            // Push-to-talk handlers
            function startRecording(e) {
                e.preventDefault();
                if (!isRecording) {
                    try {
                        recognition.start();
                    } catch (err) {
                        console.error('Failed to start recognition:', err);
                    }
                }
            }

            function stopRecording(e) {
                e.preventDefault();
                if (isRecording) {
                    recognition.stop();
                }
            }

            // Touch events
            micBtn.addEventListener('touchstart', startRecording, { passive: false });
            micBtn.addEventListener('touchend', stopRecording, { passive: false });
            micBtn.addEventListener('touchcancel', stopRecording, { passive: false });

            // Mouse events (for desktop testing)
            micBtn.addEventListener('mousedown', startRecording);
            micBtn.addEventListener('mouseup', stopRecording);
            micBtn.addEventListener('mouseleave', stopRecording);
        }

        // Initialize
        initTerminal();
        initSpeechRecognition();
        connect();
    </script>
</body>
</html>`
