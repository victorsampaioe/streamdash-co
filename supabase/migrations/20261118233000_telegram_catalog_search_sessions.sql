-- Private Telegram catalog search state for bot @MonitordeFluxoBot.
-- Only backend service_role can read/write user-search sessions.
-- Expiration is verified on every callback; sessions are never permanent.
CREATE TABLE IF NOT EXISTS public.telegram_catalog_search_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 chat_id text NOT NULL CHECK(chat_id ~ '^[1-9][0-9]{4,15}$'),
 title text NULL CHECK(title IS NULL OR length(title) BETWEEN 2 AND 120),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT(now()+interval '20 minutes')
);
CREATE INDEX IF NOT EXISTS telegram_catalog_sessions_pending_idx
 ON public.telegram_catalog_search_sessions(owner_id,chat_id,created_at DESC)
 WHERE title IS NULL;
CREATE INDEX IF NOT EXISTS telegram_catalog_sessions_expiry_idx
 ON public.telegram_catalog_search_sessions(expires_at);
ALTER TABLE public.telegram_catalog_search_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_catalog_search_sessions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.telegram_catalog_search_sessions TO service_role;
COMMENT ON TABLE public.telegram_catalog_search_sessions IS
 'Private bot search sessions; no credentials or stream links; 20-minute expiry.';

-- Remove expired searches automatically without touching user/server data.
SELECT cron.schedule(
 'streammonitor-telegram-catalog-search-cleanup',
 '23 4 * * *',
 'DELETE FROM public.telegram_catalog_search_sessions WHERE expires_at < now() - interval ''1 day'''
);
