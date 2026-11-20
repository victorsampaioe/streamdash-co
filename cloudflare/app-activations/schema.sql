PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS app_catalog (
  app_id TEXT PRIMARY KEY, name TEXT NOT NULL, module TEXT,
  provider_cost_cents INTEGER, sale_price_cents INTEGER, logo_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN(0,1)),
  updated_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS app_catalog_name_idx ON app_catalog(name);
CREATE TABLE IF NOT EXISTS activation_requests (
  request_id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL,
  app_id TEXT NOT NULL, app_name TEXT NOT NULL, mac TEXT NOT NULL,
  sale_price_cents INTEGER, provider_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN('awaiting_payment','submitting','submitted','activated','incorrect','failed','needs_review')),
  channel TEXT NOT NULL CHECK(channel IN('site','telegram')),
  confirmed_at_ms INTEGER NOT NULL, created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL, provider_http_status INTEGER,
  provider_error_code TEXT, expires_at TEXT
);
CREATE INDEX IF NOT EXISTS activation_requests_owner_time
  ON activation_requests(owner_user_id,created_at_ms DESC);
CREATE UNIQUE INDEX IF NOT EXISTS activation_requests_provider_id
  ON activation_requests(provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS activation_requests_dedupe
  ON activation_requests(owner_user_id,app_id,mac,created_at_ms DESC);
CREATE TABLE IF NOT EXISTS activation_provider_events (
 event_id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, event_status TEXT NOT NULL,
 received_at_ms INTEGER NOT NULL, processed_at_ms INTEGER, error_code TEXT
);
CREATE TABLE IF NOT EXISTS activation_config (
 key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at_ms INTEGER NOT NULL
);
INSERT OR IGNORE INTO activation_config(key,value,updated_at_ms)
 VALUES('live_activations_enabled','false',unixepoch('now')*1000);
INSERT OR IGNORE INTO activation_config(key,value,updated_at_ms)
 VALUES('sale_prices_approved','false',unixepoch('now')*1000);
