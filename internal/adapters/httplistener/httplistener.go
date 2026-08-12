package httplistener

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"

	"chrolog/pkg/tracker"
)

type Adapter struct {
	addr       string
	server     *http.Server
	eventChan  chan<- tracker.NormalizedEvent
	mu         sync.Mutex
	isShutdown bool
}

type HTTPPayload struct {
	AppID       string            `json:"app_id"`
	AppName     string            `json:"app_name"`
	WindowTitle string            `json:"window_title"`
	Source      string            `json:"source"`
	Metadata    map[string]string `json:"metadata"`
}

func NewAdapter(addr string) *Adapter {
	if addr == "" {
		addr = "127.0.0.1:1738"
	}
	return &Adapter{
		addr: addr,
	}
}

func (a *Adapter) ID() string {
	return "http_listener"
}

func (a *Adapter) Init(ctx context.Context) error {
	// Fail fast check: verify local port binding capability
	l, err := net.Listen("tcp", a.addr)
	if err != nil {
		return fmt.Errorf("[http_listener adapter] fatal init error: unable to bind to %s: %w", a.addr, err)
	}
	_ = l.Close()
	return nil
}

func (a *Adapter) Start(ctx context.Context, eventChan chan<- tracker.NormalizedEvent) error {
	a.mu.Lock()
	a.eventChan = eventChan

	mux := http.NewServeMux()
	mux.HandleFunc("/event", a.handleEvent)

	a.server = &http.Server{
		Addr:    a.addr,
		Handler: mux,
	}
	a.mu.Unlock()

	go func() {
		if err := a.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Printf("[http_listener adapter] server error: %v\n", err)
		}
	}()

	return nil
}

func (a *Adapter) handleEvent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload HTTPPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid JSON payload", http.StatusBadRequest)
		return
	}

	source := payload.Source
	if source == "" {
		source = "http_listener"
	}

	ev := tracker.NormalizedEvent{
		Timestamp:   time.Now(),
		AppID:       payload.AppID,
		AppName:     payload.AppName,
		WindowTitle: payload.WindowTitle,
		Source:      source,
		Metadata:    payload.Metadata,
	}

	a.mu.Lock()
	ch := a.eventChan
	a.mu.Unlock()

	if ch != nil {
		select {
		case ch <- ev:
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"status":"ok"}`))
		default:
			http.Error(w, "Event channel buffer full", http.StatusServiceUnavailable)
		}
	} else {
		http.Error(w, "Adapter not active", http.StatusServiceUnavailable)
	}
}

func (a *Adapter) Stop() error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.server != nil && !a.isShutdown {
		a.isShutdown = true
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		return a.server.Shutdown(ctx)
	}
	return nil
}
