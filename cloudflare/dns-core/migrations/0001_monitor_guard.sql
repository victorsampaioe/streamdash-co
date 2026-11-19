-- D1 ONLY. Additive: no existing samples, targets, credentials or statuses changed.
CREATE TABLE IF NOT EXISTS monitor_state (
 server_id TEXT PRIMARY KEY,
 version INTEGER NOT NULL DEFAULT 0,
 state_json TEXT NOT NULL,
 updated_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS monitor_incidents (
 id TEXT PRIMARY KEY,
 server_id TEXT NOT NULL,
 opened_at_ms INTEGER NOT NULL,
 recovered_at_ms INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS monitor_one_open_incident
 ON monitor_incidents(server_id) WHERE recovered_at_ms IS NULL;
CREATE TABLE IF NOT EXISTS monitor_events (
 id TEXT PRIMARY KEY,
 server_id TEXT NOT NULL,
 incident_id TEXT NOT NULL,
 event TEXT NOT NULL CHECK(event IN ('down','recovered')),
 payload TEXT NOT NULL,
 created_at_ms INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','sent','uncertain','dead')),
 claim_token TEXT,
 lease_until_ms INTEGER,
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_ms INTEGER NOT NULL DEFAULT 0,
 last_error TEXT,
 UNIQUE(incident_id,event)
);
CREATE INDEX IF NOT EXISTS monitor_events_due ON monitor_events(status,next_attempt_ms);