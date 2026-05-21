
ALTER TABLE public.negotiations
  ADD COLUMN IF NOT EXISTS supplier_language text,
  ADD COLUMN IF NOT EXISTS last_inbound_from text,
  ADD COLUMN IF NOT EXISTS last_processed_message_id text,
  ADD COLUMN IF NOT EXISTS security_reject_reason text,
  ADD COLUMN IF NOT EXISTS followup_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clarification_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS negotiations_thread_id_idx
  ON public.negotiations (thread_id);
CREATE INDEX IF NOT EXISTS negotiations_order_id_idx
  ON public.negotiations (order_id);
CREATE INDEX IF NOT EXISTS negotiations_supplier_email_idx
  ON public.negotiations (supplier_email);
