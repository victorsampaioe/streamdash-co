-- Stream Monitor: isolated Cloudflare D1 migration snapshot of reseller money/credits.
-- NO production reads, spending, Pix creation, balance changes or source writes.
-- Identifiers are mirrored from PostgreSQL; no passwords or Pix keys are stored.
CREATE TABLE IF NOT EXISTS migration_reseller_wallet_stage (
 wallet_id TEXT PRIMARY KEY,
 reseller_id TEXT NOT NULL UNIQUE,
 credits INTEGER NOT NULL CHECK(credits >= 0),
 updated_at TEXT,
 source_snapshot_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS migration_reseller_tree_stage (
 tree_id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL UNIQUE,
 parent_reseller_id TEXT,
 owner_id TEXT NOT NULL,
 created_at TEXT,
 source_snapshot_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS migration_reseller_credit_history_stage (
 transaction_id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 amount INTEGER NOT NULL,
 type TEXT NOT NULL,
 created_at TEXT NOT NULL,
 source_snapshot_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS migration_reseller_credit_by_user ON migration_reseller_credit_history_stage(user_id,created_at);
CREATE TABLE IF NOT EXISTS migration_credit_history_stage (
 transaction_id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 amount INTEGER NOT NULL,
 type TEXT NOT NULL,
 created_at TEXT,
 source_snapshot_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS migration_referral_commissions_stage (
 commission_id TEXT PRIMARY KEY,
 referrer_id TEXT NOT NULL,
 referred_id TEXT NOT NULL,
 source_payment_id TEXT NOT NULL,
 paid_amount_cents INTEGER NOT NULL,
 rate_bps INTEGER NOT NULL,
 amount_cents INTEGER NOT NULL,
 reversed_at TEXT,
 created_at TEXT NOT NULL,
 source_snapshot_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS migration_reseller_plans_stage (
 plan_id TEXT PRIMARY KEY,
 reseller_id TEXT NOT NULL,
 name TEXT NOT NULL,
 price_cents INTEGER NOT NULL,
 duration_days INTEGER NOT NULL,
 kind TEXT NOT NULL,
 credits_amount INTEGER,
 updated_at TEXT,
 source_snapshot_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS migration_referral_credit_redemptions_stage (
 payment_id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL,
 amount_cents INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 source_snapshot_id TEXT NOT NULL
);
