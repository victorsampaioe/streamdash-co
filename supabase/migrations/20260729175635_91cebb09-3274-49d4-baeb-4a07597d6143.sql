-- ============ 1) Recompute rating ============
CREATE OR REPLACE FUNCTION public.hub_recompute_rating(_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.hub_profiles hp
  SET rating_avg = COALESCE((SELECT ROUND(AVG(stars)::numeric,2) FROM public.ratings WHERE ratee_id = _user), 0),
      rating_count = COALESCE((SELECT COUNT(*) FROM public.ratings WHERE ratee_id = _user), 0),
      updated_at = now()
  WHERE hp.id = _user;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_ratings_recompute()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.hub_recompute_rating(NEW.ratee_id);
  RETURN NEW;
END; $$;
CREATE TRIGGER ratings_after_insert
  AFTER INSERT ON public.ratings
  FOR EACH ROW EXECUTE FUNCTION public.tg_ratings_recompute();

-- ============ 2) Business count on conversation close ============
CREATE OR REPLACE FUNCTION public.tg_conversations_business_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.closed_at IS NOT NULL AND (OLD.closed_at IS NULL) THEN
    UPDATE public.hub_profiles SET business_count = business_count + 1, updated_at = now()
      WHERE id IN (NEW.buyer_id, NEW.seller_id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER conversations_business_count
  AFTER UPDATE OF closed_at ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.tg_conversations_business_count();

-- ============ 3) Detect contact leaks in messages ============
CREATE OR REPLACE FUNCTION public.tg_messages_flag_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  has_phone boolean;
  has_url boolean;
  body_norm text;
BEGIN
  body_norm := lower(coalesce(NEW.body,''));
  has_phone := body_norm ~ '(\+?\d[\d\s().-]{7,}\d)';
  has_url := body_norm ~ '(https?://|www\.|\.com|\.net|\.br|@[a-z0-9._-]+|t\.me/|wa\.me/|whatsapp|telegram|instagram)';
  IF NOT NEW.contact_shared AND (has_phone OR has_url) THEN
    NEW.flagged := true;
  END IF;
  -- Update conversation last_message_at
  UPDATE public.conversations SET last_message_at = now(), updated_at = now()
    WHERE id = NEW.conversation_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER messages_before_insert
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_messages_flag_contact();

-- ============ 4) Start/get conversation ============
CREATE OR REPLACE FUNCTION public.hub_start_conversation(_listing_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  seller uuid;
  conv_id uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.subscription_is_active(me) THEN
    RAISE EXCEPTION 'subscription required';
  END IF;
  SELECT author_id INTO seller FROM public.listings WHERE id = _listing_id AND status = 'active';
  IF seller IS NULL THEN RAISE EXCEPTION 'listing not found'; END IF;
  IF seller = me THEN RAISE EXCEPTION 'cannot open conversation with yourself'; END IF;

  SELECT id INTO conv_id FROM public.conversations
    WHERE listing_id = _listing_id AND buyer_id = me AND seller_id = seller;
  IF conv_id IS NOT NULL THEN RETURN conv_id; END IF;

  INSERT INTO public.conversations (listing_id, buyer_id, seller_id, last_message_at)
  VALUES (_listing_id, me, seller, now())
  RETURNING id INTO conv_id;
  RETURN conv_id;
END; $$;

REVOKE ALL ON FUNCTION public.hub_start_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hub_start_conversation(uuid) TO authenticated;

-- ============ 5) Ranking ============
CREATE OR REPLACE FUNCTION public.hub_get_ranking(_period_days integer DEFAULT 30, _limit integer DEFAULT 20)
RETURNS TABLE(
  user_id uuid,
  handle text,
  rating_avg numeric,
  rating_count integer,
  business_count integer,
  verified boolean,
  premium boolean,
  score numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    hp.id,
    COALESCE(hp.handle, split_part(p.email,'@',1)),
    hp.rating_avg,
    hp.rating_count,
    hp.business_count,
    (hp.verification_status = 'approved') AS verified,
    public.subscription_is_active(hp.id) AS premium,
    ROUND(
      (hp.rating_avg * hp.rating_count) + (hp.business_count * 2)
      + CASE WHEN hp.verification_status='approved' THEN 5 ELSE 0 END, 2
    ) AS score
  FROM public.hub_profiles hp
  JOIN public.profiles p ON p.id = hp.id
  WHERE hp.banned = false
  ORDER BY score DESC, hp.rating_avg DESC
  LIMIT GREATEST(1, LEAST(_limit, 100));
$$;
REVOKE ALL ON FUNCTION public.hub_get_ranking(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hub_get_ranking(integer, integer) TO authenticated;

-- ============ 6) Rate-limit listing creation (5/day) ============
CREATE OR REPLACE FUNCTION public.tg_listings_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cnt int;
BEGIN
  IF public.has_role(NEW.author_id,'admin') THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO cnt FROM public.listings
    WHERE author_id = NEW.author_id AND created_at > now() - interval '24 hours';
  IF cnt >= 5 THEN
    RAISE EXCEPTION 'Limite diário atingido (5 anúncios por dia). Tente novamente amanhã.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER listings_rate_limit
  BEFORE INSERT ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.tg_listings_rate_limit();

-- ============ 7) Auto-provision hub_profile on new profile ============
CREATE OR REPLACE FUNCTION public.tg_profiles_create_hub_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base text;
  candidate text;
  n int := 0;
BEGIN
  base := lower(regexp_replace(coalesce(NEW.full_name, split_part(NEW.email,'@',1)), '[^a-z0-9]+', '', 'g'));
  IF length(base) < 3 THEN base := 'user' || substr(NEW.id::text, 1, 6); END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.hub_profiles WHERE handle = candidate) LOOP
    n := n + 1; candidate := base || n::text;
  END LOOP;
  INSERT INTO public.hub_profiles (id, handle) VALUES (NEW.id, candidate)
    ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER profiles_after_insert_hub
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_create_hub_profile();

-- Backfill hub_profiles for existing users
INSERT INTO public.hub_profiles (id, handle)
SELECT p.id,
  COALESCE(
    lower(regexp_replace(coalesce(p.full_name, split_part(p.email,'@',1)), '[^a-z0-9]+', '', 'g')),
    'user' || substr(p.id::text,1,6)
  ) || CASE WHEN row_number() OVER (PARTITION BY lower(regexp_replace(coalesce(p.full_name, split_part(p.email,'@',1)), '[^a-z0-9]+', '', 'g')) ORDER BY p.created_at) > 1
    THEN row_number() OVER (PARTITION BY lower(regexp_replace(coalesce(p.full_name, split_part(p.email,'@',1)), '[^a-z0-9]+', '', 'g')) ORDER BY p.created_at)::text
    ELSE '' END
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.hub_profiles hp WHERE hp.id = p.id)
ON CONFLICT (id) DO NOTHING;