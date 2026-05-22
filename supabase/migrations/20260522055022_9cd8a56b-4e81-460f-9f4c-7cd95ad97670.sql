
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS import_batch_id uuid NULL,
  ADD COLUMN IF NOT EXISTS import_source_filename text NULL;

CREATE INDEX IF NOT EXISTS products_import_batch_id_idx
  ON public.products (import_batch_id);

CREATE TABLE IF NOT EXISTS public.product_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  mime_type text,
  row_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_imports readable by everyone"
  ON public.product_imports FOR SELECT
  USING (true);

CREATE POLICY "product_imports writable by anyone"
  ON public.product_imports FOR INSERT
  WITH CHECK (true);

CREATE POLICY "product_imports updatable by anyone"
  ON public.product_imports FOR UPDATE
  USING (true) WITH CHECK (true);

CREATE POLICY "product_imports deletable by anyone"
  ON public.product_imports FOR DELETE
  USING (true);

CREATE TRIGGER product_imports_set_updated_at
  BEFORE UPDATE ON public.product_imports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
