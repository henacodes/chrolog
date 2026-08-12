package x11

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"chrolog/pkg/tracker"
)

type Adapter struct {
	stopChan chan struct{}
}

func NewAdapter() *Adapter {
	return &Adapter{
		stopChan: make(chan struct{}),
	}
}

func (a *Adapter) ID() string {
	return "x11"
}

func (a *Adapter) Init(ctx context.Context) error {
	display := os.Getenv("DISPLAY")
	if display == "" {
		return errors.New("[x11 adapter] fatal init error: DISPLAY environment variable is not set; X11 server is unavailable")
	}

	// Check for xdotool or xprop executable
	_, xdotoolErr := exec.LookPath("xdotool")
	_, xpropErr := exec.LookPath("xprop")
	if xdotoolErr != nil && xpropErr != nil {
		return fmt.Errorf("[x11 adapter] fatal init error: neither xdotool nor xprop is installed on system PATH")
	}

	return nil
}

func (a *Adapter) Start(ctx context.Context, eventChan chan<- tracker.NormalizedEvent) error {
	go a.run(ctx, eventChan)
	return nil
}

func (a *Adapter) run(ctx context.Context, eventChan chan<- tracker.NormalizedEvent) {
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
	// Try xdotool first
	if _, err := exec.LookPath("xdotool"); err == nil {
		windowIDCmd := exec.Command("xdotool", "getactivewindow")
		winIDOut, err := windowIDCmd.Output()
		if err == nil {
			winID := strings.TrimSpace(string(winIDOut))
			if winID != "" {
				nameCmd := exec.Command("xdotool", "getwindowname", winID)
				titleOut, _ := nameCmd.Output()
				title := strings.TrimSpace(string(titleOut))

				classCmd := exec.Command("xdotool", "getwindowclassname", winID)
				classOut, _ := classCmd.Output()
				appClass := strings.TrimSpace(string(classOut))

				if appClass == "" && title == "" {
					return nil, nil
				}

				return &tracker.NormalizedEvent{
					Timestamp:   time.Now(),
					AppID:       appClass,
					AppName:     appClass,
					WindowTitle: title,
					Source:      a.ID(),
					Metadata: map[string]string{
						"display":   os.Getenv("DISPLAY"),
						"window_id": winID,
					},
				}, nil
			}
		}
	}

	// Fallback to xprop -root _NET_ACTIVE_WINDOW
	if _, err := exec.LookPath("xprop"); err == nil {
		cmd := exec.Command("xprop", "-root", "_NET_ACTIVE_WINDOW")
		out, err := cmd.Output()
		if err == nil {
			line := string(out)
			if idx := strings.Index(line, "# "); idx != -1 {
				winHex := strings.TrimSpace(line[idx+2:])
				if winHex != "" && winHex != "0x0" {
					titleCmd := exec.Command("xprop", "-id", winHex, "_NET_WM_NAME")
					tOut, _ := titleCmd.Output()
					title := parseXpropString(string(tOut))

					classCmd := exec.Command("xprop", "-id", winHex, "WM_CLASS")
					cOut, _ := classCmd.Output()
					appClass := parseXpropClass(string(cOut))

					return &tracker.NormalizedEvent{
						Timestamp:   time.Now(),
						AppID:       appClass,
						AppName:     appClass,
						WindowTitle: title,
						Source:      a.ID(),
						Metadata: map[string]string{
							"display":   os.Getenv("DISPLAY"),
							"window_id": winHex,
						},
					}, nil
				}
			}
		}
	}

	return nil, nil
}

func parseXpropString(raw string) string {
	if idx := strings.Index(raw, "= \""); idx != -1 {
		val := raw[idx+3:]
		val = strings.TrimSuffix(val, "\"\n")
		return val
	}
	return ""
}

func parseXpropClass(raw string) string {
	parts := strings.Split(raw, "=")
	if len(parts) > 1 {
		classes := strings.Split(parts[1], ",")
		if len(classes) > 0 {
			clean := strings.Trim(strings.TrimSpace(classes[len(classes)-1]), "\"")
			return clean
		}
	}
	return ""
}

func (a *Adapter) Stop() error {
	close(a.stopChan)
	return nil
}
