-- Payment rail exclusively for a NEW, authorized Asaas account.
-- Independent of Stream Monitor subscriptions/Mercado Pago and existing Asaas integrations.
CREATE TABLE IF NOT EXISTS merchant_config(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pix_orders(
  order_id TEXT PRIMARY KEY,
  activation_request_id TEXT NOT NULL UNIQUE,
  owner_user_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  mac_normalized TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents >= 100),
  asaas_customer_id TEXT,
  asaas_payment_id TEXT UNIQUE,
  asaas_environment TEXT NOT NULL CHECK(asaas_environment IN('sandbox','production')),
  merchant_fingerprint TEXT NOT NULL,
  external_reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN(
    'prepared','creating_customer','creating_payment','awaiting_payment',
    'confirmed','received','paid_pending_activation','activated',
    'needs_review','cancelled','refunded','failed'
  )),
  pix_payload TEXT,
  pix_expires_at TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  paid_at_ms INTEGER
);
CREATE INDEX IF NOT EXISTS pix_orders_by_owner ON pix_orders(owner_user_id,created_at_ms DESC);
CREATE INDEX IF NOT EXISTS pix_orders_by_status ON pix_orders(status,updated_at_ms DESC);
CREATE UNIQUE INDEX IF NOT EXISTS pix_orders_by_payment ON pix_orders(asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS pix_webhook_events(
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  asaas_payment_id TEXT,
  external_reference TEXT,
  payment_status TEXT,
  received_at_ms INTEGER NOT NULL,
  reconciliation_status TEXT NOT NULL DEFAULT 'pending' CHECK(reconciliation_status IN(
    'pending','matched','unmatched','verified','rejected','needs_review'
  )),
  order_id TEXT,
  last_error_code TEXT
);
CREATE INDEX IF NOT EXISTS pix_webhook_events_pending
  ON pix_webhook_events(reconciliation_status,received_at_ms);
CREATE TABLE IF NOT EXISTS customer_bindings(
  owner_user_id TEXT PRIMARY KEY,
  asaas_customer_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK(environment IN('sandbox','production')),
  merchant_fingerprint TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);
INSERT OR IGNORE INTO merchant_config(key,value,updated_at_ms)
 VALUES('merchant_type','new_independent_asaas_account',unixepoch('now')*1000);
INSERT OR IGNORE INTO merchant_config(key,value,updated_at_ms)
 VALUES('merchant_authorized','false',unixepoch('now')*1000);
INSERT OR IGNORE INTO merchant_config(key,value,updated_at_ms)
 VALUES('merchant_verified','false',unixepoch('now')*1000);
INSERT OR IGNORE INTO merchant_config(key,value,updated_at_ms)
 VALUES('environment','sandbox',unixepoch('now')*1000);
INSERT OR IGNORE INTO merchant_config(key,value,updated_at_ms)
 VALUES('payment_creation_enabled','false',unixepoch('now')*1000);
INSERT OR IGNORE INTO merchant_config(key,value,updated_at_ms)
 VALUES('activation_auto_delivery_enabled','false',unixepoch('now')*1000);
INSERT OR IGNORE INTO merchant_config(key,value,updated_at_ms)
 VALUES('merchant_fingerprint','unverified',unixepoch('now')*1000);
