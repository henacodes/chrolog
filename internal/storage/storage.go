package storage

import (
	"context"
	"time"

	"chrolog/pkg/tracker"
)

// SessionRecord represents a persisted activity block with start time, end time, and duration.
type SessionRecord struct {
	ID              int64             `json:"id"`
	AppID           string            `json:"app_id"`
	AppName         string            `json:"app_name"`
	WindowTitle     string            `json:"window_title"`
	Source          string            `json:"source"`
	URL             string            `json:"url"`
	StartedAt       time.Time         `json:"started_at"`
	EndedAt         time.Time         `json:"ended_at"`
	DurationSeconds int64             `json:"duration_seconds"`
	Metadata        map[string]string `json:"metadata"`
}

// AppStatRecord represents aggregated usage duration for a specific app.
type AppStatRecord struct {
	AppID                string  `json:"app_id"`
	AppName              string  `json:"app_name"`
	TotalDurationSeconds int64   `json:"total_duration_seconds"`
	Percentage           float64 `json:"percentage"`
}

// AppUsageStat represents aggregated usage duration for an app grouped by a time bin.
type AppUsageStat struct {
	Label           string `json:"label"`
	DurationSeconds int64  `json:"duration_seconds"`
	URL             string `json:"url"`
}

// Storage is the interface for persisting normalized events and session records.
type Storage interface {
	Init(ctx context.Context) error
	SaveSession(ctx context.Context, session SessionRecord) error
	SaveRawEvent(ctx context.Context, event tracker.NormalizedEvent) error
	GetRecentSessions(ctx context.Context, limit int) ([]SessionRecord, error)
	GetAppStats(ctx context.Context, since time.Time) ([]AppStatRecord, error)
	GetAppUsageStats(ctx context.Context, appID string, timeframe string) ([]AppUsageStat, error)
	GetAppSessionHistory(ctx context.Context, appID string, limit int) ([]SessionRecord, error)
	GetActiveSessionDates(ctx context.Context, appID string) ([]string, error)
	GetActiveSessionHours(ctx context.Context, appID string, date string) ([]int, error)
	GetAppSessionsByTime(ctx context.Context, appID string, date string, hour int) ([]SessionRecord, error)
	GetDocumentSessions(ctx context.Context, appID string, project string, document string) ([]SessionRecord, error)
	// UpdateSessionEnrichment patches an existing OS-only session with URL and metadata from the browser extension.
	UpdateSessionEnrichment(ctx context.Context, id int64, url string, source string, metadataJSON string, endedAt time.Time, durationSeconds int64) error
	Close() error
}
