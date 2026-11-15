-- Dedicated D1 database: streammonitor-edge-heartbeat
-- Stores only independent observations of the public homepage.
-- Not a replica or migration of the production PostgreSQL data.
CREATE TABLE IF NOT EXISTS heartbeat_samples (
  bucket_start TEXT PRIMARY KEY NOT NULL,
  recorded_at TEXT NOT NULL,
  target TEXT NOT NULL CHECK (target='streammonitor.site'),
  reachable INTEGER NOT NULL CHECK (reachable IN (0,1)),
  http_status INTEGER CHECK (http_status BETWEEN 100 AND 599 OR http_status IS NULL),
  latency_ms INTEGER NOT NULL CHECK(latency_ms BETWEEN 0 AND 30000),
  error_kind TEXT CHECK (error_kind IS NULL OR error_kind IN ('timeout','network_error','unexpected_status','unexpected_type','unknown')),
  source TEXT NOT NULL CHECK (source='CLOUDFLARE_EDGE_INDEPENDENT'),
  sample_type TEXT NOT NULL CHECK (sample_type IN ('manual_test','scheduled'))
);
CREATE INDEX IF NOT EXISTS idx_heartbeat_recorded_at
ON heartbeat_samples(recorded_at DESC);
