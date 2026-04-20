alter table if exists public.notes
add column if not exists reminder_time text not null default '';
