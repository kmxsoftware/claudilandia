package remote

// clientHTML is the embedded HTML for the mobile web client
// Simplified design - shows iTerm2 terminals as buttons
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
    <title>Claudilandia - Remote iTerm2</title>
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
            padding: 12px 16px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
        }

        .header h1 {
            font-size: 16px;
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

        /* Terminal selector view */
        .terminal-selector {
            flex: 1;
            display: flex;
            flex-direction: column;
            padding: 16px;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
        }

        .selector-title {
            font-size: 13px;
            color: var(--text-muted);
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .terminal-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .terminal-btn {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px;
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            color: var(--text-primary);
            font-size: 15px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            text-align: left;
        }

        .terminal-btn:active {
            transform: scale(0.98);
            background: var(--accent);
            border-color: var(--accent);
            color: var(--bg-tertiary);
        }

        .terminal-btn .icon {
            font-size: 20px;
        }

        .terminal-btn .info {
            flex: 1;
        }

        .terminal-btn .name {
            display: block;
        }

        .terminal-btn .status-text {
            font-size: 11px;
            color: var(--text-muted);
            font-weight: 400;
        }

        .terminal-btn:active .status-text {
            color: var(--bg-surface);
        }

        .terminal-btn .active-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--success);
            box-shadow: 0 0 8px var(--success);
        }

        .no-terminals {
            text-align: center;
            padding: 40px 20px;
            color: var(--text-muted);
        }

        .no-terminals h3 {
            font-size: 16px;
            color: var(--text-secondary);
            margin-bottom: 8px;
        }

        .no-terminals p {
            font-size: 13px;
        }

        /* Terminal view */
        .terminal-view {
            flex: 1;
            display: none;
            flex-direction: column;
            overflow: hidden;
        }

        .terminal-view.active {
            display: flex;
        }

        .terminal-header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 16px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
        }

        .back-btn {
            background: none;
            border: none;
            color: var(--accent);
            font-size: 18px;
            cursor: pointer;
            padding: 4px 8px;
        }

        .terminal-name {
            flex: 1;
            font-size: 14px;
            color: var(--text-primary);
            font-weight: 500;
        }

        .terminal-container {
            flex: 1;
            overflow: hidden;
            padding: 4px;
            background: var(--bg-primary);
        }

        #terminal {
            height: 100%;
            width: 100%;
            overflow: auto;
            -webkit-overflow-scrolling: touch;
            padding: 8px;
            margin: 0;
            font-family: 'SF Mono', Monaco, 'Fira Code', monospace;
            font-size: 12px;
            line-height: 1.4;
            color: var(--text-primary);
            background: var(--bg-primary);
            white-space: pre-wrap;
            word-break: break-word;
        }

        /* Input bar */
        .input-bar {
            display: flex;
            gap: 8px;
            padding: 8px 12px;
            background: var(--bg-secondary);
            border-top: 1px solid var(--border);
            flex-shrink: 0;
        }

        #commandInput {
            flex: 1;
            height: 40px;
            padding: 0 12px;
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: 8px;
            color: var(--text-primary);
            font-family: 'SF Mono', Monaco, monospace;
            font-size: 14px;
            outline: none;
        }

        #commandInput:focus {
            border-color: var(--accent);
        }

        #commandInput::placeholder {
            color: var(--text-muted);
        }

        .send-btn {
            height: 40px;
            padding: 0 16px;
            background: var(--accent);
            border: none;
            border-radius: 8px;
            color: var(--bg-tertiary);
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
        }

        .send-btn:active {
            opacity: 0.8;
        }

        /* Keyboard helper */
        .keyboard-helper {
            display: flex;
            gap: 6px;
            padding: 8px 12px;
            background: var(--bg-secondary);
            border-top: 1px solid var(--border);
            flex-wrap: wrap;
            flex-shrink: 0;
        }

        .key-btn {
            background: var(--bg-surface);
            color: var(--text-primary);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 10px 14px;
            font-size: 12px;
            font-family: 'SF Mono', Monaco, monospace;
            touch-action: manipulation;
            transition: all 0.15s ease;
            cursor: pointer;
        }

        .key-btn:active {
            background: var(--accent);
            color: var(--bg-tertiary);
            border-color: var(--accent);
        }

        /* Bottom toolbar */
        .toolbar {
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
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .toolbar-btn:active {
            background: var(--accent);
            border-color: var(--accent);
            color: var(--bg-tertiary);
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
            cursor: pointer;
            flex-shrink: 0;
        }

        .mic-btn:active,
        .mic-btn.recording {
            background: var(--error);
            border-color: var(--error);
            color: white;
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
            max-width: 100px;
            text-align: right;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .mic-status.recording {
            color: var(--error);
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
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>iTerm2 Remote</h1>
            <div class="status">
                <div class="status-dot" id="statusDot"></div>
                <span id="statusText">Connecting...</span>
            </div>
        </div>

        <!-- Terminal selector (list of iTerm2 tabs) -->
        <div class="terminal-selector" id="terminalSelector">
            <div class="selector-title">iTerm2 Terminals</div>
            <div class="terminal-list" id="terminalList">
                <!-- Terminals will be rendered here -->
            </div>
        </div>

        <!-- Terminal view (shown when terminal is selected) -->
        <div class="terminal-view" id="terminalView">
            <div class="terminal-header">
                <button class="back-btn" id="backBtn">←</button>
                <span class="terminal-name" id="terminalName">Terminal</span>
            </div>
            <div class="terminal-container">
                <pre id="terminal"></pre>
            </div>
            <div class="keyboard-helper">
                <button class="key-btn" data-seq="\x1b">ESC</button>
                <button class="key-btn" data-seq="\x1b[Z">Shift+TAB</button>
                <button class="key-btn" data-seq="\r">Enter</button>
                <button class="key-btn" data-seq="\x0f">Ctrl+O</button>
            </div>
            <div class="input-bar">
                <input type="text" id="commandInput" placeholder="Type command..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
                <button class="send-btn" id="sendBtn">Send</button>
            </div>
            <div class="toolbar">
                <span class="toolbar-spacer"></span>
                <span class="mic-status" id="micStatus"></span>
                <button class="mic-btn" id="micBtn" title="Voice input">🎤</button>
            </div>
        </div>
    </div>

    <div class="overlay" id="loadingOverlay">
        <div class="spinner"></div>
        <h2>Connecting...</h2>
        <p>Establishing connection to iTerm2</p>
    </div>

    <div class="overlay hidden" id="errorOverlay">
        <h2 id="errorTitle">Connection Lost</h2>
        <p id="errorMessage">Unable to connect to iTerm2.</p>
        <button class="retry-btn" onclick="reconnect()">Reconnect</button>
    </div>

    <script>
        const STORAGE_KEY = 'claudilandia_remote_token';

        // Get token from URL or localStorage
        const params = new URLSearchParams(window.location.search);
        let token = params.get('token');

        if (!token) {
            token = localStorage.getItem(STORAGE_KEY);
        }

        if (!token) {
            showError('No Token', 'Access token is required. Please use the link from Claudilandia.');
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
        let terminals = []; // iTerm2 tabs
        let currentTerminalId = null;
        let terminalEl = null;
        let inputBuffer = '';
        let reconnectAttempts = 0;
        let reconnectTimeout = null;

        // Strip ANSI escape codes
        function stripAnsi(str) {
            return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
                      .replace(/\x1B\][^\x07]*\x07/g, '')
                      .replace(/\x1B[()][AB012]/g, '');
        }

        // Strip box drawing characters
        function stripBoxChars(str) {
            return str.replace(/[\u2500-\u257F\u2580-\u259F\u25A0-\u25FF\u2800-\u28FF]/g, '');
        }

        // Clean terminal output for display
        function cleanOutput(str) {
            let cleaned = stripAnsi(str);
            cleaned = stripBoxChars(cleaned);
            // Collapse multiple spaces but preserve structure
            cleaned = cleaned.replace(/[ \t]{3,}/g, '  ');
            // Remove empty lines but keep some spacing
            cleaned = cleaned.split('\n')
                .filter((line, i, arr) => {
                    const trimmed = line.trim();
                    // Keep non-empty lines
                    if (trimmed) return true;
                    // Keep one empty line between sections
                    const prevTrimmed = i > 0 ? arr[i-1].trim() : '';
                    return prevTrimmed !== '';
                })
                .join('\n');
            return cleaned;
        }

        // Initialize terminal
        function initTerminal() {
            terminalEl = document.getElementById('terminal');
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
                    console.error('Error handling message:', err);
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

        // Decode base64 to UTF-8
        function base64ToUtf8(base64) {
            try {
                const binary = atob(base64);
                const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
                return new TextDecoder('utf-8').decode(bytes);
            } catch (err) {
                return base64 || '';
            }
        }

        // Handle server messages
        let lastOutputHash = '';

        function handleMessage(msg) {
            switch (msg.type) {
                case 'output':
                    if (terminalEl && document.getElementById('terminalView').classList.contains('active')) {
                        const decoded = base64ToUtf8(msg.data);
                        // Simple hash to detect if content changed
                        const hash = decoded.length + ':' + decoded.substring(0, 100);
                        if (hash !== lastOutputHash) {
                            lastOutputHash = hash;
                            const cleaned = cleanOutput(decoded);
                            terminalEl.textContent = cleaned;
                            // Auto-scroll to bottom
                            terminalEl.scrollTop = terminalEl.scrollHeight;
                        }
                    }
                    break;

                case 'terminals':
                    updateTerminals(msg.terminals || []);
                    break;

                case 'projects':
                    // Extract terminals from all projects
                    const allTerminals = [];
                    if (msg.projects) {
                        msg.projects.forEach(p => {
                            if (p.terminals) {
                                p.terminals.forEach(t => {
                                    allTerminals.push({
                                        id: t.id,
                                        name: t.name || p.name,
                                        running: t.running,
                                        projectName: p.name
                                    });
                                });
                            }
                        });
                    }
                    updateTerminals(allTerminals);
                    break;

                case 'error':
                    console.error('Server error:', msg.message);
                    if (terminalEl) {
                        terminalEl.textContent += '\nError: ' + msg.message + '\n';
                    }
                    break;

                case 'pong':
                    break;
            }
        }

        // Update terminals list
        function updateTerminals(newTerminals) {
            terminals = newTerminals;
            renderTerminals();
        }

        // Render terminals list
        function renderTerminals() {
            const list = document.getElementById('terminalList');

            if (terminals.length === 0) {
                list.innerHTML = '<div class="no-terminals">' +
                    '<h3>No Terminals</h3>' +
                    '<p>Open a terminal in iTerm2 to see it here</p>' +
                    '</div>';
                return;
            }

            list.innerHTML = terminals.map(t => {
                const statusText = t.running ? 'Active' : 'Idle';
                return '<button class="terminal-btn" data-id="' + escapeHtml(t.id) + '">' +
                    '<span class="icon">💻</span>' +
                    '<span class="info">' +
                    '<span class="name">' + escapeHtml(t.name) + '</span>' +
                    '<span class="status-text">' + statusText + '</span>' +
                    '</span>' +
                    (t.running ? '<span class="active-indicator"></span>' : '') +
                    '</button>';
            }).join('');

            // Add click handlers
            list.querySelectorAll('.terminal-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    selectTerminal(btn.dataset.id);
                });
            });
        }

        // Select terminal
        function selectTerminal(termId) {
            currentTerminalId = termId;
            const terminal = terminals.find(t => t.id === termId);

            document.getElementById('terminalName').textContent = terminal ? terminal.name : 'Terminal';
            document.getElementById('terminalSelector').style.display = 'none';
            document.getElementById('terminalView').classList.add('active');

            // Clear terminal and request fresh output
            terminalEl.textContent = '';
            lastOutputHash = '';

            // Switch iTerm2 tab
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'switchTab',
                    termId: termId
                }));
            }
        }

        // Go back to terminal list
        function goBack() {
            currentTerminalId = null;
            document.getElementById('terminalView').classList.remove('active');
            document.getElementById('terminalSelector').style.display = 'flex';
            // Refresh terminals list
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'list' }));
            }
        }

        // Send resize (no-op for plain text mode)
        function sendResize() {
            // Plain text mode doesn't track terminal dimensions
        }

        // Status helpers
        function setStatus(state, text) {
            document.getElementById('statusDot').className = 'status-dot ' + state;
            document.getElementById('statusText').textContent = text;
        }

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

        // Escape HTML
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Send terminal input helper
        function sendTerminalInput(data) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'input',
                    termId: currentTerminalId || 'active',
                    data: data
                }));
            }
        }

        // Setup event listeners
        document.getElementById('backBtn').addEventListener('click', goBack);

        // Command input handling
        const commandInput = document.getElementById('commandInput');
        const sendBtn = document.getElementById('sendBtn');

        function sendCommand() {
            const cmd = commandInput.value;
            if (cmd) {
                // Send command text, then carriage return separately
                sendTerminalInput(cmd);
                setTimeout(() => sendTerminalInput('\r'), 50);
                commandInput.value = '';
            }
        }

        sendBtn.addEventListener('click', sendCommand);
        commandInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendCommand();
            }
        });

        // Keyboard helper buttons
        document.querySelectorAll('.key-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const seq = btn.dataset.seq;
                if (seq) {
                    // Unescape the sequence
                    const unescaped = seq
                        .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
                        .replace(/\\t/g, '\t')
                        .replace(/\\r/g, '\r')
                        .replace(/\\n/g, '\n');
                    sendTerminalInput(unescaped);
                }
            });
        });

        // Heartbeat
        setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);

        // Speech recognition
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

            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'pl-PL';

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
                    sendTerminalInput(finalTranscript.trim() + '\n');
                    micStatus.textContent = 'Sent!';
                } else {
                    micStatus.textContent = '';
                }

                setTimeout(() => {
                    if (!isRecording) micStatus.textContent = '';
                }, 2000);
            };

            recognition.onerror = (event) => {
                isRecording = false;
                micBtn.classList.remove('recording');
                micStatus.classList.remove('recording');
                micStatus.textContent = event.error === 'not-allowed' ? 'Mic denied' : 'Error';
            };

            // Push-to-talk
            function startRecording(e) {
                e.preventDefault();
                if (!isRecording) {
                    try { recognition.start(); } catch (err) {}
                }
            }

            function stopRecording(e) {
                e.preventDefault();
                if (isRecording) recognition.stop();
            }

            micBtn.addEventListener('touchstart', startRecording, { passive: false });
            micBtn.addEventListener('touchend', stopRecording, { passive: false });
            micBtn.addEventListener('touchcancel', stopRecording, { passive: false });
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
