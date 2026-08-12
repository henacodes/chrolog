package engine

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"time"

	"chrolog/internal/adapters/afk"
	"chrolog/internal/adapters/httplistener"
	"chrolog/internal/adapters/hyprland"
	"chrolog/internal/adapters/win32"
	"chrolog/internal/adapters/x11"
	"chrolog/pkg/tracker"
)

// DetectAndInitializeAdapters inspects system environment variables and OS runtime
// to instantiate and initialize appropriate ActivityTracker adapters.
func DetectAndInitializeAdapters(ctx context.Context) ([]tracker.ActivityTracker, []error) {
	var trackers []tracker.ActivityTracker
	var initErrors []error

	// 1. HTTP Listener (always available for local extension/plugin telemetry)
	httpAdapter := httplistener.NewAdapter("127.0.0.1:1738")
	if err := httpAdapter.Init(ctx); err != nil {
		initErrors = append(initErrors, fmt.Errorf("http_listener adapter init failed: %w", err))
	} else {
		trackers = append(trackers, httpAdapter)
	}

	// 2. AFK / Idle Detection Adapter (5 minute threshold)
	afkAdapter := afk.NewAdapter(5 * time.Minute)
	if err := afkAdapter.Init(ctx); err != nil {
		initErrors = append(initErrors, fmt.Errorf("afk adapter init warning: %w", err))
	} else {
		trackers = append(trackers, afkAdapter)
	}

	// 3. OS / Compositor Specific Adapters
	if runtime.GOOS == "windows" {
		w32Adapter := win32.NewAdapter()
		if err := w32Adapter.Init(ctx); err != nil {
			initErrors = append(initErrors, fmt.Errorf("win32 adapter init failed: %w", err))
		} else {
			trackers = append(trackers, w32Adapter)
		}
	} else if runtime.GOOS == "linux" {
		sessionType := os.Getenv("XDG_SESSION_TYPE")
		hyprlandSig := os.Getenv("HYPRLAND_INSTANCE_SIGNATURE")

		// Prioritize Wayland/Hyprland if env matches
		if hyprlandSig != "" || sessionType == "wayland" {
			hAdapter := hyprland.NewAdapter()
			if err := hAdapter.Init(ctx); err != nil {
				initErrors = append(initErrors, fmt.Errorf("hyprland adapter init failed: %w", err))
			} else {
				trackers = append(trackers, hAdapter)
			}
		}

		// Check X11 if DISPLAY is set (or fallback for hybrid environments)
		display := os.Getenv("DISPLAY")
		if display != "" && sessionType != "wayland" {
			xAdapter := x11.NewAdapter()
			if err := xAdapter.Init(ctx); err != nil {
				initErrors = append(initErrors, fmt.Errorf("x11 adapter init failed: %w", err))
			} else {
				trackers = append(trackers, xAdapter)
			}
		}
	}

	return trackers, initErrors
}
