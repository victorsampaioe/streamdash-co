CREATE TABLE public.expiry_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'expired_access',
  sent_at timestamptz not null default now(),
  unique (user_id, kind)
);
GRANT SELECT ON public.expiry_notices TO authenticated;
GRANT ALL ON public.expiry_notices TO service_role;
ALTER TABLE public.expiry_notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expiry_notices: admin read" ON public.expiry_notices FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "expiry_notices: owner read" ON public.expiry_notices FOR SELECT TO authenticated USING (user_id = auth.uid());