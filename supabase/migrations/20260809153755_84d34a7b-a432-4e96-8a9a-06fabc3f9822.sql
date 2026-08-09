
CREATE TABLE IF NOT EXISTS public.notification_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    server_id uuid REFERENCES public.servers(id) ON DELETE CASCADE,
    channel_id uuid REFERENCES public.alert_channels(id) ON DELETE CASCADE NOT NULL,
    event text NOT NULL, -- 'up' | 'down'
    message text NOT NULL,
    created_at timestamptz DEFAULT now(),
    processed boolean DEFAULT false
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_queue TO authenticated;
GRANT ALL ON public.notification_queue TO service_role;

ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notification queue"
ON public.notification_queue FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_alert_style text DEFAULT 'summary';
-- summary, individual, important
