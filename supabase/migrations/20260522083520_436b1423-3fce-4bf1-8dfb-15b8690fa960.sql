ALTER TABLE public.negotiations
  ADD COLUMN IF NOT EXISTS delivery_date_iso date,
  ADD COLUMN IF NOT EXISTS delivery_date_iso_end date,
  ADD COLUMN IF NOT EXISTS delivery_date_confidence text,
  ADD COLUMN IF NOT EXISTS delivery_date_raw text,
  ADD COLUMN IF NOT EXISTS delivery_date_needs_clarification boolean NOT NULL DEFAULT false;