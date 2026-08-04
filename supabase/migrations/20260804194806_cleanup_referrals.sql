-- Remove referral-related columns if they exist
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'referral_code') THEN
        ALTER TABLE public.profiles DROP COLUMN referral_code;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'referred_by') THEN
        ALTER TABLE public.profiles DROP COLUMN referred_by;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'signup_bonus_days') THEN
        ALTER TABLE public.profiles DROP COLUMN signup_bonus_days;
    END IF;
END $$;

-- Drop referral-related functions
DROP FUNCTION IF EXISTS public.is_valid_referral_code(text);
DROP FUNCTION IF EXISTS public.get_referral_summary(uuid);

-- Payouts and referral tables are kept in DB for history but UI is removed.
-- To completely remove them (if desired):
-- DROP TABLE IF EXISTS public.payout_requests;
-- DROP TABLE IF EXISTS public.referrals;
