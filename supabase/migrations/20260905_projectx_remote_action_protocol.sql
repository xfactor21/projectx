-- project.X remote-action protocol hardening
-- Enforces valid state transitions and device-role separation through RPCs.

create or replace function public.projectx_approve_remote_action(
  p_action_id uuid,
  p_requesting_device_id text
) returns setof public.projectx_remote_actions
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.projectx_remote_actions
     set status = 'approved'
   where id = p_action_id
     and user_id = auth.uid()
     and status = 'pending'
     and requested_by_device_id = p_requesting_device_id
  returning *;
end;
$$;

create or replace function public.projectx_start_remote_action(
  p_action_id uuid,
  p_target_device_id text,
  p_result jsonb default null
) returns setof public.projectx_remote_actions
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.projectx_remote_actions
     set status = 'running',
         result = coalesce(p_result, result)
   where id = p_action_id
     and user_id = auth.uid()
     and status = 'approved'
     and target_device_id = p_target_device_id
  returning *;
end;
$$;

create or replace function public.projectx_finish_remote_action(
  p_action_id uuid,
  p_target_device_id text,
  p_status text,
  p_result jsonb default null
) returns setof public.projectx_remote_actions
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('succeeded', 'failed', 'canceled') then
    raise exception 'invalid terminal remote-action status';
  end if;

  return query
  update public.projectx_remote_actions
     set status = p_status,
         result = coalesce(p_result, result)
   where id = p_action_id
     and user_id = auth.uid()
     and status = 'running'
     and target_device_id = p_target_device_id
  returning *;
end;
$$;

revoke all on function public.projectx_approve_remote_action(uuid, text) from public;
revoke all on function public.projectx_start_remote_action(uuid, text, jsonb) from public;
revoke all on function public.projectx_finish_remote_action(uuid, text, text, jsonb) from public;
grant execute on function public.projectx_approve_remote_action(uuid, text) to authenticated;
grant execute on function public.projectx_start_remote_action(uuid, text, jsonb) to authenticated;
grant execute on function public.projectx_finish_remote_action(uuid, text, text, jsonb) to authenticated;

drop policy if exists "projectx_remote_actions_update_own" on public.projectx_remote_actions;

create or replace function public.projectx_remote_action_immutable_fields()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.project_client_id is distinct from old.project_client_id
     or new.target_device_id is distinct from old.target_device_id
     or new.action_type is distinct from old.action_type
     or new.payload is distinct from old.payload
     or new.requested_by_device_id is distinct from old.requested_by_device_id then
    raise exception 'remote action routing fields are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists projectx_remote_action_immutable_fields on public.projectx_remote_actions;
create trigger projectx_remote_action_immutable_fields
before update on public.projectx_remote_actions
for each row execute function public.projectx_remote_action_immutable_fields();
