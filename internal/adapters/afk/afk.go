package afk

import (
	"context"
	"sync"
	"time"

	"chrolog/pkg/tracker"
)

type IdleFetcher func() (time.Duration, error)

type Adapter struct {
	threshold   time.Duration
	fetcher     IdleFetcher
	stopChan    chan struct{}
	isAFK       bool
	mu          sync.Mutex
	overrideId  string
}

func NewAdapter(threshold time.Duration) *Adapter {
	if threshold <= 0 {
		threshold = 5 * time.Minute // Default 5 minute idle threshold
	}
	return &Adapter{
		threshold: threshold,
		stopChan:  make(chan struct{}),
	}
}

func (a *Adapter) ID() string {
	if a.overrideId != "" {
		return a.overrideId
	}
	return "afk"
}

func (a *Adapter) Init(ctx context.Context) error {
	if a.fetcher == nil {
		fetcher, err := detectSystemIdleFetcher()
		if err != nil {
			return err
		}
		a.fetcher = fetcher
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
			idleDuration, err := a.fetcher()
			if err != nil {
				continue
			}

			a.mu.Lock()
			if idleDuration >= a.threshold && !a.isAFK {
				a.isAFK = true
				a.mu.Unlock()

				ev := tracker.NormalizedEvent{
					Timestamp:   time.Now().Add(-idleDuration),
					AppID:       "afk",
					AppName:     "AFK / Idle",
					WindowTitle: "Away from Keyboard",
					Source:      a.ID(),
					Metadata: map[string]string{
						"idle_duration_secs": idleDuration.String(),
					},
				}

				select {
				case eventChan <- ev:
				case <-ctx.Done():
					return
				case <-a.stopChan:
					return
				}
			} else if idleDuration < a.threshold && a.isAFK {
				a.isAFK = false
				a.mu.Unlock()
				// Input detected after AFK span
			} else {
				a.mu.Unlock()
			}
		}
	}
}

func (a *Adapter) IsAFK() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.isAFK
}

func (a *Adapter) Stop() error {
	close(a.stopChan)
	return nil
}
