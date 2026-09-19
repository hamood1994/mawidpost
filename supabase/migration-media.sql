-- Adds post types (post / story / reel) and media uploads.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

alter table posts add column if not exists post_type text not null default 'post'
  check (post_type in ('post', 'story', 'reel'));
alter table posts add column if not exists media_urls text[] not null default '{}';

-- Public bucket: Instagram/Facebook must be able to download the file from a public URL when publishing.
-- Files are stored under <org_id>/<filename>; only members of that org can upload or delete.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 104857600)
on conflict (id) do nothing;

create policy "org members upload media" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and is_member(((storage.foldername(name))[1])::uuid));
create policy "org members delete media" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and is_member(((storage.foldername(name))[1])::uuid));
create policy "public read media" on storage.objects for select to public
  using (bucket_id = 'media');
