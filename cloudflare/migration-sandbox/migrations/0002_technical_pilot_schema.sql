-- Stream Monitor Cloudflare D1 pilot — NON-PRODUCTION ONLY.
-- Copy of validated, synthetic-only schema contracts for three source tables.
-- These are NOT production target tables: record_source deliberately allows
-- only SYNTHETIC. Do not remove that safety restriction in this sandbox.
-- No production customer/server IDs, payments or monitored hosts are copied.

CREATE TABLE IF NOT EXISTS pilot_checks_hourly (
  server_id TEXT NOT NULL,
  hour TEXT NOT NULL,
  total INTEGER NOT NULL CHECK(total>=0),
  ups INTEGER NOT NULL CHECK(ups>=0),
  degraded INTEGER NOT NULL CHECK(degraded>=0),
  downs INTEGER NOT NULL CHECK(downs>=0),
  avg_latency_ms INTEGER,
  max_latency_ms INTEGER,
  min_latency_ms INTEGER,
  ssl_days_remaining INTEGER,
  created_at TEXT NOT NULL,
  first_detector_region TEXT,
  record_source TEXT NOT NULL DEFAULT 'SYNTHETIC' CHECK(record_source='SYNTHETIC'),
  PRIMARY KEY(server_id,hour),
  CHECK(total=ups+degraded+downs)
);
CREATE INDEX IF NOT EXISTS idx_pilot_checks_hourly_hour
  ON pilot_checks_hourly(hour);

CREATE TABLE IF NOT EXISTS pilot_v2_platform_health_snapshots (
  captured_at TEXT PRIMARY KEY NOT NULL,
  servers_total INTEGER NOT NULL CHECK(servers_total>=0),
  servers_online INTEGER NOT NULL CHECK(servers_online>=0),
  servers_offline INTEGER NOT NULL CHECK(servers_offline>=0),
  servers_paused INTEGER NOT NULL CHECK(servers_paused>=0),
  dns_unresolved INTEGER NOT NULL CHECK(dns_unresolved>=0),
  avg_latency_ms REAL,
  incidents_open INTEGER NOT NULL CHECK(incidents_open>=0),
  telegram_pending INTEGER NOT NULL CHECK(telegram_pending>=0),
  telegram_failed_24h INTEGER NOT NULL CHECK(telegram_failed_24h>=0),
  subscriptions_active INTEGER NOT NULL CHECK(subscriptions_active>=0),
  servers_degraded INTEGER NOT NULL DEFAULT 0 CHECK(servers_degraded>=0),
  record_source TEXT NOT NULL CHECK(record_source='SYNTHETIC')
);

CREATE TABLE IF NOT EXISTS pilot_v2_region_checks_hourly (
  server_id TEXT NOT NULL,
  region_code TEXT NOT NULL,
  hour TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0 CHECK(total>=0),
  ups INTEGER NOT NULL DEFAULT 0 CHECK(ups>=0),
  downs INTEGER NOT NULL DEFAULT 0 CHECK(downs>=0),
  avg_latency_ms INTEGER CHECK(avg_latency_ms IS NULL OR avg_latency_ms>=0),
  max_latency_ms INTEGER CHECK(max_latency_ms IS NULL OR max_latency_ms>=0),
  created_at TEXT NOT NULL,
  record_source TEXT NOT NULL CHECK(record_source='SYNTHETIC'),
  PRIMARY KEY(server_id,region_code,hour),
  CHECK(total=ups+downs)
);
CREATE INDEX IF NOT EXISTS idx_pilot_v2_region_hour
  ON pilot_v2_region_checks_hourly(hour);

-- Foreign keys to real users and servers are not present in this isolated
-- pilot by design. A future production D1 model must enforce ownership,
-- tenancy, retention and audit semantics using server-side worker checks.
