CREATE TABLE public.tmdb_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('movie','tv')),
  tmdb_id integer NOT NULL,
  title text NOT NULL,
  poster_path text,
  release_date date,
  title_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, media_type, tmdb_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tmdb_follows TO authenticated;
GRANT ALL ON public.tmdb_follows TO service_role;

ALTER TABLE public.tmdb_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tmdb follows" ON public.tmdb_follows
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_tmdb_follows_touch
  BEFORE UPDATE ON public.tmdb_follows
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE INDEX idx_tmdb_follows_user ON public.tmdb_follows (user_id, created_at DESC);