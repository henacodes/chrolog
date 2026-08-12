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

// Storage is the interface for persisting normalized events and session records.
type Storage interface {
	Init(ctx context.Context) error
	SaveSession(ctx context.Context, session SessionRecord) error
	SaveRawEvent(ctx context.Context, event tracker.NormalizedEvent) error
	GetRecentSessions(ctx context.Context, limit int) ([]SessionRecord, error)
	GetAppStats(ctx context.Context, since time.Time) ([]AppStatRecord, error)
	Close() error
}
