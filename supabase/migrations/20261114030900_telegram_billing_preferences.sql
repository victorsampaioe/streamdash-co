-- Optional Telegram billing reminders. Private-chat only and owner scoped.
CREATE TABLE IF NOT EXISTS public.telegram_billing_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_billing_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_billing_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.telegram_billing_preferences TO authenticated;
GRANT ALL ON public.telegram_billing_preferences TO service_role;
DROP POLICY IF EXISTS telegram_billing_owner_select ON public.telegram_billing_preferences;
CREATE POLICY telegram_billing_owner_select ON public.telegram_billing_preferences FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS telegram_billing_owner_insert ON public.telegram_billing_preferences;
CREATE POLICY telegram_billing_owner_insert ON public.telegram_billing_preferences FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS telegram_billing_owner_update ON public.telegram_billing_preferences;
CREATE POLICY telegram_billing_owner_update ON public.telegram_billing_preferences FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
COMMENT ON TABLE public.telegram_billing_preferences IS 'Private Telegram billing-reminder opt-out; links are owned by alert_channels; server cron sends only opted-in private chats.';
