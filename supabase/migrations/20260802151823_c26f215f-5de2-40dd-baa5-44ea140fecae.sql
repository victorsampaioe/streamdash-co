CREATE TABLE IF NOT EXISTS public.telegram_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL DEFAULT now(),
  had_news boolean NOT NULL DEFAULT false,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_digests_user_sent ON public.telegram_digests (user_id, sent_at DESC);

GRANT SELECT ON public.telegram_digests TO authenticated;
GRANT ALL ON public.telegram_digests TO service_role;

ALTER TABLE public.telegram_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own digests" ON public.telegram_digests
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));