CREATE OR REPLACE FUNCTION public.conversations_participants_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
     OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_participants_immutable ON public.conversations;
CREATE TRIGGER conversations_participants_immutable
BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.conversations_participants_immutable();

DROP POLICY IF EXISTS "conversations: participants update" ON public.conversations;
CREATE POLICY "conversations: participants update" ON public.conversations
FOR UPDATE TO authenticated
USING (buyer_id = auth.uid() OR seller_id = auth.uid())
WITH CHECK (buyer_id = auth.uid() OR seller_id = auth.uid());