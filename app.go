package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"chrolog/internal/engine"
	"chrolog/internal/storage"
)

// App struct
type App struct {
	ctx    context.Context
	engine *engine.Engine
}

// NewApp creates a new App application struct
func NewApp() *App {
	home, _ := os.UserHomeDir()
	dbDir := filepath.Join(home, ".config", "chrolog")
	_ = os.MkdirAll(dbDir, 0755)
	dbPath := filepath.Join(dbDir, "chrolog.db")

	store := storage.NewSQLiteStorage(dbPath)
	eng := engine.NewEngine(store)

	return &App{
		engine: eng,
	}
}

// startup is called when the app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.engine.SetWailsContext(ctx)

	fmt.Println("[chrolog] Starting activity tracking engine...")
	if err := a.engine.Start(ctx); err != nil {
		fmt.Printf("[chrolog startup warning] engine start error: %v\n", err)
	}
}

// shutdown is called when the app terminates.
func (a *App) shutdown(ctx context.Context) {
	if a.engine != nil {
		_ = a.engine.Stop()
	}
}

// GetRecentSessions returns the most recent tracked sessions for Wails frontend bindings.
func (a *App) GetRecentSessions(limit int) ([]storage.SessionRecord, error) {
	if a.engine == nil {
		return nil, fmt.Errorf("engine not initialized")
	}
	return a.engine.GetRecentSessions(a.ctx, limit)
}

// GetCurrentSession returns the active session currently being tracked.
func (a *App) GetCurrentSession() (*storage.SessionRecord, error) {
	if a.engine == nil {
		return nil, fmt.Errorf("engine not initialized")
	}
	return a.engine.GetCurrentSession(), nil
}

// GetAdapterStatus returns the status of loaded activity trackers.
func (a *App) GetAdapterStatus() ([]engine.AdapterStatusInfo, error) {
	if a.engine == nil {
		return nil, fmt.Errorf("engine not initialized")
	}
	return a.engine.GetAdapterStatus(), nil
}

// GetCategoryStats returns app duration statistics for a given timeframe ("today", "24h", "7d", "30d").
func (a *App) GetCategoryStats(timeframe string) ([]storage.AppStatRecord, error) {
	if a.engine == nil {
		return nil, fmt.Errorf("engine not initialized")
	}
	return a.engine.GetCategoryStats(a.ctx, timeframe)
}

// ToggleTracking toggles tracking on/off and returns whether tracking is currently active.
func (a *App) ToggleTracking() (bool, error) {
	if a.engine == nil {
		return false, fmt.Errorf("engine not initialized")
	}
	return a.engine.ToggleTracking(), nil
}

// IsPaused returns whether activity tracking is paused.
func (a *App) IsPaused() (bool, error) {
	if a.engine == nil {
		return false, fmt.Errorf("engine not initialized")
	}
	return a.engine.IsPaused(), nil
}

// GetAppUsageStats returns aggregated usage duration for a specific app over a timeframe.
func (a *App) GetAppUsageStats(appID string, timeframe string) ([]storage.AppUsageStat, error) {
	if a.engine == nil {
		return nil, fmt.Errorf("engine not initialized")
	}
	return a.engine.GetAppUsageStats(a.ctx, appID, timeframe)
}

// GetAppSessionHistory returns recent sessions for a specific app.
func (a *App) GetAppSessionHistory(appID string, limit int) ([]storage.SessionRecord, error) {
	if a.engine == nil {
		return nil, fmt.Errorf("engine not initialized")
	}
	return a.engine.GetAppSessionHistory(a.ctx, appID, limit)
}
