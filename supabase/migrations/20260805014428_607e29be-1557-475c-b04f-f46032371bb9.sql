-- Function to clean up user roles and types based on credits
-- Rule: credits > 0 -> Reseller, credits = 0 -> Client

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id, credits, is_reseller FROM public.profiles LOOP
        IF r.credits > 0 THEN
            -- Should be Reseller
            UPDATE public.profiles 
            SET is_reseller = true 
            WHERE id = r.id;
            
            -- Ensure subscription is extended to avoid "expired" banners for resellers
            INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
            VALUES (r.id, 'yearly', 'active', now(), now() + interval '10 years')
            ON CONFLICT (user_id) DO UPDATE 
            SET status = 'active', expires_at = now() + interval '10 years';
            
        ELSE
            -- Should be Client
            UPDATE public.profiles 
            SET is_reseller = false 
            WHERE id = r.id;
        END IF;
    END LOOP;
END $$;