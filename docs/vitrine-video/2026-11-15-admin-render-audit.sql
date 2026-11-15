-- Vitrine Vídeo: additive admin-only audit / quotas, PostgreSQL source.
-- NO existing customer records, payments, credits or server tables are modified.
-- Existing Lovable Cloud database remains production source until migration approved.
CREATE TABLE IF NOT EXISTS public.vitrine_video_render_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  brand_owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  media_type text NOT NULL CHECK(media_type IN ('movie','tv')),
  tmdb_id integer NOT NULL CHECK(tmdb_id>0),
  output_format text NOT NULL CHECK(output_format IN ('portrait','story')),
  seconds smallint NOT NULL CHECK(seconds IN (15,30,60)),
  audio_requested boolean NOT NULL DEFAULT true,
  status text NOT NULL CHECK(status IN ('completed','failed')),
  bytes_out bigint CHECK(bytes_out IS NULL OR bytes_out>=0),
  error_code text CHECK(error_code IS NULL OR error_code IN(
    'ENCODING_UNSUPPORTED','INPUT_INVALID','EXPORT_ERROR','DECODE_ERROR','UNKNOWN_ERROR'
  )),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vitrine_video_render_audit_request_idx
 ON public.vitrine_video_render_audit(request_id);
CREATE INDEX IF NOT EXISTS vitrine_video_render_audit_created_idx
 ON public.vitrine_video_render_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS vitrine_video_render_audit_owner_created_idx
 ON public.vitrine_video_render_audit(brand_owner_id,created_at DESC);
ALTER TABLE public.vitrine_video_render_audit ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies. Only service_role through role-validated
-- backend functions can read and write this audit table.
REVOKE ALL ON TABLE public.vitrine_video_render_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON TABLE public.vitrine_video_render_audit TO service_role;
INSERT INTO public.app_settings(key,value,updated_at)
 VALUES ('vitrine_video_render_policy',
 '{"defaultDailyLimit":5,"overrides":{},"maxUploadMb":350,"resellerEnabled":false}'::jsonb,now())
 ON CONFLICT (key) DO NOTHING;
