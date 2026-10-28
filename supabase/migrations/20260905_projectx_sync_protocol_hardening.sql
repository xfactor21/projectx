-- project.X v2.9 hardening: remote action state machine + project tombstones

alter table public.projectx_projects
  add column if not exists deleted_at timestamptz;

create index if not exists projectx_projects_user_deleted_updated_idx
  on public.projectx_projects(user_id, deleted_at, updated_at desc);

create or replace function public.projectx_validate_remote_action_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.project_client_id is distinct from old.project_client_id
    or new.target_device_id is distinct from old.target_device_id
    or new.action_type is distinct from old.action_type
    or new.requested_by_device_id is distinct from old.requested_by_device_id then
    raise exception 'Remote action identity fields are immutable';
  end if;

  if new.status = old.status then
    return new;
  end if;

  if old.status = 'pending' and new.status in ('approved', 'canceled') then
    return new;
  end if;

  if old.status = 'approved' and new.status in ('running', 'canceled') then
    return new;
  end if;

  if old.status = 'running' and new.status in ('succeeded', 'failed', 'canceled') then
    return new;
  end if;

  raise exception 'Invalid remote action transition: % -> %', old.status, new.status;
end;
$$;

drop trigger if exists projectx_remote_actions_validate_transition on public.projectx_remote_actions;
create trigger projectx_remote_actions_validate_transition
before update on public.projectx_remote_actions
for each row execute function public.projectx_validate_remote_action_transition();

create or replace function public.projectx_soft_delete_project(target_client_id text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.projectx_projects
     set deleted_at = now(), updated_at = now()
   where user_id = auth.uid()
     and client_id = target_client_id
     and deleted_at is null;
end;
$$;

grant execute on function public.projectx_soft_delete_project(text) to authenticated;
