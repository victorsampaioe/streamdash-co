
CREATE TABLE public.core_execution_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    task_type text NOT NULL,
    endpoint text NOT NULL,
    request_payload jsonb,
    response_status int,
    response_data jsonb,
    execution_time_ms int,
    status text NOT NULL, -- pending, running, success, failed, timeout
    error_message text
);

GRANT SELECT, INSERT, UPDATE ON public.core_execution_logs TO authenticated;
GRANT ALL ON public.core_execution_logs TO service_role;

ALTER TABLE public.core_execution_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select all logs" 
ON public.core_execution_logs 
FOR SELECT 
TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can see their own logs" 
ON public.core_execution_logs 
FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE INDEX idx_core_logs_created_at ON public.core_execution_logs (created_at DESC);
CREATE INDEX idx_core_logs_task_type ON public.core_execution_logs (task_type);
