create extension if not exists pgcrypto;

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  content text not null default '',
  summary text not null default '',
  image_url text not null default '',
  image_path text not null default '',
  reminder_at timestamptz,
  reminder_time text not null default '',
  reminder_label text not null default '',
  google_event_id text,
  google_event_html_link text not null default '',
  google_sync_status text not null default 'idle',
  google_sync_error text not null default '',
  google_synced_at timestamptz,
  last_push_sent_for_reminder_at timestamptz,
  archived boolean not null default false,
  tag_color text not null default '',
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists notes_user_id_updated_at_idx
on public.notes (user_id, updated_at desc);

create index if not exists notes_user_id_archived_updated_at_idx
on public.notes (user_id, archived, updated_at desc);

create index if not exists notes_user_id_tag_color_idx
on public.notes (user_id, tag_color);

create index if not exists notes_user_id_reminder_at_idx
on public.notes (user_id, reminder_at);

create or replace function public.handle_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists set_notes_updated_at on public.notes;

create trigger set_notes_updated_at
before update on public.notes
for each row
execute function public.handle_notes_updated_at();

create table if not exists public.google_calendar_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  google_email text not null default '',
  google_display_name text not null default '',
  access_token_encrypted text not null default '',
  refresh_token_encrypted text not null default '',
  token_expires_at timestamptz,
  channel_id text,
  resource_id text,
  sync_token text,
  channel_expires_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create or replace function public.handle_google_calendar_connections_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists set_google_calendar_connections_updated_at on public.google_calendar_connections;

create trigger set_google_calendar_connections_updated_at
before update on public.google_calendar_connections
for each row
execute function public.handle_google_calendar_connections_updated_at();

-- Deprecated: private.google_oauth_states (left here for backward compatibility)
create table if not exists private.google_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  app_url text not null,
  redirect_path text not null default '/home',
  created_at timestamptz not null default timezone('utc'::text, now()),
  expires_at timestamptz not null
);

create index if not exists google_oauth_states_user_id_idx
on private.google_oauth_states (user_id);

alter table public.notes enable row level security;

drop policy if exists "Users can view their own notes" on public.notes;
create policy "Users can view their own notes"
on public.notes
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own notes" on public.notes;
create policy "Users can insert their own notes"
on public.notes
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own notes" on public.notes;
create policy "Users can update their own notes"
on public.notes
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own notes" on public.notes;
create policy "Users can delete their own notes"
on public.notes
for delete
using (auth.uid() = user_id);

do $$
begin
  alter publication supabase_realtime add table public.notes;
exception
  when duplicate_object then null;
end;
$$;

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

revoke all on all tables in schema private from public;
revoke all on all tables in schema private from anon;
revoke all on all tables in schema private from authenticated;
grant all on all tables in schema private to service_role;

create table if not exists public.user_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (user_id, endpoint)
);

create index if not exists user_push_subscriptions_user_id_idx
on public.user_push_subscriptions (user_id);

create or replace function public.handle_user_push_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists set_user_push_subscriptions_updated_at on public.user_push_subscriptions;

create trigger set_user_push_subscriptions_updated_at
before update on public.user_push_subscriptions
for each row
execute function public.handle_user_push_subscriptions_updated_at();

alter table public.user_push_subscriptions enable row level security;

drop policy if exists "Users can view their own push subscriptions" on public.user_push_subscriptions;
create policy "Users can view their own push subscriptions"
on public.user_push_subscriptions
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own push subscriptions" on public.user_push_subscriptions;
create policy "Users can insert their own push subscriptions"
on public.user_push_subscriptions
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own push subscriptions" on public.user_push_subscriptions;
create policy "Users can update their own push subscriptions"
on public.user_push_subscriptions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own push subscriptions" on public.user_push_subscriptions;
create policy "Users can delete their own push subscriptions"
on public.user_push_subscriptions
for delete
using (auth.uid() = user_id);
