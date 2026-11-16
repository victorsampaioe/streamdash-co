ALTER TABLE public.acquisition_page_events
ADD COLUMN IF NOT EXISTS is_qa boolean NOT NULL DEFAULT false;
ALTER TABLE public.acquisition_page_events
ADD COLUMN IF NOT EXISTS qa_reason text;
-- The six IDs below are known browser-rendering test visits generated
-- during this deployment; preserve them for audit, exclude from business KPIs.
UPDATE public.acquisition_page_events
SET is_qa=true,qa_reason='Automated Cloudflare Browser Run consent QA 2026-11-16'
WHERE id IN ('8d9d8ef4-e1ed-4be0-aaed-dbebd6e49b0c','5d83245d-5ff7-403f-850c-1aec55a7ab83','bb3aa445-0f8b-49d1-9eab-667f8d8cff86','63fa54d3-a89f-4fd5-8632-4d63487f73d2','207f7af4-a537-42ef-a4cb-2601ea71c95a','efd68180-9e72-4ede-a2ce-2bd16ae13aa4') AND campaign_id IS NULL AND source='direct' AND stage='signup'
  AND created_at BETWEEN '2026-11-16T13:45:00Z' AND '2026-11-16T13:58:00Z';
