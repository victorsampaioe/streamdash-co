ALTER TABLE public.payments ALTER COLUMN plan TYPE text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS store_product_id uuid REFERENCES public.store_products(id);
