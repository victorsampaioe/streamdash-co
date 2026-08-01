CREATE TABLE public.art_generations (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  created_by uuid not null,
  server_name text not null,
  total_new integer not null default 0,
  movies jsonb not null default '[]'::jsonb,
  series jsonb not null default '[]'::jsonb,
  channels jsonb not null default '[]'::jsonb,
  period_hours integer not null default 24,
  created_at timestamptz not null default now()
);
CREATE INDEX art_generations_server_idx ON public.art_generations(server_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.art_generations TO authenticated;
GRANT ALL ON public.art_generations TO service_role;
ALTER TABLE public.art_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage art generations" ON public.art_generations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));