-- project.X companion package handoff storage
-- Private per-user ZIP transport for mobile -> Windows create/update workflows.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'projectx-companion-packages',
  'projectx-companion-packages',
  false,
  104857600,
  array['application/zip','application/x-zip-compressed','application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;

drop policy if exists "projectx_companion_packages_select_own" on storage.objects;
create policy "projectx_companion_packages_select_own"
on storage.objects for select
using (
  bucket_id = 'projectx-companion-packages'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "projectx_companion_packages_insert_own" on storage.objects;
create policy "projectx_companion_packages_insert_own"
on storage.objects for insert
with check (
  bucket_id = 'projectx-companion-packages'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "projectx_companion_packages_update_own" on storage.objects;
create policy "projectx_companion_packages_update_own"
on storage.objects for update
using (
  bucket_id = 'projectx-companion-packages'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'projectx-companion-packages'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "projectx_companion_packages_delete_own" on storage.objects;
create policy "projectx_companion_packages_delete_own"
on storage.objects for delete
using (
  bucket_id = 'projectx-companion-packages'
  and (storage.foldername(name))[1] = auth.uid()::text
);
