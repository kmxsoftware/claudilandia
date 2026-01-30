package remote

import (
	"fmt"
	"strings"
)

// Config holds the remote access configuration
type Config struct {
	Enabled          bool   `json:"enabled"`          // Enable ngrok tunnel
	SavedDevicesOnly bool   `json:"savedDevicesOnly"` // Only allow saved devices (no new token)
	Port             int    `json:"port"`
	NgrokPlan        string `json:"ngrokPlan"`   // "free" or "premium"
	Subdomain        string `json:"subdomain"`   // only for premium
	TokenExpiry      int    `json:"tokenExpiry"` // hours, default 24
	NgrokAPIPort     int    `json:"ngrokApiPort"` // ngrok API port, default 4040
}

// DefaultConfig returns the default remote access configuration
func DefaultConfig() Config {
	return Config{
		Enabled:      false,
		Port:         9090,
		NgrokPlan:    "free",
		Subdomain:    "",
		TokenExpiry:  24,
		NgrokAPIPort: 4040,
	}
}

// ValidationError holds validation warnings and whether defaults were applied
type ValidationError struct {
	Warnings []string
}

func (e *ValidationError) Error() string {
	return strings.Join(e.Warnings, "; ")
}

func (e *ValidationError) HasWarnings() bool {
	return len(e.Warnings) > 0
}

// Validate validates the configuration and returns warnings if defaults were applied
func (c *Config) Validate() *ValidationError {
	var warnings []string

	// Validate port
	if c.Port < 1024 || c.Port > 65535 {
		warnings = append(warnings, fmt.Sprintf("invalid port %d (must be 1024-65535), using default 9090", c.Port))
		c.Port = 9090
	}

	// Validate ngrok plan
	if c.NgrokPlan != "free" && c.NgrokPlan != "premium" {
		warnings = append(warnings, fmt.Sprintf("invalid ngrok plan '%s', using default 'free'", c.NgrokPlan))
		c.NgrokPlan = "free"
	}

	// Validate token expiry (1 hour to 1 week)
	if c.TokenExpiry < 1 || c.TokenExpiry > 168 {
		warnings = append(warnings, fmt.Sprintf("invalid token expiry %d hours (must be 1-168), using default 24", c.TokenExpiry))
		c.TokenExpiry = 24
	}

	// Validate ngrok API port
	if c.NgrokAPIPort < 1024 || c.NgrokAPIPort > 65535 {
		warnings = append(warnings, fmt.Sprintf("invalid ngrok API port %d (must be 1024-65535), using default 4040", c.NgrokAPIPort))
		c.NgrokAPIPort = 4040
	}

	// Warn if subdomain is set but plan is free
	if c.Subdomain != "" && c.NgrokPlan == "free" {
		warnings = append(warnings, "subdomain is set but ngrok plan is 'free' - subdomain will be ignored")
	}

	if len(warnings) > 0 {
		return &ValidationError{Warnings: warnings}
	}
	return nil
}

// ValidateStrict returns an error if any value is invalid (without auto-fixing)
func (c *Config) ValidateStrict() error {
	var errors []string

	if c.Port < 1024 || c.Port > 65535 {
		errors = append(errors, fmt.Sprintf("port must be 1024-65535, got %d", c.Port))
	}

	if c.NgrokPlan != "free" && c.NgrokPlan != "premium" {
		errors = append(errors, fmt.Sprintf("ngrok plan must be 'free' or 'premium', got '%s'", c.NgrokPlan))
	}

	if c.TokenExpiry < 1 || c.TokenExpiry > 168 {
		errors = append(errors, fmt.Sprintf("token expiry must be 1-168 hours, got %d", c.TokenExpiry))
	}

	if c.NgrokAPIPort < 1024 || c.NgrokAPIPort > 65535 {
		errors = append(errors, fmt.Sprintf("ngrok API port must be 1024-65535, got %d", c.NgrokAPIPort))
	}

	if len(errors) > 0 {
		return fmt.Errorf("config validation failed: %s", strings.Join(errors, "; "))
	}
	return nil
}
