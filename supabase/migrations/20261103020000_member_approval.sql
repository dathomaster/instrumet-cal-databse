-- Admin approval for new technicians (replaces email-link confirmation).
-- New sign-ups join as 'pending' and can see/do nothing until an admin
-- approves them. The first user of an empty project still becomes admin.

alter table public.org_members drop constraint org_members_role_check;
alter table public.org_members add constraint org_members_role_check
  check (role in ('admin', 'technician', 'pending'));

-- Pending members are not members for access purposes.
create or replace function private.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members m
                 where m.org_id = p_org and m.user_id = auth.uid() and m.role <> 'pending');
$$;

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_role text := 'pending';
begin
  select id into v_org from public.organizations order by created_at limit 1;
  if v_org is null then
    insert into public.organizations(name) values ('My Calibration Company') returning id into v_org;
    v_role := 'admin';
  end if;
  insert into public.org_members(org_id, user_id, email, full_name, role)
  values (v_org, new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), v_role)  -- metadata used for display name only, never authz
  on conflict do nothing;
  return new;
end $$;
revoke execute on function private.handle_new_user() from public, anon, authenticated;
