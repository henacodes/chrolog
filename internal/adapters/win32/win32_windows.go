//go:build windows

package win32

import (
	"context"
	"errors"
	"fmt"
	"syscall"
	"time"
	"unsafe"

	"chrolog/pkg/tracker"
)

var (
	user32                       = syscall.NewLazyDLL("user32.dll")
	procGetForegroundWindow      = user32.NewProc("GetForegroundWindow")
	procGetWindowTextW           = user32.NewProc("GetWindowTextW")
	procGetWindowThreadProcessId = user32.NewProc("GetWindowThreadProcessId")
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
	return "win32"
}

func (a *Adapter) Init(ctx context.Context) error {
	if user32.Load() != nil {
		return errors.New("[win32 adapter] fatal init error: user32.dll could not be loaded")
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
	hwnd, _, _ := procGetForegroundWindow.Call()
	if hwnd == 0 {
		return nil, nil
	}

	buf := make([]uint16, 512)
	l, _, _ := procGetWindowTextW.Call(hwnd, uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	title := ""
	if l > 0 {
		title = syscall.UTF16ToString(buf[:l])
	}

	var pid uint32
	procGetWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(&pid)))

	appID := fmt.Sprintf("pid_%d", pid)

	return &tracker.NormalizedEvent{
		Timestamp:   time.Now(),
		AppID:       appID,
		AppName:     appID,
		WindowTitle: title,
		Source:      a.ID(),
		Metadata: map[string]string{
			"hwnd": fmt.Sprintf("%d", hwnd),
			"pid":  fmt.Sprintf("%d", pid),
		},
	}, nil
}

func (a *Adapter) Stop() error {
	close(a.stopChan)
	return nil
}
