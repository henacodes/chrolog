package engine

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"chrolog/internal/parser"
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
	priorityStates map[int]*tracker.NormalizedEvent
	wailsCtx       context.Context
	mu             sync.Mutex
	cancel         context.CancelFunc
	wg             sync.WaitGroup
	running        bool
	paused         bool
	minSessionSecs int64
	osTrackerSeen  time.Time
}

func NewEngine(store storage.Storage) *Engine {
	return &Engine{
		storage:        store,
		eventChan:      make(chan tracker.NormalizedEvent, 256),
		priorityStates: make(map[int]*tracker.NormalizedEvent),
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

func getPriority(source string) int {
	switch source {
	case "http_listener", "browser_extension", "vscode_extension":
		return 20 // High priority plugins
	default:
		return 10 // Base OS trackers
	}
}

func (e *Engine) handleNormalizedEvent(ctx context.Context, ev tracker.NormalizedEvent) {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.paused {
		return
	}

	// Update priority state
	priority := getPriority(ev.Source)
	if priority == 10 {
		e.osTrackerSeen = time.Now()
	}

	if ev.AppID == "" && ev.WindowTitle == "" {
		// Clear state for this priority
		delete(e.priorityStates, priority)
	} else {
		// Store the event for this priority
		e.priorityStates[priority] = &ev
	}

	// Determine the target event by correlating OS state with Extension state
	var targetEvent *tracker.NormalizedEvent

	osEvent := e.priorityStates[10]
	extEvent := e.priorityStates[20]

	if osEvent != nil {
		copyOfOsEvent := *osEvent
		if osEvent.Metadata != nil {
			copyOfOsEvent.Metadata = make(map[string]string)
			for k, v := range osEvent.Metadata {
				copyOfOsEvent.Metadata[k] = v
			}
		}
		targetEvent = &copyOfOsEvent

		// Check if the currently focused OS application is a web browser
		appName := strings.ToLower(osEvent.AppName)
		isBrowser := false
		browsers := []string{"chrome", "firefox", "brave", "edge", "safari", "opera", "browser"}
		for _, b := range browsers {
			if strings.Contains(appName, b) {
				isBrowser = true
				break
			}
		}

		isValidEnrichment := false
		if extEvent != nil {
			if isBrowser && extEvent.Source == "browser_extension" {
				isValidEnrichment = true
			} else if extEvent.Source != "browser_extension" {
				// For non-browsers (like VS Code), check if the OS app matches the extension AppID
				if strings.Contains(appName, strings.ToLower(extEvent.AppID)) || strings.ToLower(osEvent.AppID) == strings.ToLower(extEvent.AppID) {
					isValidEnrichment = true
				}
			}
		}

		// If the OS window matches the extension data, enrich it!
		if isValidEnrichment {
			enrichedEvent := *osEvent
			enrichedEvent.WindowTitle = extEvent.WindowTitle
			enrichedEvent.URL = extEvent.URL
			enrichedEvent.Source = extEvent.Source // Mark as enriched

			// Deep copy the metadata map to prevent mutating the persistent OS state
			newMeta := make(map[string]string)
			if osEvent.Metadata != nil {
				for k, v := range osEvent.Metadata {
					newMeta[k] = v
				}
			}
			for k, v := range extEvent.Metadata {
				newMeta[k] = v
			}
			
			// Use the extension's hostname/project as the project
			if proj, ok := extEvent.Metadata["project"]; ok && proj != "" {
				newMeta["project"] = proj
			} else {
				newMeta["project"] = extEvent.AppID
			}

			enrichedEvent.Metadata = newMeta
			targetEvent = &enrichedEvent
		}
	} else if extEvent != nil {
		// Fallback: If no OS tracker is running, just use extension data directly.
		// ONLY fallback if we haven't seen the OS tracker recently.
		// If the OS tracker is active but reports no window (empty state),
		// we should trust it and NOT fallback to the extension.
		if time.Since(e.osTrackerSeen) > 5*time.Second {
			fallbackEvent := *extEvent
			
			newMeta := make(map[string]string)
			if extEvent.Metadata != nil {
				for k, v := range extEvent.Metadata {
					newMeta[k] = v
				}
			}
			
			if proj, ok := extEvent.Metadata["project"]; ok && proj != "" {
				newMeta["project"] = proj
			} else {
				newMeta["project"] = extEvent.AppID
			}
			
			fallbackEvent.Metadata = newMeta
			// Normalize to a generic browser app so it looks correct in the UI
			fallbackEvent.AppID = "browser"
			fallbackEvent.AppName = "Browser"
			
			targetEvent = &fallbackEvent
		}
	}

	if targetEvent == nil {
		// No active tracking events (e.g., focus lost everywhere)
		return
	}

	// Always use the timestamp of the event that triggered this evaluation!
	// If we use an enriched event, its embedded timestamp will be from when the OS window was 
	// originally focused, which causes massive overlapping backdated sessions on tab switches.
	targetEvent.Timestamp = ev.Timestamp

	// Extract context early so that activity:changed broadcasts have accurate metadata
	// This prevents rapid identical events from wiping out UI tags before deduplication.
	ctxData := parser.ExtractContext(targetEvent.AppName, targetEvent.WindowTitle)
	earlyMeta := targetEvent.Metadata
	if earlyMeta == nil {
		earlyMeta = make(map[string]string)
	}
	for k, v := range ctxData {
		if v != "" && v != targetEvent.WindowTitle {
			if _, exists := earlyMeta[k]; !exists {
				earlyMeta[k] = v
			}
		}
	}
	targetEvent.Metadata = earlyMeta

	// Emit activity:changed event to Wails frontend subscribers
	if e.wailsCtx != nil {
		wailsRuntime.EventsEmit(e.wailsCtx, "activity:changed", *targetEvent)
	}

	// Optionally log raw event if storage supports it
	if e.storage != nil {
		_ = e.storage.SaveRawEvent(ctx, *targetEvent)
	}

	// Check if this event matches the current active session (Deduplication)
	if e.activeSession != nil {
		isSameApp := e.activeSession.AppID == targetEvent.AppID
		isSameWindow := e.activeSession.WindowTitle == targetEvent.WindowTitle
		
		// Advanced Deduplication for dynamic titles (like notification badges or browser media players)
		if isSameApp && !isSameWindow {
			if targetEvent.URL != "" && e.activeSession.URL == targetEvent.URL {
				isSameWindow = true
			} else if parser.CleanWindowTitle(e.activeSession.WindowTitle) == parser.CleanWindowTitle(targetEvent.WindowTitle) {
				isSameWindow = true
			}
			
			if isSameWindow {
				// Title is functionally identical, but might have dynamic content (e.g. "(5) YouTube"). 
				// Keep our active session updated to the latest dynamic title string for accuracy.
				e.activeSession.WindowTitle = targetEvent.WindowTitle
			}
		}
		
		// Check if platform specific state changed (e.g. video paused/played)
		isSamePlatformState := true
		if e.activeSession.Metadata != nil && targetEvent.Metadata != nil {
			if e.activeSession.Metadata["platform_specific"] != targetEvent.Metadata["platform_specific"] {
				isSamePlatformState = false
			}
		}

		if isSameApp && isSameWindow && isSamePlatformState {
			// Deduplicated! Update session end timestamp and duration based on incoming event
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

	// Start new session span using the timestamp of the event that caused the transition
	e.activeSession = &storage.SessionRecord{
		AppID:           targetEvent.AppID,
		AppName:         targetEvent.AppName,
		WindowTitle:     targetEvent.WindowTitle,
		Source:          targetEvent.Source,
		URL:             targetEvent.URL,
		StartedAt:       targetEvent.Timestamp,
		EndedAt:         targetEvent.Timestamp,
		DurationSeconds: 0,
		Metadata:        targetEvent.Metadata,
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

func (e *Engine) GetGlobalTrendStats(ctx context.Context, days int) ([]storage.AppUsageStat, error) {
	if e.storage == nil {
		return nil, fmt.Errorf("storage not configured")
	}
	// Cast to SQLite Storage and call method
	if sqlite, ok := e.storage.(*storage.SQLiteStorage); ok {
		return sqlite.GetGlobalTrendStats(ctx, days)
	}
	return nil, fmt.Errorf("trend stats not supported for this backend")
}

func (e *Engine) GetAppDocumentStats(ctx context.Context, appID string, timeframe string) ([]storage.AppUsageStat, error) {
	if e.storage == nil {
		return nil, fmt.Errorf("storage is not configured")
	}
	// Cast the SQLite storage and call the method
	if sqlite, ok := e.storage.(*storage.SQLiteStorage); ok {
		return sqlite.GetAppDocumentStats(ctx, appID, timeframe)
	}
	return nil, fmt.Errorf("document stats not supported for this storage backend")
}

func (e *Engine) GetAppSessionHistory(ctx context.Context, appID string, limit int) ([]storage.SessionRecord, error) {
	if e.storage == nil {
		return nil, fmt.Errorf("storage is not configured")
	}
	return e.storage.GetAppSessionHistory(ctx, appID, limit)
}

func (e *Engine) GetActiveSessionDates(ctx context.Context, appID string) ([]string, error) {
	if e.storage == nil {
		return nil, fmt.Errorf("storage is not configured")
	}
	return e.storage.GetActiveSessionDates(ctx, appID)
}

func (e *Engine) GetActiveSessionHours(ctx context.Context, appID string, date string) ([]int, error) {
	if e.storage == nil {
		return nil, fmt.Errorf("storage is not configured")
	}
	return e.storage.GetActiveSessionHours(ctx, appID, date)
}

func (e *Engine) GetAppSessionsByTime(ctx context.Context, appID string, date string, hour int) ([]storage.SessionRecord, error) {
	if e.storage == nil {
		return nil, fmt.Errorf("storage not initialized")
	}
	return e.storage.GetAppSessionsByTime(ctx, appID, date, hour)
}

func (e *Engine) GetDocumentSessions(ctx context.Context, appID string, project string, document string) ([]storage.SessionRecord, error) {
	if e.storage == nil {
		return nil, fmt.Errorf("storage not initialized")
	}
	return e.storage.GetDocumentSessions(ctx, appID, project, document)
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
