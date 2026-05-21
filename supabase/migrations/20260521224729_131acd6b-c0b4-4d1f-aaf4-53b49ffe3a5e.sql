ALTER TABLE public.negotiations
  ADD COLUMN IF NOT EXISTS thread_messages jsonb NOT NULL DEFAULT '[]'::jsonb;