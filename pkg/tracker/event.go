package tracker

import (
	"time"
)

// NormalizedEvent represents a standardized, OS-agnostic window or activity event.
type NormalizedEvent struct {
	Timestamp   time.Time         `json:"timestamp"`
	AppID       string            `json:"app_id"`       // Process name, desktop entry ID, or binary name (e.g. "ghostty", "firefox", "code")
	AppName     string            `json:"app_name"`     // Human-readable application title
	WindowTitle string            `json:"window_title"` // Active window title/caption
	Source      string            `json:"source"`       // Tracker adapter name (e.g. "hyprland", "x11", "win32", "http_listener")
	URL         string            `json:"url"`          // Full URL for browser sessions
	Metadata    map[string]string `json:"metadata"`     // Optional additional contextual key-value tags
}
