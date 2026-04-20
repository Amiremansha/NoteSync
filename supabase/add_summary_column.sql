alter table public.notes
add column if not exists summary text not null default '';
