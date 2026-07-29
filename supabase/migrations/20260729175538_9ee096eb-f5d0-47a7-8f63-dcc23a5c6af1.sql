-- ============ ENUMS ============
CREATE TYPE public.listing_kind AS ENUM ('offer','demand');
CREATE TYPE public.listing_category AS ENUM (
  'credits','panel','dedicated','vps','hosting','cdn','proxy','domain','cloudflare',
  'service_setup','service_install','service_migration','service_dns','service_dev',
  'service_bot','service_site','service_landing','service_app',
  'partnership','help','other'
);
CREATE TYPE public.listing_status AS ENUM ('active','paused','closed','removed');
CREATE TYPE public.hub_verification_status AS ENUM ('none','pending','approved','rejected');
CREATE TYPE public.hub_report_reason AS ENUM ('spam','scam','contact_leak','offensive','other');
CREATE TYPE public.hub_report_target AS ENUM ('listing','user','message');

-- ============ hub_profiles ============
CREATE TABLE public.hub_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle text UNIQUE,
  bio text,
  location text,
  verification_status public.hub_verification_status NOT NULL DEFAULT 'none',
  verified_at timestamptz,
  verification_doc_path text,
  business_count integer NOT NULL DEFAULT 0,
  rating_avg numeric(3,2) NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  banned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.hub_profiles TO authenticated;
GRANT ALL ON public.hub_profiles TO service_role;
ALTER TABLE public.hub_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hub_profiles: authenticated read all"
  ON public.hub_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "hub_profiles: insert self"
  ON public.hub_profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "hub_profiles: update self"
  ON public.hub_profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "hub_profiles: admin manages"
  ON public.hub_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ listings ============
CREATE TABLE public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.listing_kind NOT NULL,
  category public.listing_category NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  price_cents integer,
  currency text NOT NULL DEFAULT 'BRL',
  location text,
  status public.listing_status NOT NULL DEFAULT 'active',
  flagged boolean NOT NULL DEFAULT false,
  highlight boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listings_status_category_created_idx
  ON public.listings(status, category, created_at DESC);
CREATE INDEX listings_author_idx ON public.listings(author_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.listings TO authenticated;
GRANT ALL ON public.listings TO service_role;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listings: authenticated read active"
  ON public.listings FOR SELECT TO authenticated
  USING (status <> 'removed' OR author_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "listings: owner insert (active sub)"
  ON public.listings FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.subscription_is_active(auth.uid()));
CREATE POLICY "listings: owner update"
  ON public.listings FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "listings: owner delete"
  ON public.listings FOR DELETE TO authenticated
  USING (author_id = auth.uid());
CREATE POLICY "listings: admin manages"
  ON public.listings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ conversations ============
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at timestamptz,
  buyer_read_at timestamptz,
  seller_read_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_distinct_participants CHECK (buyer_id <> seller_id)
);
CREATE UNIQUE INDEX conversations_listing_pair_uniq
  ON public.conversations(listing_id, buyer_id, seller_id) NULLS NOT DISTINCT;
CREATE INDEX conversations_buyer_idx ON public.conversations(buyer_id, last_message_at DESC);
CREATE INDEX conversations_seller_idx ON public.conversations(seller_id, last_message_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations: participants read"
  ON public.conversations FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "conversations: buyer insert"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (buyer_id = auth.uid() AND public.subscription_is_active(auth.uid()));
CREATE POLICY "conversations: participants update"
  ON public.conversations FOR UPDATE TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid())
  WITH CHECK (buyer_id = auth.uid() OR seller_id = auth.uid());
CREATE POLICY "conversations: admin manages"
  ON public.conversations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ messages ============
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  attachments jsonb,
  flagged boolean NOT NULL DEFAULT false,
  contact_shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conv_created_idx ON public.messages(conversation_id, created_at);

GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages: participants read"
  ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  ));
CREATE POLICY "messages: participants insert"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.subscription_is_active(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );
CREATE POLICY "messages: admin manages"
  ON public.messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ ratings ============
CREATE TABLE public.ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  rater_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ratee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stars smallint NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, rater_id),
  CONSTRAINT ratings_stars_range CHECK (stars BETWEEN 1 AND 5),
  CONSTRAINT ratings_distinct CHECK (rater_id <> ratee_id)
);
CREATE INDEX ratings_ratee_idx ON public.ratings(ratee_id);

GRANT SELECT, INSERT ON public.ratings TO authenticated;
GRANT ALL ON public.ratings TO service_role;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ratings: authenticated read"
  ON public.ratings FOR SELECT TO authenticated USING (true);
CREATE POLICY "ratings: participants insert"
  ON public.ratings FOR INSERT TO authenticated
  WITH CHECK (
    rater_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = ratings.conversation_id
        AND ((c.buyer_id = auth.uid() AND c.seller_id = ratings.ratee_id)
          OR (c.seller_id = auth.uid() AND c.buyer_id = ratings.ratee_id))
    )
  );
CREATE POLICY "ratings: admin manages"
  ON public.ratings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ reports ============
CREATE TABLE public.hub_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_kind public.hub_report_target NOT NULL,
  target_id uuid NOT NULL,
  reason public.hub_report_reason NOT NULL,
  detail text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hub_reports_open_idx ON public.hub_reports(created_at DESC) WHERE resolved_at IS NULL;

GRANT SELECT, INSERT ON public.hub_reports TO authenticated;
GRANT ALL ON public.hub_reports TO service_role;
ALTER TABLE public.hub_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hub_reports: reporter reads own"
  ON public.hub_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "hub_reports: authenticated insert"
  ON public.hub_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "hub_reports: admin manages"
  ON public.hub_reports FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ updated_at triggers ============
CREATE TRIGGER hub_profiles_touch BEFORE UPDATE ON public.hub_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER listings_touch BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER conversations_touch BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============ Realtime ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;