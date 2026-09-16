-- Helpers (SECURITY DEFINER to avoid RLS recursion inside policies)
CREATE OR REPLACE FUNCTION public.conversation_seller_is_listing_author(_listing_id uuid, _seller_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = _listing_id AND l.author_id = _seller_id
  )
$$;

CREATE OR REPLACE FUNCTION public.conversation_participants_match(_id uuid, _buyer_id uuid, _seller_id uuid, _listing_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = _id
      AND c.buyer_id = _buyer_id
      AND c.seller_id = _seller_id
      AND c.listing_id IS NOT DISTINCT FROM _listing_id
  )
$$;

REVOKE ALL ON FUNCTION public.conversation_seller_is_listing_author(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.conversation_participants_match(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conversation_seller_is_listing_author(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conversation_participants_match(uuid, uuid, uuid, uuid) TO authenticated, service_role;

-- 1) conversations INSERT: seller must be the listing author
DROP POLICY IF EXISTS "conversations: buyer insert" ON public.conversations;
CREATE POLICY "conversations: buyer insert"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (
  buyer_id = auth.uid()
  AND seller_id <> auth.uid()
  AND listing_id IS NOT NULL
  AND public.subscription_is_active(auth.uid())
  AND public.conversation_seller_is_listing_author(listing_id, seller_id)
);

-- 2) conversations UPDATE: participants cannot be reassigned
DROP POLICY IF EXISTS "conversations: participants update" ON public.conversations;
CREATE POLICY "conversations: participants update"
ON public.conversations
FOR UPDATE
TO authenticated
USING (buyer_id = auth.uid() OR seller_id = auth.uid())
WITH CHECK (
  (buyer_id = auth.uid() OR seller_id = auth.uid())
  AND public.conversation_participants_match(id, buyer_id, seller_id, listing_id)
);

-- 3) payout_requests: no direct client inserts; only request_payout() (SECURITY DEFINER) creates them
DROP POLICY IF EXISTS "payout: user inserts own" ON public.payout_requests;
REVOKE INSERT ON public.payout_requests FROM authenticated, anon;

-- Defense in depth: reject any self-approved / falsified payout inserted outside the RPC
CREATE OR REPLACE FUNCTION public.payout_requests_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'requested'
     OR NEW.approved_at IS NOT NULL
     OR NEW.paid_at IS NOT NULL
     OR NEW.rejected_at IS NOT NULL
     OR NEW.approved_by IS NOT NULL THEN
    RAISE EXCEPTION 'payout requests must start as requested';
  END IF;

  IF NEW.amount_cents IS NULL OR NEW.amount_cents < 1000 THEN
    RAISE EXCEPTION 'invalid payout amount';
  END IF;

  IF NEW.amount_cents > COALESCE((
      SELECT SUM(reward_cents) FROM public.referrals
      WHERE referrer_id = NEW.user_id AND status IN ('subscribed','requested')
    ), 0) THEN
    RAISE EXCEPTION 'saldo insuficiente';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payout_requests_insert_guard ON public.payout_requests;
CREATE TRIGGER payout_requests_insert_guard
BEFORE INSERT ON public.payout_requests
FOR EACH ROW EXECUTE FUNCTION public.payout_requests_insert_guard();