
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS name_en text,
  ADD COLUMN IF NOT EXISTS description_en text,
  ADD COLUMN IF NOT EXISTS unit_en text,
  ADD COLUMN IF NOT EXISTS keywords_en text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS use_cases_en jsonb NOT NULL DEFAULT '[]'::jsonb;
