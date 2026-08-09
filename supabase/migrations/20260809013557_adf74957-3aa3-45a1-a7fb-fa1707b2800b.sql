-- Add notification style preference to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS telegram_iptv_style text DEFAULT 'summary' 
CHECK (telegram_iptv_style IN ('summary', 'important', 'individual'));

-- Create notification queue for IPTV content
CREATE TABLE IF NOT EXISTS public.iptv_notification_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    server_id uuid REFERENCES public.servers(id) ON DELETE CASCADE NOT NULL,
    kind text NOT NULL, -- 'live', 'vod', 'series'
    name text NOT NULL,
    category text,
    is_rare boolean DEFAULT false,
    is_first_detection boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    sent_at timestamptz
);

-- Index for processing
CREATE INDEX IF NOT EXISTS idx_iptv_queue_pending ON public.iptv_notification_queue (owner_id, sent_at) WHERE sent_at IS NULL;

-- Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.iptv_notification_queue TO authenticated;
GRANT ALL ON public.iptv_notification_queue TO service_role;

-- RLS
ALTER TABLE public.iptv_notification_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own queue"
ON public.iptv_notification_queue
FOR ALL
TO authenticated
USING (owner_id = auth.uid());
