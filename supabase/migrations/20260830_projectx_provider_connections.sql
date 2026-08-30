-- Per-user provider connections. Tokens are encrypted by the project.X API before storage.
create table if not exists public.projectx_provider_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('github','vercel')),
  account_id text not null,
  account_name text,
  team_id text,
  configuration_id text,
  encrypted_access_token text not null,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, account_id)
);

alter table public.projectx_provider_connections enable row level security;
-- No client policies are intentional: only server-side service-role requests may read token rows.

create table if not exists public.projectx_provider_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_client_id text not null,
  provider text not null,
  provider_project_id text not null,
  provider_project_name text not null,
  production_url text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_client_id, provider)
);

alter table public.projectx_provider_links enable row level security;
create policy "provider_links_select_own" on public.projectx_provider_links for select using (auth.uid() = user_id);
create policy "provider_links_insert_own" on public.projectx_provider_links for insert with check (auth.uid() = user_id);
create policy "provider_links_update_own" on public.projectx_provider_links for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "provider_links_delete_own" on public.projectx_provider_links for delete using (auth.uid() = user_id);
