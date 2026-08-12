package engine

import (
	"context"
	"fmt"
	"sync"
	"time"

	"chrolog/internal/storage"
	"chrolog/pkg/tracker"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type AdapterStatusInfo struct {
	ID     string `json:"id"`
	Active bool   `json:"active"`
}

type Engine struct {
	trackers       []tracker.ActivityTracker
	storage        storage.Storage
	eventChan      chan tracker.NormalizedEvent
	activeSession  *storage.SessionRecord
	wailsCtx       context.Context
	mu             sync.Mutex
	cancel         context.CancelFunc
	wg             sync.WaitGroup
	running        bool
	paused         bool
	minSessionSecs int64
}

func NewEngine(store storage.Storage) *Engine {
	return &Engine{
		storage:        store,
		eventChan:      make(chan tracker.NormalizedEvent, 256),
		minSessionSecs: 1, // Minimum session length to persist (in seconds)
	}
}

func (e *Engine) SetWailsContext(ctx context.Context) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.wailsCtx = ctx
}

func (e *Engine) AddTracker(t tracker.ActivityTracker) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.trackers = append(e.trackers, t)
}

func (e *Engine) Start(ctx context.Context) error {
	e.mu.Lock()
	if e.running {
		e.mu.Unlock()
		return fmt.Errorf("engine is already running")
	}

	engineCtx, cancel := context.WithCancel(ctx)
	e.cancel = cancel
	e.running = true
	e.mu.Unlock()

	// Initialize storage backend
	if e.storage != nil {
		if err := e.storage.Init(engineCtx); err != nil {
			return fmt.Errorf("storage initialization failed: %w", err)
		}
	}

	// If no trackers registered manually, attempt auto-detection
	if len(e.trackers) == 0 {
		trackers, errs := DetectAndInitializeAdapters(engineCtx)
		for _, err := range errs {
			fmt.Printf("[engine warning] %v\n", err)
		}
		if len(trackers) == 0 {
			return fmt.Errorf("fatal: no activity tracker adapters could be successfully initialized")
		}
		e.trackers = trackers
	}

	// Start each adapter in its own goroutine
	for _, trk := range e.trackers {
		t := trk
		fmt.Printf("[engine] starting tracker adapter: %s\n", t.ID())
		if err := t.Start(engineCtx, e.eventChan); err != nil {
			fmt.Printf("[engine error] failed to start tracker %s: %v\n", t.ID(), err)
		}
	}

	// Start event processing consumer loop
	e.wg.Add(1)
	go e.processEvents(engineCtx)

	return nil
}

func (e *Engine) processEvents(ctx context.Context) {
	defer e.wg.Done()

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			e.flushActiveSession(context.Background())
			return

		case ev, ok := <-e.eventChan:
			if !ok {
				e.flushActiveSession(context.Background())
				return
			}
			e.handleNormalizedEvent(ctx, ev)

		case <-ticker.C:
			// Periodic session duration update check & status event emit
			e.mu.Lock()
			if e.activeSession != nil && !e.paused {
				e.activeSession.EndedAt = time.Now()
				e.activeSession.DurationSeconds = int64(e.activeSession.EndedAt.Sub(e.activeSession.StartedAt).Seconds())
				if e.wailsCtx != nil {
					wailsRuntime.EventsEmit(e.wailsCtx, "session:updated", *e.activeSession)
				}
			}
			e.mu.Unlock()
		}
	}
}

func (e *Engine) handleNormalizedEvent(ctx context.Context, ev tracker.NormalizedEvent) {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.paused {
		return
	}

	// Emit activity:changed event to Wails frontend subscribers
	if e.wailsCtx != nil {
		wailsRuntime.EventsEmit(e.wailsCtx, "activity:changed", ev)
	}

	// Optionally log raw event if storage supports it
	if e.storage != nil {
		_ = e.storage.SaveRawEvent(ctx, ev)
	}

	// Ignore empty event noise
	if ev.AppID == "" && ev.WindowTitle == "" {
		return
	}

	// Check if this event matches the current active session (Deduplication)
	if e.activeSession != nil {
		if e.activeSession.AppID == ev.AppID && e.activeSession.WindowTitle == ev.WindowTitle {
			// Deduplicated! Update session end timestamp and duration
			e.activeSession.EndedAt = ev.Timestamp
			e.activeSession.DurationSeconds = int64(ev.Timestamp.Sub(e.activeSession.StartedAt).Seconds())
			return
		}

		// State transition occurred! Finalize previous session
		e.activeSession.EndedAt = ev.Timestamp
		e.activeSession.DurationSeconds = int64(ev.Timestamp.Sub(e.activeSession.StartedAt).Seconds())

		if e.activeSession.DurationSeconds >= e.minSessionSecs && e.storage != nil {
			_ = e.storage.SaveSession(ctx, *e.activeSession)
		}
	}

	// Start new session span
	e.activeSession = &storage.SessionRecord{
		AppID:           ev.AppID,
		AppName:         ev.AppName,
		WindowTitle:     ev.WindowTitle,
		Source:          ev.Source,
		StartedAt:       ev.Timestamp,
		EndedAt:         ev.Timestamp,
		DurationSeconds: 0,
		Metadata:        ev.Metadata,
	}

	if e.wailsCtx != nil {
		wailsRuntime.EventsEmit(e.wailsCtx, "session:updated", *e.activeSession)
	}
}

func (e *Engine) flushActiveSession(ctx context.Context) {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.activeSession != nil {
		now := time.Now()
		e.activeSession.EndedAt = now
		e.activeSession.DurationSeconds = int64(now.Sub(e.activeSession.StartedAt).Seconds())

		if e.activeSession.DurationSeconds >= e.minSessionSecs && e.storage != nil {
			_ = e.storage.SaveSession(ctx, *e.activeSession)
		}
		e.activeSession = nil
	}
}

func (e *Engine) GetCurrentSession() *storage.SessionRecord {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.activeSession == nil {
		return nil
	}
	// Copy
	cp := *e.activeSession
	return &cp
}

func (e *Engine) GetAdapterStatus() []AdapterStatusInfo {
	e.mu.Lock()
	defer e.mu.Unlock()

	var result []AdapterStatusInfo
	for _, t := range e.trackers {
		result = append(result, AdapterStatusInfo{
			ID:     t.ID(),
			Active: e.running && !e.paused,
		})
	}
	return result
}

func (e *Engine) GetCategoryStats(ctx context.Context, timeframe string) ([]storage.AppStatRecord, error) {
	if e.storage == nil {
		return nil, fmt.Errorf("storage is not configured")
	}

	now := time.Now()
	var since time.Time

	switch timeframe {
	case "today":
		since = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	case "7d":
		since = now.AddDate(0, 0, -7)
	case "30d":
		since = now.AddDate(0, 0, -30)
	default: // "24h" or fallback
		since = now.Add(-24 * time.Hour)
	}

	return e.storage.GetAppStats(ctx, since)
}

func (e *Engine) ToggleTracking() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.paused = !e.paused
	return !e.paused
}

func (e *Engine) IsPaused() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.paused
}

func (e *Engine) GetRecentSessions(ctx context.Context, limit int) ([]storage.SessionRecord, error) {
	if e.storage == nil {
		return nil, fmt.Errorf("storage is not configured")
	}
	return e.storage.GetRecentSessions(ctx, limit)
}

func (e *Engine) GetAppUsageStats(ctx context.Context, appID string, timeframe string) ([]storage.AppUsageStat, error) {
	if e.storage == nil {
		return nil, fmt.Errorf("storage is not configured")
	}
	return e.storage.GetAppUsageStats(ctx, appID, timeframe)
}

func (e *Engine) GetAppSessionHistory(ctx context.Context, appID string, limit int) ([]storage.SessionRecord, error) {
	if e.storage == nil {
		return nil, fmt.Errorf("storage is not configured")
	}
	return e.storage.GetAppSessionHistory(ctx, appID, limit)
}

func (e *Engine) Stop() error {
	e.mu.Lock()
	if !e.running {
		e.mu.Unlock()
		return nil
	}
	e.running = false
	if e.cancel != nil {
		e.cancel()
	}
	e.mu.Unlock()

	// Stop all tracker adapters
	for _, trk := range e.trackers {
		if err := trk.Stop(); err != nil {
			fmt.Printf("[engine warning] error stopping tracker %s: %v\n", trk.ID(), err)
		}
	}

	e.wg.Wait()

	if e.storage != nil {
		return e.storage.Close()
	}
	return nil
}
