-- Storage bucket for note images
insert into storage.buckets (id, name, public)
values ('note-images', 'note-images', true)
on conflict (id) do nothing;

-- Basic RLS policies for the bucket
drop policy if exists "Public read note-images" on storage.objects;
create policy "Public read note-images"
on storage.objects
for select
using (bucket_id = 'note-images');

drop policy if exists "Users upload their own note images" on storage.objects;
create policy "Users upload their own note images"
on storage.objects
for insert
with check (
  bucket_id = 'note-images'
  and auth.uid() = owner
);

drop policy if exists "Users delete their own note images" on storage.objects;
create policy "Users delete their own note images"
on storage.objects
for delete
using (
  bucket_id = 'note-images'
  and auth.uid() = owner
);

-- Add image columns to notes (idempotent)
alter table public.notes
  add column if not exists image_url text not null default '';

alter table public.notes
  add column if not exists image_path text not null default '';
