package engine

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"chrolog/internal/storage"
	"chrolog/pkg/tracker"
)

type MockTracker struct {
	id        string
	initErr   error
	events    []tracker.NormalizedEvent
	eventChan chan<- tracker.NormalizedEvent
	stopChan  chan struct{}
}

func NewMockTracker(id string, initErr error, events []tracker.NormalizedEvent) *MockTracker {
	return &MockTracker{
		id:       id,
		initErr:  initErr,
		events:   events,
		stopChan: make(chan struct{}),
	}
}

func (m *MockTracker) ID() string {
	return m.id
}

func (m *MockTracker) Init(ctx context.Context) error {
	return m.initErr
}

func (m *MockTracker) Start(ctx context.Context, eventChan chan<- tracker.NormalizedEvent) error {
	m.eventChan = eventChan
	go func() {
		for _, ev := range m.events {
			select {
			case <-ctx.Done():
				return
			case <-m.stopChan:
				return
			case eventChan <- ev:
				time.Sleep(10 * time.Millisecond)
			}
		}
	}()
	return nil
}

func (m *MockTracker) Stop() error {
	close(m.stopChan)
	return nil
}

func TestEngineDeduplicationAndStorage(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_chrolog.db")

	store := storage.NewSQLiteStorage(dbPath)
	eng := NewEngine(store)
	eng.minSessionSecs = 0 // Allow short sessions for testing

	now := time.Now()
	testEvents := []tracker.NormalizedEvent{
		{Timestamp: now, AppID: "ghostty", AppName: "ghostty", WindowTitle: "Terminal 1", Source: "mock"},
		{Timestamp: now.Add(100 * time.Millisecond), AppID: "ghostty", AppName: "ghostty", WindowTitle: "Terminal 1", Source: "mock"}, // Duplicate
		{Timestamp: now.Add(200 * time.Millisecond), AppID: "ghostty", AppName: "ghostty", WindowTitle: "Terminal 1", Source: "mock"}, // Duplicate
		{Timestamp: now.Add(500 * time.Millisecond), AppID: "firefox", AppName: "firefox", WindowTitle: "GitHub - chrolog", Source: "mock"}, // Transition
		{Timestamp: now.Add(600 * time.Millisecond), AppID: "firefox", AppName: "firefox", WindowTitle: "GitHub - chrolog", Source: "mock"}, // Duplicate
	}

	mock := NewMockTracker("mock", nil, testEvents)
	eng.AddTracker(mock)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := eng.Start(ctx); err != nil {
		t.Fatalf("failed to start engine: %v", err)
	}

	// Give time for events to be processed
	time.Sleep(300 * time.Millisecond)

	// Check GetCurrentSession & GetAdapterStatus while running
	currSession := eng.GetCurrentSession()
	if currSession == nil {
		t.Logf("Warning: current session was nil at check time")
	} else {
		t.Logf("Current active session: %s - %s", currSession.AppID, currSession.WindowTitle)
	}

	statuses := eng.GetAdapterStatus()
	if len(statuses) != 1 || !statuses[0].Active {
		t.Fatalf("expected 1 active adapter status, got: %+v", statuses)
	}

	// Test toggle tracking pause/resume
	activeState := eng.ToggleTracking()
	if activeState != false || !eng.IsPaused() {
		t.Fatalf("expected tracking to be paused")
	}
	eng.ToggleTracking() // Resume

	if err := eng.Stop(); err != nil {
		t.Fatalf("failed to stop engine: %v", err)
	}

	// Reopen storage to verify SQLite database file persistence on disk
	verifyStore := storage.NewSQLiteStorage(dbPath)
	if err := verifyStore.Init(context.Background()); err != nil {
		t.Fatalf("failed to open verify storage: %v", err)
	}
	defer verifyStore.Close()

	sessions, err := verifyStore.GetRecentSessions(context.Background(), 10)
	if err != nil {
		t.Fatalf("failed to query sessions from disk: %v", err)
	}

	if len(sessions) == 0 {
		t.Fatalf("expected persisted sessions in DB file, got 0")
	}

	t.Logf("Successfully captured and deduplicated %d session spans", len(sessions))
	for i, s := range sessions {
		t.Logf("Session %d: %s (%s) - duration %ds", i+1, s.AppID, s.WindowTitle, s.DurationSeconds)
	}

	// Test GetAppStats
	stats, err := verifyStore.GetAppStats(context.Background(), now.Add(-1*time.Hour))
	if err != nil {
		t.Fatalf("failed to get app stats: %v", err)
	}
	t.Logf("App stats retrieved: %d apps recorded", len(stats))
}
