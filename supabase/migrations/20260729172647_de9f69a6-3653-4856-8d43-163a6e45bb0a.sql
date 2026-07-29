CREATE TABLE public.mcp_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT,
  tool TEXT NOT NULL,
  args JSONB,
  outcome TEXT NOT NULL CHECK (outcome IN ('ok','error')),
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mcp_activity_log TO authenticated;
GRANT ALL ON public.mcp_activity_log TO service_role;
ALTER TABLE public.mcp_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own mcp activity" ON public.mcp_activity_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX mcp_activity_log_user_created_idx ON public.mcp_activity_log (user_id, created_at DESC);