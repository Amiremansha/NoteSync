alter table public.notes
add column if not exists reminder_at timestamptz;
