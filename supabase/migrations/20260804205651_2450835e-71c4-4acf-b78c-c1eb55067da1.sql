-- Create a clean migration for the new Reseller structure
-- 1. Create specialized tables for the new reseller system (keeping them in public for the data api)

-- 2. History of credit movements
CREATE TABLE IF NOT EXISTS public.reseller_credit_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount integer NOT NULL,
    type text NOT NULL, -- 'purchase', 'use', 'admin_adjustment', 'transfer'
    description text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Grants
GRANT SELECT ON public.reseller_credit_history TO authenticated;
GRANT ALL ON public.reseller_credit_history TO service_role;

-- RLS
ALTER TABLE public.reseller_credit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own credit history"
ON public.reseller_credit_history FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 3. Ensure profile fields are correct
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_reseller') THEN
        ALTER TABLE public.profiles ADD COLUMN is_reseller boolean DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'credits') THEN
        ALTER TABLE public.profiles ADD COLUMN credits integer DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'parent_id') THEN
        ALTER TABLE public.profiles ADD COLUMN parent_id uuid REFERENCES auth.users(id);
    END IF;
END $$;
