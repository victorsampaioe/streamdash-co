-- Add reseller_client_type if not exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_reseller') THEN
        ALTER TABLE public.profiles ADD COLUMN is_reseller BOOLEAN DEFAULT false;
    END IF;
END $$;
