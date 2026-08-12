package afk

import (
	"context"
	"sync"
	"testing"
	"time"

	"chrolog/pkg/tracker"
)

func TestAFKAdapterStateTransitions(t *testing.T) {
	var mu sync.Mutex
	currentIdle := 1 * time.Second

	adapter := NewAdapter(2 * time.Second)
	adapter.fetcher = func() (time.Duration, error) {
		mu.Lock()
		defer mu.Unlock()
		return currentIdle, nil
	}

	eventChan := make(chan tracker.NormalizedEvent, 10)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := adapter.Init(ctx); err != nil {
		t.Fatalf("failed to init AFK adapter: %v", err)
	}

	if err := adapter.Start(ctx, eventChan); err != nil {
		t.Fatalf("failed to start AFK adapter: %v", err)
	}

	// 1. Currently active (idle 1s < threshold 2s)
	time.Sleep(100 * time.Millisecond)
	if adapter.IsAFK() {
		t.Fatalf("expected isAFK to be false when idle < threshold")
	}

	// 2. Transition into AFK state (idle 3s > threshold 2s)
	mu.Lock()
	currentIdle = 3 * time.Second
	mu.Unlock()

	select {
	case ev := <-eventChan:
		if ev.AppID != "afk" {
			t.Fatalf("expected AppID to be 'afk', got: %s", ev.AppID)
		}
		t.Logf("Pass: Captured AFK transition event: %+v", ev)
	case <-time.After(4 * time.Second):
		t.Fatalf("timed out waiting for AFK event")
	}

	if !adapter.IsAFK() {
		t.Fatalf("expected isAFK to be true after exceeding threshold")
	}

	// 3. Return from AFK (user moves mouse, idle drops to 500ms)
	mu.Lock()
	currentIdle = 500 * time.Millisecond
	mu.Unlock()

	time.Sleep(3500 * time.Millisecond)
	if adapter.IsAFK() {
		t.Fatalf("expected isAFK to return to false after user input")
	}

	_ = adapter.Stop()
}
