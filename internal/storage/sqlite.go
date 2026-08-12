package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"chrolog/pkg/tracker"

	_ "modernc.org/sqlite"
)

type SQLiteStorage struct {
	dbPath string
	db     *sql.DB
	mu     sync.Mutex
}

func NewSQLiteStorage(dbPath string) *SQLiteStorage {
	return &SQLiteStorage{
		dbPath: dbPath,
	}
}

func (s *SQLiteStorage) Init(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	db, err := sql.Open("sqlite", s.dbPath)
	if err != nil {
		return fmt.Errorf("failed to open sqlite db at %s: %w", s.dbPath, err)
	}

	// Create tables
	schema := `
	CREATE TABLE IF NOT EXISTS sessions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		app_id TEXT NOT NULL,
		app_name TEXT NOT NULL,
		window_title TEXT NOT NULL,
		source TEXT NOT NULL,
		started_at DATETIME NOT NULL,
		ended_at DATETIME NOT NULL,
		duration_seconds INTEGER NOT NULL,
		metadata_json TEXT
	);

	CREATE TABLE IF NOT EXISTS raw_events (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		timestamp DATETIME NOT NULL,
		app_id TEXT NOT NULL,
		app_name TEXT NOT NULL,
		window_title TEXT NOT NULL,
		source TEXT NOT NULL,
		metadata_json TEXT
	);

	CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
	CREATE INDEX IF NOT EXISTS idx_sessions_app_id ON sessions(app_id);
	`

	if _, err := db.ExecContext(ctx, schema); err != nil {
		db.Close()
		return fmt.Errorf("failed to execute schema initialization: %w", err)
	}

	s.db = db
	return nil
}

func (s *SQLiteStorage) SaveSession(ctx context.Context, session SessionRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.db == nil {
		return fmt.Errorf("storage database not initialized")
	}

	metaJSON, _ := json.Marshal(session.Metadata)

	query := `
	INSERT INTO sessions (app_id, app_name, window_title, source, started_at, ended_at, duration_seconds, metadata_json)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`

	_, err := s.db.ExecContext(ctx, query,
		session.AppID,
		session.AppName,
		session.WindowTitle,
		session.Source,
		session.StartedAt.Format(time.RFC3339Nano),
		session.EndedAt.Format(time.RFC3339Nano),
		session.DurationSeconds,
		string(metaJSON),
	)
	if err != nil {
		return fmt.Errorf("failed to insert session record: %w", err)
	}

	return nil
}

func (s *SQLiteStorage) SaveRawEvent(ctx context.Context, event tracker.NormalizedEvent) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.db == nil {
		return fmt.Errorf("storage database not initialized")
	}

	metaJSON, _ := json.Marshal(event.Metadata)

	query := `
	INSERT INTO raw_events (timestamp, app_id, app_name, window_title, source, metadata_json)
	VALUES (?, ?, ?, ?, ?, ?)
	`

	_, err := s.db.ExecContext(ctx, query,
		event.Timestamp.Format(time.RFC3339Nano),
		event.AppID,
		event.AppName,
		event.WindowTitle,
		event.Source,
		string(metaJSON),
	)
	if err != nil {
		return fmt.Errorf("failed to insert raw event: %w", err)
	}

	return nil
}

func (s *SQLiteStorage) GetRecentSessions(ctx context.Context, limit int) ([]SessionRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.db == nil {
		return nil, fmt.Errorf("storage database not initialized")
	}

	if limit <= 0 {
		limit = 50
	}

	query := `
	SELECT id, app_id, app_name, window_title, source, started_at, ended_at, duration_seconds, metadata_json
	FROM sessions
	ORDER BY started_at DESC
	LIMIT ?
	`

	rows, err := s.db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query recent sessions: %w", err)
	}
	defer rows.Close()

	var records []SessionRecord
	for rows.Next() {
		var r SessionRecord
		var startedAtStr, endedAtStr, metaJSON string

		err := rows.Scan(
			&r.ID,
			&r.AppID,
			&r.AppName,
			&r.WindowTitle,
			&r.Source,
			&startedAtStr,
			&endedAtStr,
			&r.DurationSeconds,
			&metaJSON,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan session record row: %w", err)
		}

		if t, err := time.Parse(time.RFC3339Nano, startedAtStr); err == nil {
			r.StartedAt = t
		}
		if t, err := time.Parse(time.RFC3339Nano, endedAtStr); err == nil {
			r.EndedAt = t
		}
		if metaJSON != "" {
			_ = json.Unmarshal([]byte(metaJSON), &r.Metadata)
		}

		records = append(records, r)
	}

	return records, nil
}

func (s *SQLiteStorage) GetAppStats(ctx context.Context, since time.Time) ([]AppStatRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.db == nil {
		return nil, fmt.Errorf("storage database not initialized")
	}

	query := `
	SELECT app_id, app_name, SUM(duration_seconds) as total_duration
	FROM sessions
	WHERE started_at >= ?
	GROUP BY app_id
	ORDER BY total_duration DESC
	`

	rows, err := s.db.QueryContext(ctx, query, since.Format(time.RFC3339Nano))
	if err != nil {
		return nil, fmt.Errorf("failed to query app stats: %w", err)
	}
	defer rows.Close()

	var records []AppStatRecord
	var overallTotal int64

	for rows.Next() {
		var r AppStatRecord
		if err := rows.Scan(&r.AppID, &r.AppName, &r.TotalDurationSeconds); err != nil {
			return nil, fmt.Errorf("failed to scan app stat row: %w", err)
		}
		overallTotal += r.TotalDurationSeconds
		records = append(records, r)
	}

	if overallTotal > 0 {
		for i := range records {
			records[i].Percentage = (float64(records[i].TotalDurationSeconds) / float64(overallTotal)) * 100.0
		}
	}

	return records, nil
}

func (s *SQLiteStorage) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.db != nil {
		err := s.db.Close()
		s.db = nil
		return err
	}
	return nil
}

func (s *SQLiteStorage) GetAppSessionHistory(ctx context.Context, appID string, limit int) ([]SessionRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.db == nil {
		return nil, fmt.Errorf("storage database not initialized")
	}

	if limit <= 0 {
		limit = 50
	}

	query := `
	SELECT id, app_id, app_name, window_title, source, started_at, ended_at, duration_seconds, metadata_json
	FROM sessions
	WHERE app_id = ?
	ORDER BY started_at DESC
	LIMIT ?
	`

	rows, err := s.db.QueryContext(ctx, query, appID, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query app sessions: %w", err)
	}
	defer rows.Close()

	var records []SessionRecord
	for rows.Next() {
		var r SessionRecord
		var startedAtStr, endedAtStr, metaJSON string

		err := rows.Scan(
			&r.ID, &r.AppID, &r.AppName, &r.WindowTitle, &r.Source,
			&startedAtStr, &endedAtStr, &r.DurationSeconds, &metaJSON,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan session record row: %w", err)
		}

		if t, err := time.Parse(time.RFC3339Nano, startedAtStr); err == nil {
			r.StartedAt = t
		}
		if t, err := time.Parse(time.RFC3339Nano, endedAtStr); err == nil {
			r.EndedAt = t
		}
		if metaJSON != "" {
			_ = json.Unmarshal([]byte(metaJSON), &r.Metadata)
		}

		records = append(records, r)
	}

	return records, nil
}

func (s *SQLiteStorage) GetAppUsageStats(ctx context.Context, appID string, timeframe string) ([]AppUsageStat, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.db == nil {
		return nil, fmt.Errorf("storage database not initialized")
	}

	var query string
	var since time.Time
	now := time.Now()

	switch timeframe {
	case "today":
		since = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		// Group by hour
		query = `
		SELECT strftime('%H:00', started_at) as label, SUM(duration_seconds) as duration
		FROM sessions
		WHERE app_id = ? AND started_at >= ?
		GROUP BY label
		ORDER BY label
		`
	case "week":
		since = now.AddDate(0, 0, -7)
		// Group by day
		query = `
		SELECT strftime('%Y-%m-%d', started_at) as label, SUM(duration_seconds) as duration
		FROM sessions
		WHERE app_id = ? AND started_at >= ?
		GROUP BY label
		ORDER BY label
		`
	case "month":
		since = now.AddDate(0, 0, -30)
		// Group by day
		query = `
		SELECT strftime('%Y-%m-%d', started_at) as label, SUM(duration_seconds) as duration
		FROM sessions
		WHERE app_id = ? AND started_at >= ?
		GROUP BY label
		ORDER BY label
		`
	default:
		since = now.Add(-24 * time.Hour)
		query = `
		SELECT strftime('%H:00', started_at) as label, SUM(duration_seconds) as duration
		FROM sessions
		WHERE app_id = ? AND started_at >= ?
		GROUP BY label
		ORDER BY label
		`
	}

	rows, err := s.db.QueryContext(ctx, query, appID, since.Format(time.RFC3339Nano))
	if err != nil {
		return nil, fmt.Errorf("failed to query app usage stats: %w", err)
	}
	defer rows.Close()

	var stats []AppUsageStat
	for rows.Next() {
		var s AppUsageStat
		if err := rows.Scan(&s.Label, &s.DurationSeconds); err != nil {
			return nil, fmt.Errorf("failed to scan usage stat row: %w", err)
		}
		stats = append(stats, s)
	}

	return stats, nil
}
