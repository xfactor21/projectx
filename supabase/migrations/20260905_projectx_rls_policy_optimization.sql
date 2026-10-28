-- project.X v3.0 release database polish: avoid per-row auth.uid() re-evaluation in RLS policies.

-- Projects
drop policy if exists "projectx_projects_select_own" on public.projectx_projects;
create policy "projectx_projects_select_own" on public.projectx_projects for select using ((select auth.uid()) = user_id);
drop policy if exists "projectx_projects_insert_own" on public.projectx_projects;
create policy "projectx_projects_insert_own" on public.projectx_projects for insert with check ((select auth.uid()) = user_id);
drop policy if exists "projectx_projects_update_own" on public.projectx_projects;
create policy "projectx_projects_update_own" on public.projectx_projects for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "projectx_projects_delete_own" on public.projectx_projects;
create policy "projectx_projects_delete_own" on public.projectx_projects for delete using ((select auth.uid()) = user_id);

-- Activity
drop policy if exists "projectx_activity_select_own" on public.projectx_activity;
create policy "projectx_activity_select_own" on public.projectx_activity for select using ((select auth.uid()) = user_id);
drop policy if exists "projectx_activity_insert_own" on public.projectx_activity;
create policy "projectx_activity_insert_own" on public.projectx_activity for insert with check ((select auth.uid()) = user_id);

-- Devices
drop policy if exists "projectx_devices_select_own" on public.projectx_devices;
create policy "projectx_devices_select_own" on public.projectx_devices for select using ((select auth.uid()) = user_id);
drop policy if exists "projectx_devices_insert_own" on public.projectx_devices;
create policy "projectx_devices_insert_own" on public.projectx_devices for insert with check ((select auth.uid()) = user_id);
drop policy if exists "projectx_devices_update_own" on public.projectx_devices;
create policy "projectx_devices_update_own" on public.projectx_devices for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "projectx_devices_delete_own" on public.projectx_devices;
create policy "projectx_devices_delete_own" on public.projectx_devices for delete using ((select auth.uid()) = user_id);

-- Remote actions
drop policy if exists "projectx_remote_actions_select_own" on public.projectx_remote_actions;
create policy "projectx_remote_actions_select_own" on public.projectx_remote_actions for select using ((select auth.uid()) = user_id);
drop policy if exists "projectx_remote_actions_insert_own" on public.projectx_remote_actions;
create policy "projectx_remote_actions_insert_own" on public.projectx_remote_actions for insert with check ((select auth.uid()) = user_id);
drop policy if exists "projectx_remote_actions_update_own" on public.projectx_remote_actions;
create policy "projectx_remote_actions_update_own" on public.projectx_remote_actions for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "projectx_remote_actions_delete_own" on public.projectx_remote_actions;
create policy "projectx_remote_actions_delete_own" on public.projectx_remote_actions for delete using ((select auth.uid()) = user_id);

-- Provider links
drop policy if exists "provider_links_select_own" on public.projectx_provider_links;
create policy "provider_links_select_own" on public.projectx_provider_links for select using ((select auth.uid()) = user_id);
drop policy if exists "provider_links_insert_own" on public.projectx_provider_links;
create policy "provider_links_insert_own" on public.projectx_provider_links for insert with check ((select auth.uid()) = user_id);
drop policy if exists "provider_links_update_own" on public.projectx_provider_links;
create policy "provider_links_update_own" on public.projectx_provider_links for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "provider_links_delete_own" on public.projectx_provider_links;
create policy "provider_links_delete_own" on public.projectx_provider_links for delete using ((select auth.uid()) = user_id);
