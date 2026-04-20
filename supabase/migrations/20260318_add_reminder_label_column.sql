alter table if exists public.notes
  add column if not exists reminder_label text not null default '';
