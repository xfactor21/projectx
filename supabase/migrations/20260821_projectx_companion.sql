-- project.X companion device + remote action protocol

create table if not exists public.projectx_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  name text not null,
  platform text not null,
  app_version text not null default '',
  capabilities jsonb not null default '[]'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id, device_id)
);

create table if not exists public.projectx_remote_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_client_id text,
  target_device_id text,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','running','succeeded','failed','canceled')),
  requested_by_device_id text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projectx_devices_user_seen_idx
  on public.projectx_devices(user_id, last_seen_at desc);

create index if not exists projectx_remote_actions_user_created_idx
  on public.projectx_remote_actions(user_id, created_at desc);

create index if not exists projectx_remote_actions_target_status_idx
  on public.projectx_remote_actions(user_id, target_device_id, status, created_at asc);

alter table public.projectx_devices enable row level security;
alter table public.projectx_remote_actions enable row level security;

create policy "projectx_devices_select_own"
  on public.projectx_devices for select using (auth.uid() = user_id);
create policy "projectx_devices_insert_own"
  on public.projectx_devices for insert with check (auth.uid() = user_id);
create policy "projectx_devices_update_own"
  on public.projectx_devices for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "projectx_devices_delete_own"
  on public.projectx_devices for delete using (auth.uid() = user_id);

create policy "projectx_remote_actions_select_own"
  on public.projectx_remote_actions for select using (auth.uid() = user_id);
create policy "projectx_remote_actions_insert_own"
  on public.projectx_remote_actions for insert with check (auth.uid() = user_id);
create policy "projectx_remote_actions_update_own"
  on public.projectx_remote_actions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "projectx_remote_actions_delete_own"
  on public.projectx_remote_actions for delete using (auth.uid() = user_id);

drop trigger if exists projectx_remote_actions_touch_updated_at on public.projectx_remote_actions;
create trigger projectx_remote_actions_touch_updated_at
before update on public.projectx_remote_actions
for each row execute function public.projectx_touch_updated_at();
