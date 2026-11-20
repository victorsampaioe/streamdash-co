-- Isolated read-only economic metadata. No permission to grant credit, emit Pix, or alter balances.
CREATE TABLE IF NOT EXISTS migration_referrals_stage (
 referral_id TEXT PRIMARY KEY,
 referrer_id TEXT NOT NULL,
 referred_id TEXT NOT NULL,
 status TEXT,
 reward_cents INTEGER,
 created_at TEXT,
 subscribed_at TEXT,
 paid_at TEXT,
 source_snapshot_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS migration_referrals_by_referrer ON migration_referrals_stage(referrer_id);
CREATE TABLE IF NOT EXISTS migration_credit_packs_stage (
 plan_id TEXT PRIMARY KEY,
 credits_amount INTEGER NOT NULL,
 price_cents INTEGER NOT NULL,
 source_snapshot_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS migration_partner_referrals_stage (
 referral_id TEXT PRIMARY KEY,
 partner_id TEXT NOT NULL,
 referred_user_id TEXT NOT NULL,
 created_at TEXT,
 source_snapshot_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS migration_promo_campaigns_stage (
 campaign_key TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL,
 plan_code TEXT NOT NULL,
 promo_price_cents INTEGER NOT NULL,
 starts_at TEXT NOT NULL,
 ends_at TEXT NOT NULL,
 status TEXT NOT NULL,
 updated_at TEXT,
 source_snapshot_id TEXT NOT NULL
);
