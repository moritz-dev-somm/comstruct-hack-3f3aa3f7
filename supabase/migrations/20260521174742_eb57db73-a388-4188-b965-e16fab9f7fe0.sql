
CREATE TABLE IF NOT EXISTS public.agent_settings (
  id text PRIMARY KEY DEFAULT 'singleton',
  inbox_id text,
  inbox_address text,
  webhook_id text,
  webhook_secret text,
  webhook_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_settings readable by everyone" ON public.agent_settings FOR SELECT USING (true);
CREATE POLICY "agent_settings writable by anyone" ON public.agent_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "agent_settings updatable by anyone" ON public.agent_settings FOR UPDATE USING (true) WITH CHECK (true);
CREATE TRIGGER agent_settings_set_updated_at BEFORE UPDATE ON public.agent_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.negotiations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  project text,
  supplier_name text NOT NULL,
  supplier_email text NOT NULL,
  inbox_id text NOT NULL,
  thread_id text,
  message_id text,
  subject text,
  status text NOT NULL DEFAULT 'sent',
  classification jsonb,
  reply_excerpt text,
  reply_message_id text,
  needs_user_reason text,
  order_snapshot jsonb NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  last_reply_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS negotiations_thread_id_idx ON public.negotiations(thread_id);
CREATE INDEX IF NOT EXISTS negotiations_order_id_idx ON public.negotiations(order_id);
ALTER TABLE public.negotiations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "negotiations readable by everyone" ON public.negotiations FOR SELECT USING (true);
CREATE POLICY "negotiations writable by anyone" ON public.negotiations FOR INSERT WITH CHECK (true);
CREATE POLICY "negotiations updatable by anyone" ON public.negotiations FOR UPDATE USING (true) WITH CHECK (true);
CREATE TRIGGER negotiations_set_updated_at BEFORE UPDATE ON public.negotiations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
