alter table if exists public.google_calendar_connections
  add column if not exists channel_id text,
  add column if not exists resource_id text,
  add column if not exists sync_token text,
  add column if not exists channel_expires_at timestamptz;

create index if not exists google_calendar_connections_channel_id_idx
  on public.google_calendar_connections (channel_id);
