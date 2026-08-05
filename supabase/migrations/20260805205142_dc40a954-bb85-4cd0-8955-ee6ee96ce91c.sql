-- Create the hierarchy tree table
CREATE TABLE IF NOT EXISTS public.reseller_tree (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    parent_reseller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    owner_id uuid REFERENCES public.profiles(id) NOT NULL, -- The "Root" admin or highest level reseller
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_tree TO authenticated;
GRANT ALL ON public.reseller_tree TO service_role;

ALTER TABLE public.reseller_tree ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tree entry" ON public.reseller_tree
    FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Parents can view their subtree" ON public.reseller_tree
    FOR SELECT TO authenticated USING (parent_reseller_id = auth.uid() OR owner_id = auth.uid());

-- Reseller Settings table (independent pricing and PIX)
CREATE TABLE IF NOT EXISTS public.reseller_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reseller_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    pix_key text,
    pix_name text,
    monthly_price_cents integer DEFAULT 3500,
    quarterly_price_cents integer DEFAULT 9000,
    annual_price_cents integer DEFAULT 29900,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (reseller_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_settings TO authenticated;
GRANT ALL ON public.reseller_settings TO service_role;

ALTER TABLE public.reseller_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Resellers manage their own settings" ON public.reseller_settings
    FOR ALL TO authenticated USING (reseller_id = auth.uid());

CREATE POLICY "Customers can view their reseller settings" ON public.reseller_settings
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.reseller_tree t 
            WHERE t.user_id = auth.uid() AND t.parent_reseller_id = reseller_settings.reseller_id
        )
    );

-- Reseller Wallet table
CREATE TABLE IF NOT EXISTS public.reseller_wallet (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reseller_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    credits integer DEFAULT 0 NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (reseller_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_wallet TO authenticated;
GRANT ALL ON public.reseller_wallet TO service_role;

ALTER TABLE public.reseller_wallet ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Resellers view own wallet" ON public.reseller_wallet
    FOR SELECT TO authenticated USING (reseller_id = auth.uid());

-- Migration Logic
DO $$
DECLARE
    admin_id uuid;
BEGIN
    -- Find a real admin user ID from public.user_roles
    SELECT user_id INTO admin_id FROM public.user_roles WHERE role = 'admin' LIMIT 1;
    
    -- If no admin role assigned yet, use the first created profile (emergency fallback)
    IF admin_id IS NULL THEN
        SELECT id INTO admin_id FROM public.profiles ORDER BY created_at ASC LIMIT 1;
    END IF;

    -- Migrate all existing profiles into the tree
    INSERT INTO public.reseller_tree (user_id, parent_reseller_id, owner_id)
    SELECT 
        p.id, 
        p.parent_id,
        COALESCE(p.parent_id, admin_id)
    FROM public.profiles p
    ON CONFLICT (user_id) DO UPDATE 
    SET parent_reseller_id = EXCLUDED.parent_reseller_id,
        owner_id = EXCLUDED.owner_id;

    -- Initialize settings for existing resellers
    INSERT INTO public.reseller_settings (reseller_id)
    SELECT id FROM public.profiles WHERE is_reseller = true
    ON CONFLICT (reseller_id) DO NOTHING;

    -- Initialize wallet with current credits from profiles
    INSERT INTO public.reseller_wallet (reseller_id, credits)
    SELECT id, COALESCE(credits, 0) FROM public.profiles WHERE is_reseller = true OR credits > 0
    ON CONFLICT (reseller_id) DO UPDATE SET credits = EXCLUDED.credits;
END $$;
