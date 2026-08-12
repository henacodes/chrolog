package hyprland

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"strings"
	"time"

	"chrolog/pkg/tracker"
)

type Adapter struct {
	signature string
	socketPath string
	stopChan  chan struct{}
}

type activeWindowJSON struct {
	Address string `json:"address"`
	Title   string `json:"title"`
	Class   string `json:"class"`
	InitialClass string `json:"initialClass"`
	InitialTitle string `json:"initialTitle"`
}

func NewAdapter() *Adapter {
	return &Adapter{
		stopChan: make(chan struct{}),
	}
}

func (a *Adapter) ID() string {
	return "hyprland"
}

func (a *Adapter) Init(ctx context.Context) error {
	sig := os.Getenv("HYPRLAND_INSTANCE_SIGNATURE")
	if sig == "" {
		return errors.New("[hyprland adapter] fatal init error: HYPRLAND_INSTANCE_SIGNATURE environment variable is not set; Hyprland compositor is not running")
	}

	a.signature = sig
	// Hyprland socket2 path: /tmp/hypr/$HYPRLAND_INSTANCE_SIGNATURE/.socket2.sock
	// or $XDG_RUNTIME_DIR/hypr/$HYPRLAND_INSTANCE_SIGNATURE/.socket2.sock
	sock1 := fmt.Sprintf("/tmp/hypr/%s/.socket2.sock", sig)
	xdg := os.Getenv("XDG_RUNTIME_DIR")
	sock2 := fmt.Sprintf("%s/hypr/%s/.socket2.sock", xdg, sig)

	if _, err := os.Stat(sock1); err == nil {
		a.socketPath = sock1
	} else if xdg != "" {
		if _, err := os.Stat(sock2); err == nil {
			a.socketPath = sock2
		}
	}

	// Fallback check for hyprctl binary if socket file stat failed
	if a.socketPath == "" {
		if _, err := exec.LookPath("hyprctl"); err != nil {
			return fmt.Errorf("[hyprland adapter] fatal init error: neither socket2.sock nor hyprctl binary found for signature %s: %w", sig, err)
		}
	}

	return nil
}

func (a *Adapter) Start(ctx context.Context, eventChan chan<- tracker.NormalizedEvent) error {
	go a.run(ctx, eventChan)
	return nil
}

func (a *Adapter) run(ctx context.Context, eventChan chan<- tracker.NormalizedEvent) {
	// If socket path is available, try UNIX socket streaming first
	if a.socketPath != "" {
		err := a.streamFromSocket(ctx, eventChan)
		if err == nil {
			return
		}
		// If socket streaming terminates unexpectedly, fall back to polling hyprctl
	}

	a.pollHyprctl(ctx, eventChan)
}

func (a *Adapter) streamFromSocket(ctx context.Context, eventChan chan<- tracker.NormalizedEvent) error {
	conn, err := net.Dial("unix", a.socketPath)
	if err != nil {
		return err
	}
	defer conn.Close()

	// Emit initial state
	if ev, err := a.fetchActiveWindow(); err == nil && ev != nil {
		select {
		case eventChan <- *ev:
		case <-ctx.Done():
			return nil
		case <-a.stopChan:
			return nil
		}
	}

	scanner := bufio.NewScanner(conn)
	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return nil
		case <-a.stopChan:
			return nil
		default:
		}

		line := scanner.Text()
		// Hyprland socket2 emits activewindow>>windowclass,windowtitle
		if strings.HasPrefix(line, "activewindow>>") {
			payload := strings.TrimPrefix(line, "activewindow>>")
			parts := strings.SplitN(payload, ",", 2)
			appClass := ""
			winTitle := ""
			if len(parts) > 0 {
				appClass = parts[0]
			}
			if len(parts) > 1 {
				winTitle = parts[1]
			}

			event := tracker.NormalizedEvent{
				Timestamp:   time.Now(),
				AppID:       appClass,
				AppName:     appClass,
				WindowTitle: winTitle,
				Source:      a.ID(),
				Metadata: map[string]string{
					"compositor": "hyprland",
				},
			}

			select {
			case eventChan <- event:
			case <-ctx.Done():
				return nil
			case <-a.stopChan:
				return nil
			}
		}
	}

	return scanner.Err()
}

func (a *Adapter) pollHyprctl(ctx context.Context, eventChan chan<- tracker.NormalizedEvent) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-a.stopChan:
			return
		case <-ticker.C:
			ev, err := a.fetchActiveWindow()
			if err == nil && ev != nil {
				select {
				case eventChan <- *ev:
				case <-ctx.Done():
					return
				case <-a.stopChan:
					return
				}
			}
		}
	}
}

func (a *Adapter) fetchActiveWindow() (*tracker.NormalizedEvent, error) {
	cmd := exec.Command("hyprctl", "activewindow", "-j")
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	var w activeWindowJSON
	if err := json.Unmarshal(out, &w); err != nil {
		return nil, err
	}

	if w.Class == "" && w.Title == "" {
		return nil, nil
	}

	appID := w.Class
	if appID == "" {
		appID = w.InitialClass
	}

	return &tracker.NormalizedEvent{
		Timestamp:   time.Now(),
		AppID:       appID,
		AppName:     appID,
		WindowTitle: w.Title,
		Source:      a.ID(),
		Metadata: map[string]string{
			"compositor": "hyprland",
			"address":    w.Address,
		},
	}, nil
}

func (a *Adapter) Stop() error {
	close(a.stopChan)
	return nil
}
