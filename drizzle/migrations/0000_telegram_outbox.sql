CREATE TABLE IF NOT EXISTS public.telegram_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  target text NOT NULL,
  text text NOT NULL,
  source text NOT NULL DEFAULT 'alert',
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 6,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_outbox_due_idx ON public.telegram_outbox (status, next_attempt_at);
GRANT SELECT ON public.telegram_outbox TO authenticated;
GRANT ALL ON public.telegram_outbox TO service_role;
ALTER TABLE public.telegram_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read telegram outbox" ON public.telegram_outbox FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));