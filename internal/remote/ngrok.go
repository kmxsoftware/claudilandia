package remote

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"

	"projecthub/internal/logging"
)

// NgrokTunnel manages an ngrok tunnel
type NgrokTunnel struct {
	cmd       *exec.Cmd
	publicURL string
	running   bool
	apiPort   int
	mu        sync.RWMutex
}

// NgrokAPIResponse represents the ngrok API tunnels response
type NgrokAPIResponse struct {
	Tunnels []struct {
		PublicURL string `json:"public_url"`
		Proto     string `json:"proto"`
	} `json:"tunnels"`
}

// NewNgrokTunnel creates a new ngrok tunnel manager
func NewNgrokTunnel() *NgrokTunnel {
	return &NgrokTunnel{
		apiPort: 4040, // Default ngrok API port
	}
}

// Start starts the ngrok tunnel
func (n *NgrokTunnel) Start(config Config) (string, error) {
	n.mu.Lock()
	defer n.mu.Unlock()

	if n.running {
		return n.publicURL, nil
	}

	// Check if ngrok is installed
	if _, err := exec.LookPath("ngrok"); err != nil {
		return "", fmt.Errorf("ngrok not found. Install with: brew install ngrok")
	}

	// Set API port from config
	if config.NgrokAPIPort > 0 {
		n.apiPort = config.NgrokAPIPort
	}

	// Build ngrok command
	args := []string{"http", fmt.Sprintf("%d", config.Port)}

	// Add subdomain for premium users
	if config.NgrokPlan == "premium" && config.Subdomain != "" {
		args = append(args, "--subdomain", config.Subdomain)
	}

	logging.Info("Starting ngrok tunnel", "args", strings.Join(args, " "), "apiPort", n.apiPort)

	n.cmd = exec.Command("ngrok", args...)

	// Start ngrok in background
	if err := n.cmd.Start(); err != nil {
		return "", fmt.Errorf("failed to start ngrok: %v", err)
	}

	n.running = true

	// Wait for ngrok to be ready and get the public URL
	var publicURL string
	var lastErr error

	for i := 0; i < 10; i++ {
		time.Sleep(500 * time.Millisecond)

		url, err := n.getPublicURLInternal()
		if err == nil && url != "" {
			publicURL = url
			break
		}
		lastErr = err
	}

	if publicURL == "" {
		n.stopInternal()
		if lastErr != nil {
			return "", fmt.Errorf("failed to get ngrok URL: %v", lastErr)
		}
		return "", fmt.Errorf("failed to get ngrok URL: timeout")
	}

	n.publicURL = publicURL
	logging.Info("ngrok tunnel started", "url", publicURL)

	return publicURL, nil
}

// getPublicURLInternal fetches the public URL from ngrok's local API (must be called with lock held)
func (n *NgrokTunnel) getPublicURLInternal() (string, error) {
	apiURL := fmt.Sprintf("http://localhost:%d/api/tunnels", n.apiPort)

	client := &http.Client{
		Timeout: 2 * time.Second,
	}

	resp, err := client.Get(apiURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("ngrok API returned status %d", resp.StatusCode)
	}

	var apiResp NgrokAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return "", err
	}

	// Find HTTPS tunnel
	for _, tunnel := range apiResp.Tunnels {
		if tunnel.Proto == "https" || strings.HasPrefix(tunnel.PublicURL, "https://") {
			return tunnel.PublicURL, nil
		}
	}

	// Fallback to any tunnel
	if len(apiResp.Tunnels) > 0 {
		return apiResp.Tunnels[0].PublicURL, nil
	}

	return "", fmt.Errorf("no tunnels found")
}

// stopInternal stops the tunnel (must be called with lock held)
func (n *NgrokTunnel) stopInternal() {
	n.running = false
	n.publicURL = ""

	if n.cmd != nil && n.cmd.Process != nil {
		logging.Info("Stopping ngrok tunnel")
		if err := n.cmd.Process.Kill(); err != nil {
			logging.Error("Failed to kill ngrok process", "error", err)
		}
		n.cmd.Wait()
		n.cmd = nil
	}
}

// Stop stops the ngrok tunnel
func (n *NgrokTunnel) Stop() error {
	n.mu.Lock()
	defer n.mu.Unlock()

	if !n.running {
		return nil
	}

	n.stopInternal()
	return nil
}

// IsRunning returns whether the tunnel is running
func (n *NgrokTunnel) IsRunning() bool {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.running
}

// GetPublicURL returns the current public URL
func (n *NgrokTunnel) GetPublicURL() string {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.publicURL
}

// RefreshURL refreshes the public URL from ngrok API
func (n *NgrokTunnel) RefreshURL() (string, error) {
	n.mu.Lock()
	defer n.mu.Unlock()

	if !n.running {
		return "", fmt.Errorf("tunnel not running")
	}

	url, err := n.getPublicURLInternal()
	if err != nil {
		return "", err
	}

	n.publicURL = url
	return url, nil
}

// GetAPIPort returns the configured ngrok API port
func (n *NgrokTunnel) GetAPIPort() int {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.apiPort
}
