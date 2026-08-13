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

	// Try to add the URL column for backward compatibility (ignore error if exists)
	_, _ = db.ExecContext(ctx, `ALTER TABLE sessions ADD COLUMN url TEXT DEFAULT ''`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE raw_events ADD COLUMN url TEXT DEFAULT ''`)

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
	INSERT INTO sessions (app_id, app_name, window_title, source, url, started_at, ended_at, duration_seconds, metadata_json)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	_, err := s.db.ExecContext(ctx, query,
		session.AppID,
		session.AppName,
		session.WindowTitle,
		session.Source,
		session.URL,
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
	INSERT INTO raw_events (timestamp, app_id, app_name, window_title, source, url, metadata_json)
	VALUES (?, ?, ?, ?, ?, ?, ?)
	`

	_, err := s.db.ExecContext(ctx, query,
		event.Timestamp.Format(time.RFC3339Nano),
		event.AppID,
		event.AppName,
		event.WindowTitle,
		event.Source,
		event.URL,
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
	SELECT id, app_id, app_name, window_title, source, url, started_at, ended_at, duration_seconds, metadata_json
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
			&r.URL,
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

// GetActiveSessionDates returns a list of distinct dates (YYYY-MM-DD) where the app was used.
func (s *SQLiteStorage) GetActiveSessionDates(ctx context.Context, appID string) ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	query := `
		SELECT DISTINCT date(started_at) as session_date 
		FROM sessions 
		WHERE app_id = ? 
		ORDER BY session_date DESC
	`
	rows, err := s.db.QueryContext(ctx, query, appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var dates []string
	for rows.Next() {
		var date string
		if err := rows.Scan(&date); err != nil {
			return nil, err
		}
		dates = append(dates, date)
	}
	return dates, nil
}

// GetActiveSessionHours returns a list of distinct hours (0-23) where the app was used on a specific date.
func (s *SQLiteStorage) GetActiveSessionHours(ctx context.Context, appID string, date string) ([]int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	query := `
		SELECT DISTINCT CAST(strftime('%H', started_at) AS INTEGER) as session_hour 
		FROM sessions 
		WHERE app_id = ? AND date(started_at) = ?
		ORDER BY session_hour DESC
	`
	rows, err := s.db.QueryContext(ctx, query, appID, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var hours []int
	for rows.Next() {
		var hour int
		if err := rows.Scan(&hour); err != nil {
			return nil, err
		}
		hours = append(hours, hour)
	}
	return hours, nil
}

// GetAppSessionsByTime returns sessions for a specific app filtered by date and optionally hour.
// If hour is -1, it returns all sessions for that date.
func (s *SQLiteStorage) GetAppSessionsByTime(ctx context.Context, appID string, date string, hour int) ([]SessionRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	query := `
		SELECT id, app_id, app_name, window_title, source, url, started_at, ended_at, duration_seconds, metadata_json 
		FROM sessions 
		WHERE app_id = ? AND date(started_at) = ?
	`
	args := []interface{}{appID, date}

	if hour >= 0 {
		query += ` AND CAST(strftime('%H', started_at) AS INTEGER) = ?`
		args = append(args, hour)
	}
	
	query += ` ORDER BY started_at DESC`

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []SessionRecord
	for rows.Next() {
		var rec SessionRecord
		var startedAtStr, endedAtStr, metaJSON string
		if err := rows.Scan(
			&rec.ID, &rec.AppID, &rec.AppName, &rec.WindowTitle, &rec.Source, &rec.URL,
			&startedAtStr, &endedAtStr, &rec.DurationSeconds, &metaJSON,
		); err != nil {
			return nil, err
		}
		if t, err := time.Parse(time.RFC3339Nano, startedAtStr); err == nil {
			rec.StartedAt = t
		}
		if t, err := time.Parse(time.RFC3339Nano, endedAtStr); err == nil {
			rec.EndedAt = t
		}
		if metaJSON != "" {
			_ = json.Unmarshal([]byte(metaJSON), &rec.Metadata)
		}
		records = append(records, rec)
	}
	return records, nil
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
	SELECT id, app_id, app_name, window_title, source, url, started_at, ended_at, duration_seconds, metadata_json
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
			&r.ID, &r.AppID, &r.AppName, &r.WindowTitle, &r.Source, &r.URL,
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
	case "year":
		since = now.AddDate(0, 0, -365)
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

func (s *SQLiteStorage) GetAppDocumentStats(ctx context.Context, appID string, timeframe string) ([]AppUsageStat, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.db == nil {
		return nil, fmt.Errorf("storage database not initialized")
	}

	var since time.Time
	now := time.Now()

	switch timeframe {
	case "today":
		since = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	case "week":
		since = now.AddDate(0, 0, -7)
	case "month":
		since = now.AddDate(0, 0, -30)
	case "year":
		since = now.AddDate(0, 0, -365)
	default:
		since = now.Add(-24 * time.Hour)
	}

	// SQLite json_extract extracts the fields from the metadata JSON object.
	// If project is present, format as "project / document". Otherwise, just "document".
	// Since metadata_json might be null or not have "document", we filter where it's not null.
	query := `
	SELECT 
	  CASE 
	    WHEN json_extract(metadata_json, '$.project') IS NOT NULL 
	    THEN json_extract(metadata_json, '$.project') || ' / ' || COALESCE(json_extract(metadata_json, '$.document'), window_title)
	    WHEN json_extract(metadata_json, '$.document') IS NOT NULL
	    THEN json_extract(metadata_json, '$.document')
	    ELSE window_title
	  END as doc, 
	  SUM(duration_seconds) as duration,
	  MAX(url) as url
	FROM sessions
	WHERE app_id = ? AND started_at >= ?
	GROUP BY doc
	HAVING duration >= 5
	ORDER BY duration DESC
	LIMIT 100
	`

	rows, err := s.db.QueryContext(ctx, query, appID, since.Format(time.RFC3339Nano))
	if err != nil {
		return nil, fmt.Errorf("failed to query app document stats: %w", err)
	}
	defer rows.Close()

	var stats []AppUsageStat
	for rows.Next() {
		var s AppUsageStat
		if err := rows.Scan(&s.Label, &s.DurationSeconds, &s.URL); err != nil {
			return nil, fmt.Errorf("failed to scan document stat row: %w", err)
		}
		stats = append(stats, s)
	}

	return stats, nil
}
