create table public.rfqs (
  id uuid primary key default gen_random_uuid(),
  order_id text not null,
  status text not null default 'open',
  deadline_at timestamptz not null,
  invited_suppliers text[] not null default '{}',
  dominant_category text,
  winner_supplier text,
  winner_total_eur numeric,
  decided_at timestamptz,
  escalation_reason text,
  order_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rfqs_order_id_idx on public.rfqs(order_id);
create index rfqs_status_idx on public.rfqs(status);

alter table public.rfqs enable row level security;

create policy "rfqs readable by everyone" on public.rfqs for select using (true);
create policy "rfqs writable by anyone" on public.rfqs for insert with check (true);
create policy "rfqs updatable by anyone" on public.rfqs for update using (true) with check (true);

create trigger rfqs_set_updated_at before update on public.rfqs
  for each row execute function public.set_updated_at();

create table public.rfq_quotes (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  negotiation_id uuid,
  supplier_name text not null,
  supplier_email text,
  unit_price_eur numeric,
  line_total_eur numeric,
  shipping_cost_eur numeric,
  total_eur numeric,
  lead_time_days int,
  status text not null default 'pending',
  raw_reply_excerpt text,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(rfq_id, supplier_name)
);

create index rfq_quotes_rfq_id_idx on public.rfq_quotes(rfq_id);
create index rfq_quotes_negotiation_id_idx on public.rfq_quotes(negotiation_id);

alter table public.rfq_quotes enable row level security;

create policy "rfq_quotes readable by everyone" on public.rfq_quotes for select using (true);
create policy "rfq_quotes writable by anyone" on public.rfq_quotes for insert with check (true);
create policy "rfq_quotes updatable by anyone" on public.rfq_quotes for update using (true) with check (true);

create trigger rfq_quotes_set_updated_at before update on public.rfq_quotes
  for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.rfqs;
alter publication supabase_realtime add table public.rfq_quotes;