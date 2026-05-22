
-- Auto-rejection / failover support
ALTER TABLE public.negotiations
  ADD COLUMN IF NOT EXISTS reject_reason text,
  ADD COLUMN IF NOT EXISTS failover_of uuid,
  ADD COLUMN IF NOT EXISTS failover_attempt int NOT NULL DEFAULT 0;

ALTER TABLE public.rfqs
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS failover_history jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.rfq_quotes
  ADD COLUMN IF NOT EXISTS reject_reason text;
