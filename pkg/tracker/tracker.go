package tracker

import "context"

// ActivityTracker is the interface that all OS-specific or source-specific adapters must implement.
type ActivityTracker interface {
	// ID returns a unique identifier for the adapter (e.g. "hyprland", "x11", "win32", "http_listener").
	ID() string

	// Init checks required system environment variables, binary dependencies, or permissions.
	// Must fail fast and return a descriptive error if dependencies or permissions are missing.
	Init(ctx context.Context) error

	// Start begins monitoring window/activity events in a non-blocking goroutine,
	// sending normalized events into eventChan. Returns an error if start fails.
	Start(ctx context.Context, eventChan chan<- NormalizedEvent) error

	// Stop cleanly terminates any background polling, socket connections, or listeners.
	Stop() error
}
