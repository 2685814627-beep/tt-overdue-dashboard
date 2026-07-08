create table if not exists public.dashboard_snapshots (
  id text primary key,
  report_date date not null,
  file_name text,
  published_at timestamptz not null default now(),
  payload jsonb not null,
  summary jsonb not null default '{}'::jsonb
);

create index if not exists dashboard_snapshots_report_date_idx
  on public.dashboard_snapshots (report_date desc);

alter table public.dashboard_snapshots enable row level security;
