-- Reuse Telegram AI explanations across retries and channels.
-- No messages or user-facing access outside the service role.
CREATE TABLE IF NOT EXISTS public.guardian_telegram_explanations (
  alert_key text PRIMARY KEY,
  explanation text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.guardian_telegram_explanations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guardian_telegram_explanations FROM anon,authenticated;
CREATE INDEX IF NOT EXISTS guardian_telegram_ai_created_idx ON public.guardian_telegram_explanations(created_at);
