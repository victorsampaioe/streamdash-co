ALTER TYPE public.plan_type ADD VALUE IF NOT EXISTS 'reseller';
ALTER TYPE public.plan_type ADD VALUE IF NOT EXISTS 'basic';

ALTER TABLE public.reseller_plans
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'plan',
  ADD COLUMN IF NOT EXISTS credits_amount integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reseller_plans_kind_check'
  ) THEN
    ALTER TABLE public.reseller_plans
      ADD CONSTRAINT reseller_plans_kind_check CHECK (kind IN ('plan','credits'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='reseller_plans'
      AND policyname='Children can view their parent reseller plans'
  ) THEN
    CREATE POLICY "Children can view their parent reseller plans"
      ON public.reseller_plans FOR SELECT TO authenticated
      USING (
        reseller_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.parent_id = public.reseller_plans.reseller_id
        )
      );
  END IF;
END $$;
