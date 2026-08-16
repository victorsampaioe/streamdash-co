CREATE TABLE public.player_activities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid REFERENCES public.player_sessions(id) ON DELETE CASCADE NOT NULL,
    content_id text NOT NULL,
    content_type text NOT NULL,
    progress integer DEFAULT 0,
    is_favorite boolean DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    last_accessed_at timestamp with time zone DEFAULT now(),
    UNIQUE(session_id, content_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_activities TO authenticated;
GRANT ALL ON public.player_activities TO service_role;

ALTER TABLE public.player_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own activities" ON public.player_activities
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.player_sessions
        WHERE id = player_activities.session_id
    ));
