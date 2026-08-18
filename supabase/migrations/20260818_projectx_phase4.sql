-- project.X Phase 4 cloud model
-- Apply to a dedicated Supabase project for project.X.

create extension if not exists pgcrypto;

create table if not exists public.projectx_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  name text not null,
  kicker text not null default '',
  description text not null default '',
  status text not null default 'Building' check (status in ('Live','Building','Concept','Paused')),
  stack jsonb not null default '[]'::jsonb,
  accent text not null default 'pink' check (accent in ('pink','cyan','violet')),
  progress integer not null default 0 check (progress between 0 and 100),
  favorite boolean not null default false,
  archived boolean not null default false,
  repo_url text not null default '',
  live_url text not null default '',
  cover_url text not null default '',
  notes text not null default '',
  github jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, client_id)
);

create table if not exists public.projectx_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_client_id text,
  event_type text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists projectx_projects_user_updated_idx
  on public.projectx_projects(user_id, updated_at desc);

create index if not exists projectx_activity_user_created_idx
  on public.projectx_activity(user_id, created_at desc);

alter table public.projectx_projects enable row level security;
alter table public.projectx_activity enable row level security;

create policy "projectx_projects_select_own"
  on public.projectx_projects for select
  using (auth.uid() = user_id);

create policy "projectx_projects_insert_own"
  on public.projectx_projects for insert
  with check (auth.uid() = user_id);

create policy "projectx_projects_update_own"
  on public.projectx_projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "projectx_projects_delete_own"
  on public.projectx_projects for delete
  using (auth.uid() = user_id);

create policy "projectx_activity_select_own"
  on public.projectx_activity for select
  using (auth.uid() = user_id);

create policy "projectx_activity_insert_own"
  on public.projectx_activity for insert
  with check (auth.uid() = user_id);

create or replace function public.projectx_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projectx_projects_touch_updated_at on public.projectx_projects;
create trigger projectx_projects_touch_updated_at
before update on public.projectx_projects
for each row execute function public.projectx_touch_updated_at();
