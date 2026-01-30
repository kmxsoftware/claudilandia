package remote

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"projecthub/internal/logging"
	"projecthub/internal/terminal"

	"github.com/gorilla/websocket"
)

// Message types for WebSocket protocol
type MessageType string

const (
	MsgTypeInput          MessageType = "input"
	MsgTypeResize         MessageType = "resize"
	MsgTypeList           MessageType = "list"
	MsgTypeOutput         MessageType = "output"
	MsgTypeTerminals      MessageType = "terminals"
	MsgTypeProjects       MessageType = "projects"
	MsgTypeError          MessageType = "error"
	MsgTypePing           MessageType = "ping"
	MsgTypePong           MessageType = "pong"
	MsgTypeCreateTerminal MessageType = "createTerminal"
	MsgTypeRenameTerminal MessageType = "renameTerminal"
	MsgTypeDeleteTerminal MessageType = "deleteTerminal"
)

// Security constants
const (
	maxClients       = 10             // Maximum concurrent connections
	maxAuthAttempts  = 50             // Max failed auth attempts before lockout
	authLockoutTime  = 1 * time.Minute // Lockout duration after max attempts
	minResizeRows    = 1
	maxResizeRows    = 500
	minResizeCols    = 1
	maxResizeCols    = 500
	shutdownTimeout  = 5 * time.Second
)

// ClientMessage represents a message from the client
type ClientMessage struct {
	Type      MessageType `json:"type"`
	TermID    string      `json:"termId,omitempty"`
	ProjectID string      `json:"projectId,omitempty"`
	Data      string      `json:"data,omitempty"` // base64 encoded for input
	Name      string      `json:"name,omitempty"` // for create/rename terminal
	Rows      int         `json:"rows,omitempty"`
	Cols      int         `json:"cols,omitempty"`
}

// ServerMessage represents a message to the client
type ServerMessage struct {
	Type      MessageType    `json:"type"`
	TermID    string         `json:"termId,omitempty"`
	ProjectID string         `json:"projectId,omitempty"`
	Data      string         `json:"data,omitempty"` // base64 encoded for output
	Terminals []TerminalInfo `json:"terminals,omitempty"`
	Projects  []ProjectInfo  `json:"projects,omitempty"`
	Terminal  *TerminalInfo  `json:"terminal,omitempty"` // for single terminal responses
	Message   string         `json:"message,omitempty"`
	Success   bool           `json:"success,omitempty"`
}

// TerminalInfo for client
type TerminalInfo struct {
	ID        string `json:"id"`
	ProjectID string `json:"projectId"`
	Name      string `json:"name"`
	WorkDir   string `json:"workDir"`
	Running   bool   `json:"running"`
}

// ProjectInfo for client
type ProjectInfo struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	Path      string         `json:"path"`
	Color     string         `json:"color"`
	Icon      string         `json:"icon"`
	Terminals []TerminalInfo `json:"terminals"`
}

// ClientInfo represents a connected client
type ClientInfo struct {
	ID          string    `json:"id"`
	ConnectedAt time.Time `json:"connectedAt"`
	TerminalID  string    `json:"terminalId"`
	UserAgent   string    `json:"userAgent"`
	RemoteAddr  string    `json:"remoteAddr"`
	writeMu     sync.Mutex // Per-connection mutex for thread-safe writes
}

// authAttempt tracks failed authentication attempts
type authAttempt struct {
	count    int
	lastTime time.Time
}

// ApprovedClient represents a permanently approved client
type ApprovedClient struct {
	Token     string    `json:"token"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
	LastUsed  time.Time `json:"lastUsed"`
}

// ProjectHandler is the interface for project/terminal operations
type ProjectHandler interface {
	GetProjects() []ProjectInfo
	CreateTerminal(projectID, name string) (*TerminalInfo, error)
	RenameTerminal(projectID, terminalID, name string) error
	DeleteTerminal(projectID, terminalID string) error
}

// Server handles remote terminal access via WebSocket
type Server struct {
	termManager      *terminal.Manager
	projectHandler   ProjectHandler
	token            string
	tokenExpiry      time.Time
	approvedClients  map[string]*ApprovedClient // token -> client info
	clients          map[*websocket.Conn]*ClientInfo
	authAttempts     map[string]*authAttempt // IP -> auth attempts
	mu               sync.RWMutex
	authMu           sync.RWMutex
	port             int
	server           *http.Server
	upgrader         websocket.Upgrader
	running          bool
	onApprovedChange func() // callback when approved clients change
}

// NewServer creates a new remote access server
func NewServer(tm *terminal.Manager) *Server {
	s := &Server{
		termManager:     tm,
		clients:         make(map[*websocket.Conn]*ClientInfo),
		authAttempts:    make(map[string]*authAttempt),
		approvedClients: make(map[string]*ApprovedClient),
		port:            9090,
	}

	s.upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin:     s.checkOrigin,
	}

	return s
}

// SetApprovedChangeCallback sets a callback for when approved clients change
func (s *Server) SetApprovedChangeCallback(cb func()) {
	s.mu.Lock()
	s.onApprovedChange = cb
	s.mu.Unlock()
}

// SetProjectHandler sets the handler for project/terminal operations
func (s *Server) SetProjectHandler(handler ProjectHandler) {
	s.mu.Lock()
	s.projectHandler = handler
	s.mu.Unlock()
}

// AddApprovedClient creates a new permanent token for an approved client
func (s *Server) AddApprovedClient(name string) (*ApprovedClient, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}

	token := hex.EncodeToString(bytes)
	client := &ApprovedClient{
		Token:     token,
		Name:      name,
		CreatedAt: time.Now(),
		LastUsed:  time.Now(),
	}

	s.mu.Lock()
	s.approvedClients[token] = client
	cb := s.onApprovedChange
	s.mu.Unlock()

	logging.Info("Approved client added", "name", name)

	if cb != nil {
		cb()
	}

	return client, nil
}

// RemoveApprovedClient removes an approved client by token
func (s *Server) RemoveApprovedClient(token string) {
	s.mu.Lock()
	delete(s.approvedClients, token)
	cb := s.onApprovedChange
	s.mu.Unlock()

	logging.Info("Approved client removed")

	if cb != nil {
		cb()
	}
}

// GetApprovedClients returns all approved clients
func (s *Server) GetApprovedClients() []*ApprovedClient {
	s.mu.RLock()
	defer s.mu.RUnlock()

	clients := make([]*ApprovedClient, 0, len(s.approvedClients))
	for _, c := range s.approvedClients {
		clients = append(clients, c)
	}
	return clients
}

// SetApprovedClients loads approved clients (for persistence)
func (s *Server) SetApprovedClients(clients []*ApprovedClient) {
	s.mu.Lock()
	s.approvedClients = make(map[string]*ApprovedClient)
	for _, c := range clients {
		s.approvedClients[c.Token] = c
	}
	s.mu.Unlock()
}

// IsApprovedToken checks if a token is an approved permanent token
func (s *Server) IsApprovedToken(token string) bool {
	s.mu.RLock()
	_, exists := s.approvedClients[token]
	s.mu.RUnlock()
	return exists
}

// UpdateApprovedClientLastUsed updates the last used time for an approved client
func (s *Server) UpdateApprovedClientLastUsed(token string) {
	s.mu.Lock()
	if client, exists := s.approvedClients[token]; exists {
		client.LastUsed = time.Now()
	}
	s.mu.Unlock()
}

// checkOrigin validates the request origin for CORS
func (s *Server) checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")

	// No origin header (same-origin request) - allow
	if origin == "" {
		return true
	}

	// Allow localhost for development
	if strings.HasPrefix(origin, "http://localhost") ||
		strings.HasPrefix(origin, "http://127.0.0.1") ||
		strings.HasPrefix(origin, "https://localhost") ||
		strings.HasPrefix(origin, "https://127.0.0.1") {
		return true
	}

	// Allow ngrok domains
	if strings.HasSuffix(origin, ".ngrok.io") ||
		strings.HasSuffix(origin, ".ngrok-free.app") ||
		strings.HasSuffix(origin, ".ngrok.app") {
		return true
	}

	// Log rejected origin for debugging
	logging.Warn("WebSocket connection rejected: invalid origin", "origin", origin)
	return false
}

// GenerateToken generates a new access token
func (s *Server) GenerateToken(duration time.Duration) (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		logging.Error("Failed to generate secure token", "error", err)
		return "", fmt.Errorf("failed to generate secure token: %w", err)
	}

	s.mu.Lock()
	s.token = hex.EncodeToString(bytes)
	s.tokenExpiry = time.Now().Add(duration)
	s.mu.Unlock()

	logging.Info("Remote access token generated", "expiry", s.tokenExpiry)
	return s.token, nil
}

// GetToken returns the current token (for display in UI)
func (s *Server) GetToken() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.token
}

// validateToken checks if the provided token is valid using constant-time comparison
// Returns (isValid, isApproved) - isApproved indicates if it's a permanent approved token
func (s *Server) validateToken(token string) bool {
	if len(token) == 0 {
		return false
	}

	s.mu.RLock()
	storedToken := s.token
	expiry := s.tokenExpiry

	// Check approved clients first (permanent tokens)
	for approvedToken := range s.approvedClients {
		if subtle.ConstantTimeCompare([]byte(token), []byte(approvedToken)) == 1 {
			s.mu.RUnlock()
			// Update last used time
			s.UpdateApprovedClientLastUsed(token)
			return true
		}
	}
	s.mu.RUnlock()

	// Check temporary token
	if len(storedToken) == 0 {
		return false
	}

	// Constant-time comparison to prevent timing attacks
	tokenMatch := subtle.ConstantTimeCompare([]byte(token), []byte(storedToken)) == 1
	notExpired := time.Now().Before(expiry)

	return tokenMatch && notExpired
}

// checkRateLimit checks if the IP is rate limited
func (s *Server) checkRateLimit(ip string) bool {
	s.authMu.RLock()
	attempt, exists := s.authAttempts[ip]
	s.authMu.RUnlock()

	if !exists {
		return true // Not rate limited
	}

	// Check if lockout has expired
	if time.Since(attempt.lastTime) > authLockoutTime {
		s.authMu.Lock()
		delete(s.authAttempts, ip)
		s.authMu.Unlock()
		return true
	}

	return attempt.count < maxAuthAttempts
}

// recordFailedAuth records a failed authentication attempt
func (s *Server) recordFailedAuth(ip string) {
	s.authMu.Lock()
	defer s.authMu.Unlock()

	if _, exists := s.authAttempts[ip]; !exists {
		s.authAttempts[ip] = &authAttempt{}
	}

	s.authAttempts[ip].count++
	s.authAttempts[ip].lastTime = time.Now()

	if s.authAttempts[ip].count >= maxAuthAttempts {
		logging.Warn("IP locked out due to failed auth attempts", "ip", ip)
	}
}

// resetAuthAttempts resets auth attempts for an IP after successful auth
func (s *Server) resetAuthAttempts(ip string) {
	s.authMu.Lock()
	delete(s.authAttempts, ip)
	s.authMu.Unlock()
}

// getClientIP extracts client IP from request
func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header (for ngrok)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	// Fall back to RemoteAddr
	return strings.Split(r.RemoteAddr, ":")[0]
}

// Start starts the remote access server
func (s *Server) Start(port int) error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return fmt.Errorf("server already running")
	}
	s.port = port
	s.running = true
	s.mu.Unlock()

	mux := http.NewServeMux()
	mux.HandleFunc("/", s.serveClient)
	mux.HandleFunc("/ws/terminal", s.handleTerminalWS)
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/api/terminals", s.handleTerminalsList)
	mux.HandleFunc("/api/token-info", s.handleTokenInfo)

	s.server = &http.Server{
		Addr:    fmt.Sprintf(":%d", port),
		Handler: mux,
	}

	logging.Info("Remote access server starting", "port", port)
	logging.Warn("Remote access server running without TLS - use ngrok for secure access")

	return s.server.ListenAndServe()
}

// Stop stops the remote access server with graceful shutdown
func (s *Server) Stop() error {
	s.mu.Lock()

	if !s.running {
		s.mu.Unlock()
		return nil
	}

	s.running = false
	s.token = ""

	// Copy client list to close outside the main lock
	clientsToClose := make([]*struct {
		conn *websocket.Conn
		info *ClientInfo
	}, 0, len(s.clients))
	for conn, info := range s.clients {
		clientsToClose = append(clientsToClose, &struct {
			conn *websocket.Conn
			info *ClientInfo
		}{conn, info})
	}
	s.clients = make(map[*websocket.Conn]*ClientInfo)
	s.mu.Unlock()

	// Close connections outside the main lock with write deadline
	for _, c := range clientsToClose {
		c.info.writeMu.Lock()
		// Set write deadline to prevent blocking on unresponsive clients
		c.conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
		c.conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseGoingAway, "Server shutting down"))
		c.info.writeMu.Unlock()
		c.conn.Close()
	}

	if s.server != nil {
		logging.Info("Remote access server stopping (graceful shutdown)")
		ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		return s.server.Shutdown(ctx)
	}
	return nil
}

// IsRunning returns whether the server is running
func (s *Server) IsRunning() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.running
}

// GetPort returns the server port
func (s *Server) GetPort() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.port
}

// GetClients returns list of connected clients
func (s *Server) GetClients() []ClientInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()

	clients := make([]ClientInfo, 0, len(s.clients))
	for _, info := range s.clients {
		clients = append(clients, ClientInfo{
			ID:          info.ID,
			ConnectedAt: info.ConnectedAt,
			TerminalID:  info.TerminalID,
			UserAgent:   info.UserAgent,
			RemoteAddr:  info.RemoteAddr,
		})
	}
	return clients
}

// BroadcastOutput sends terminal output to all clients watching that terminal
func (s *Server) BroadcastOutput(termID string, data string) {
	logging.Debug("BroadcastOutput called", "termID", termID, "dataLen", len(data))

	msg := ServerMessage{
		Type:   MsgTypeOutput,
		TermID: termID,
		Data:   data, // Already base64 encoded from app.go
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		logging.Error("Failed to marshal broadcast message", "error", err)
		return
	}

	s.mu.RLock()
	clients := make([]*struct {
		conn *websocket.Conn
		info *ClientInfo
	}, 0)

	logging.Debug("Checking clients for broadcast", "totalClients", len(s.clients))
	for conn, info := range s.clients {
		logging.Debug("Client check", "clientTermID", info.TerminalID, "broadcastTermID", termID, "match", info.TerminalID == termID || info.TerminalID == "")
		if info.TerminalID == termID || info.TerminalID == "" {
			clients = append(clients, &struct {
				conn *websocket.Conn
				info *ClientInfo
			}{conn, info})
		}
	}
	s.mu.RUnlock()

	// Write to clients outside the main lock, using per-connection mutex
	for _, c := range clients {
		c.info.writeMu.Lock()
		err := c.conn.WriteMessage(websocket.TextMessage, msgBytes)
		c.info.writeMu.Unlock()
		if err != nil {
			logging.Debug("Failed to write to client", "error", err)
		}
	}
}

// BroadcastTerminalsList sends the updated terminal list to all connected clients
func (s *Server) BroadcastTerminalsList() {
	// Now broadcast projects list instead of terminals list
	s.BroadcastProjectsList()
}

// BroadcastProjectsList sends the updated projects list to all connected clients
func (s *Server) BroadcastProjectsList() {
	s.mu.RLock()
	handler := s.projectHandler
	s.mu.RUnlock()

	var projects []ProjectInfo
	if handler != nil {
		projects = handler.GetProjects()
	} else {
		projects = []ProjectInfo{}
	}

	msg := ServerMessage{
		Type:     MsgTypeProjects,
		Projects: projects,
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		logging.Error("Failed to marshal projects list broadcast", "error", err)
		return
	}

	s.mu.RLock()
	clients := make([]*struct {
		conn *websocket.Conn
		info *ClientInfo
	}, 0)

	for conn, info := range s.clients {
		clients = append(clients, &struct {
			conn *websocket.Conn
			info *ClientInfo
		}{conn, info})
	}
	s.mu.RUnlock()

	// Write to clients outside the main lock, using per-connection mutex
	for _, c := range clients {
		c.info.writeMu.Lock()
		err := c.conn.WriteMessage(websocket.TextMessage, msgBytes)
		c.info.writeMu.Unlock()
		if err != nil {
			logging.Debug("Failed to broadcast projects list to client", "error", err)
		}
	}
}

// handleHealth handles health check requests
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "ok",
		"time":   time.Now().Unix(),
	}); err != nil {
		logging.Error("Failed to encode health response", "error", err)
	}
}

// handleTerminalsList returns list of available terminals (requires token)
func (s *Server) handleTerminalsList(w http.ResponseWriter, r *http.Request) {
	clientIP := getClientIP(r)

	// Check rate limit
	if !s.checkRateLimit(clientIP) {
		http.Error(w, "Too many attempts, try again later", http.StatusTooManyRequests)
		return
	}

	// Try header first, then query param
	token := r.Header.Get("Authorization")
	if strings.HasPrefix(token, "Bearer ") {
		token = strings.TrimPrefix(token, "Bearer ")
	} else {
		token = r.URL.Query().Get("token")
	}

	if !s.validateToken(token) {
		s.recordFailedAuth(clientIP)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	s.resetAuthAttempts(clientIP)

	terminals := s.getTerminalsList()
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(terminals); err != nil {
		logging.Error("Failed to encode terminals list", "error", err)
	}
}

// handleTokenInfo returns info about whether a token is approved (permanent)
func (s *Server) handleTokenInfo(w http.ResponseWriter, r *http.Request) {
	clientIP := getClientIP(r)

	if !s.checkRateLimit(clientIP) {
		http.Error(w, "Too many attempts", http.StatusTooManyRequests)
		return
	}

	token := r.Header.Get("Authorization")
	if strings.HasPrefix(token, "Bearer ") {
		token = strings.TrimPrefix(token, "Bearer ")
	} else {
		token = r.URL.Query().Get("token")
	}

	if !s.validateToken(token) {
		s.recordFailedAuth(clientIP)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	s.resetAuthAttempts(clientIP)

	// Check if it's an approved (permanent) token
	isApproved := s.IsApprovedToken(token)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"valid":    true,
		"approved": isApproved,
	})
}

// getTerminalsList returns list of terminals
func (s *Server) getTerminalsList() []TerminalInfo {
	terms := s.termManager.List()
	list := make([]TerminalInfo, len(terms))
	for i, t := range terms {
		info := t.Info()
		list[i] = TerminalInfo{
			ID:      info.ID,
			Name:    info.Name,
			WorkDir: info.WorkDir,
			Running: info.Running,
		}
	}
	return list
}

// handleTerminalWS handles WebSocket connections for terminal access
func (s *Server) handleTerminalWS(w http.ResponseWriter, r *http.Request) {
	clientIP := getClientIP(r)

	// Check rate limit
	if !s.checkRateLimit(clientIP) {
		http.Error(w, "Too many attempts, try again later", http.StatusTooManyRequests)
		logging.Warn("Remote access rejected: rate limited", "ip", clientIP)
		return
	}

	// Try header first, then query param for token
	token := r.Header.Get("Authorization")
	if strings.HasPrefix(token, "Bearer ") {
		token = strings.TrimPrefix(token, "Bearer ")
	} else {
		token = r.URL.Query().Get("token")
	}

	if !s.validateToken(token) {
		s.recordFailedAuth(clientIP)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		logging.Warn("Remote access rejected: invalid token", "remoteAddr", r.RemoteAddr)
		return
	}

	s.resetAuthAttempts(clientIP)

	// Check connection limit
	s.mu.RLock()
	clientCount := len(s.clients)
	s.mu.RUnlock()

	if clientCount >= maxClients {
		http.Error(w, "Maximum connections reached", http.StatusServiceUnavailable)
		logging.Warn("Remote access rejected: max clients reached", "count", clientCount)
		return
	}

	// Upgrade to WebSocket
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		logging.Error("WebSocket upgrade failed", "error", err)
		return
	}

	// Generate client ID
	clientIDBytes := make([]byte, 8)
	if _, err := rand.Read(clientIDBytes); err != nil {
		logging.Error("Failed to generate client ID", "error", err)
		conn.Close()
		return
	}
	clientID := hex.EncodeToString(clientIDBytes)

	// Register client
	clientInfo := &ClientInfo{
		ID:          clientID,
		ConnectedAt: time.Now(),
		TerminalID:  r.URL.Query().Get("termId"),
		UserAgent:   r.UserAgent(),
		RemoteAddr:  r.RemoteAddr,
	}

	s.mu.Lock()
	s.clients[conn] = clientInfo
	s.mu.Unlock()

	logging.Info("Remote client connected", "clientId", clientID, "remoteAddr", r.RemoteAddr)

	// Send initial projects list (with terminals)
	s.sendProjectsList(conn, clientInfo)

	// Handle messages
	defer func() {
		s.mu.Lock()
		delete(s.clients, conn)
		s.mu.Unlock()
		conn.Close()
		logging.Info("Remote client disconnected", "clientId", clientID)
	}()

	for {
		_, msgBytes, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				logging.Error("WebSocket read error", "error", err)
			}
			return
		}

		var msg ClientMessage
		if err := json.Unmarshal(msgBytes, &msg); err != nil {
			s.sendError(conn, clientInfo, "Invalid message format")
			continue
		}

		s.handleClientMessage(conn, clientInfo, &msg)
	}
}

// handleClientMessage processes a message from the client
func (s *Server) handleClientMessage(conn *websocket.Conn, client *ClientInfo, msg *ClientMessage) {
	switch msg.Type {
	case MsgTypeInput:
		logging.Debug("Received input message", "termID", msg.TermID, "dataLen", len(msg.Data))
		if msg.TermID == "" {
			s.sendError(conn, client, "Terminal ID required")
			return
		}
		// Update client's current terminal
		s.mu.Lock()
		client.TerminalID = msg.TermID
		s.mu.Unlock()

		// Write to terminal
		if err := s.termManager.Write(msg.TermID, []byte(msg.Data)); err != nil {
			logging.Error("Failed to write to terminal", "termID", msg.TermID, "error", err)
			s.sendError(conn, client, fmt.Sprintf("Failed to write to terminal: %v", err))
		} else {
			logging.Debug("Wrote to terminal successfully", "termID", msg.TermID)
		}

	case MsgTypeResize:
		if msg.TermID == "" {
			s.sendError(conn, client, "Terminal ID required")
			return
		}

		// Update client's current terminal (so they receive output for this terminal)
		s.mu.Lock()
		previousTermID := client.TerminalID
		client.TerminalID = msg.TermID
		s.mu.Unlock()

		// Validate resize dimensions
		if msg.Rows < minResizeRows || msg.Rows > maxResizeRows ||
			msg.Cols < minResizeCols || msg.Cols > maxResizeCols {
			s.sendError(conn, client, fmt.Sprintf("Invalid terminal dimensions: rows must be %d-%d, cols must be %d-%d",
				minResizeRows, maxResizeRows, minResizeCols, maxResizeCols))
			return
		}

		if err := s.termManager.Resize(msg.TermID, uint16(msg.Rows), uint16(msg.Cols)); err != nil {
			s.sendError(conn, client, fmt.Sprintf("Failed to resize terminal: %v", err))
		}

		// If switching to a new terminal, trigger a screen redraw by sending Ctrl+L
		if previousTermID != msg.TermID {
			// Send Ctrl+L (form feed) to trigger screen redraw in most shells/applications
			s.termManager.Write(msg.TermID, []byte{0x0c})
		}

	case MsgTypeList:
		s.sendProjectsList(conn, client)

	case MsgTypeCreateTerminal:
		s.handleCreateTerminal(conn, client, msg)

	case MsgTypeRenameTerminal:
		s.handleRenameTerminal(conn, client, msg)

	case MsgTypeDeleteTerminal:
		s.handleDeleteTerminal(conn, client, msg)

	case MsgTypePing:
		s.sendPong(conn, client)
	}
}

// sendTerminalsList sends the list of terminals to a client
func (s *Server) sendTerminalsList(conn *websocket.Conn, client *ClientInfo) {
	msg := ServerMessage{
		Type:      MsgTypeTerminals,
		Terminals: s.getTerminalsList(),
	}
	msgBytes, err := json.Marshal(msg)
	if err != nil {
		logging.Error("Failed to marshal terminals list", "error", err)
		return
	}
	client.writeMu.Lock()
	if err := conn.WriteMessage(websocket.TextMessage, msgBytes); err != nil {
		logging.Debug("Failed to send terminals list", "error", err)
	}
	client.writeMu.Unlock()
}

// sendProjectsList sends the list of projects with their terminals to a client
func (s *Server) sendProjectsList(conn *websocket.Conn, client *ClientInfo) {
	s.mu.RLock()
	handler := s.projectHandler
	s.mu.RUnlock()

	var projects []ProjectInfo
	if handler != nil {
		projects = handler.GetProjects()
	} else {
		// Fallback to flat terminal list if no project handler
		projects = []ProjectInfo{}
	}

	msg := ServerMessage{
		Type:     MsgTypeProjects,
		Projects: projects,
	}
	msgBytes, err := json.Marshal(msg)
	if err != nil {
		logging.Error("Failed to marshal projects list", "error", err)
		return
	}
	client.writeMu.Lock()
	if err := conn.WriteMessage(websocket.TextMessage, msgBytes); err != nil {
		logging.Debug("Failed to send projects list", "error", err)
	}
	client.writeMu.Unlock()
}

// handleCreateTerminal handles terminal creation request
func (s *Server) handleCreateTerminal(conn *websocket.Conn, client *ClientInfo, msg *ClientMessage) {
	s.mu.RLock()
	handler := s.projectHandler
	s.mu.RUnlock()

	if handler == nil {
		s.sendError(conn, client, "Project handler not configured")
		return
	}

	if msg.ProjectID == "" {
		s.sendError(conn, client, "Project ID required")
		return
	}

	name := msg.Name
	if name == "" {
		name = "Terminal"
	}

	term, err := handler.CreateTerminal(msg.ProjectID, name)
	if err != nil {
		s.sendError(conn, client, fmt.Sprintf("Failed to create terminal: %v", err))
		return
	}

	// Send success response with new terminal
	response := ServerMessage{
		Type:     MsgTypeCreateTerminal,
		Success:  true,
		Terminal: term,
	}
	msgBytes, _ := json.Marshal(response)
	client.writeMu.Lock()
	conn.WriteMessage(websocket.TextMessage, msgBytes)
	client.writeMu.Unlock()

	// Broadcast updated projects list to all clients
	s.BroadcastProjectsList()
}

// handleRenameTerminal handles terminal rename request
func (s *Server) handleRenameTerminal(conn *websocket.Conn, client *ClientInfo, msg *ClientMessage) {
	s.mu.RLock()
	handler := s.projectHandler
	s.mu.RUnlock()

	if handler == nil {
		s.sendError(conn, client, "Project handler not configured")
		return
	}

	if msg.ProjectID == "" || msg.TermID == "" {
		s.sendError(conn, client, "Project ID and Terminal ID required")
		return
	}

	if msg.Name == "" {
		s.sendError(conn, client, "New name required")
		return
	}

	if err := handler.RenameTerminal(msg.ProjectID, msg.TermID, msg.Name); err != nil {
		s.sendError(conn, client, fmt.Sprintf("Failed to rename terminal: %v", err))
		return
	}

	// Send success response
	response := ServerMessage{
		Type:    MsgTypeRenameTerminal,
		Success: true,
		TermID:  msg.TermID,
	}
	msgBytes, _ := json.Marshal(response)
	client.writeMu.Lock()
	conn.WriteMessage(websocket.TextMessage, msgBytes)
	client.writeMu.Unlock()

	// Broadcast updated projects list to all clients
	s.BroadcastProjectsList()
}

// handleDeleteTerminal handles terminal deletion request
func (s *Server) handleDeleteTerminal(conn *websocket.Conn, client *ClientInfo, msg *ClientMessage) {
	s.mu.RLock()
	handler := s.projectHandler
	s.mu.RUnlock()

	if handler == nil {
		s.sendError(conn, client, "Project handler not configured")
		return
	}

	if msg.ProjectID == "" || msg.TermID == "" {
		s.sendError(conn, client, "Project ID and Terminal ID required")
		return
	}

	if err := handler.DeleteTerminal(msg.ProjectID, msg.TermID); err != nil {
		s.sendError(conn, client, fmt.Sprintf("Failed to delete terminal: %v", err))
		return
	}

	// Send success response
	response := ServerMessage{
		Type:    MsgTypeDeleteTerminal,
		Success: true,
		TermID:  msg.TermID,
	}
	msgBytes, _ := json.Marshal(response)
	client.writeMu.Lock()
	conn.WriteMessage(websocket.TextMessage, msgBytes)
	client.writeMu.Unlock()

	// Broadcast updated projects list to all clients
	s.BroadcastProjectsList()
}

// sendError sends an error message to a client
func (s *Server) sendError(conn *websocket.Conn, client *ClientInfo, message string) {
	msg := ServerMessage{
		Type:    MsgTypeError,
		Message: message,
	}
	msgBytes, err := json.Marshal(msg)
	if err != nil {
		logging.Error("Failed to marshal error message", "error", err)
		return
	}
	client.writeMu.Lock()
	if err := conn.WriteMessage(websocket.TextMessage, msgBytes); err != nil {
		logging.Debug("Failed to send error", "error", err)
	}
	client.writeMu.Unlock()
}

// sendPong sends a pong response
func (s *Server) sendPong(conn *websocket.Conn, client *ClientInfo) {
	msg := ServerMessage{
		Type: MsgTypePong,
	}
	msgBytes, err := json.Marshal(msg)
	if err != nil {
		logging.Error("Failed to marshal pong message", "error", err)
		return
	}
	client.writeMu.Lock()
	if err := conn.WriteMessage(websocket.TextMessage, msgBytes); err != nil {
		logging.Debug("Failed to send pong", "error", err)
	}
	client.writeMu.Unlock()
}

// serveClient serves the web client HTML
func (s *Server) serveClient(w http.ResponseWriter, r *http.Request) {
	clientIP := getClientIP(r)

	// Check rate limit
	if !s.checkRateLimit(clientIP) {
		http.Error(w, "Too many attempts, try again later", http.StatusTooManyRequests)
		return
	}

	// Validate token (from query param for initial page load)
	token := r.URL.Query().Get("token")
	if !s.validateToken(token) {
		s.recordFailedAuth(clientIP)
		http.Error(w, "Unauthorized - Invalid or expired token", http.StatusUnauthorized)
		return
	}

	s.resetAuthAttempts(clientIP)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Referrer-Policy", "no-referrer")
	// Prevent caching to ensure fresh terminal list
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.Write([]byte(clientHTML))
}
