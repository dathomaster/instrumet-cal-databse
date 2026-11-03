-- Admin tools: reset a member's password; never lose the last admin.

-- Admin sets a temporary password for a member of their own company.
-- SECURITY DEFINER is required to write auth.users; the body checks that the
-- caller (auth.uid()) is an admin of the target member's company.
create or replace function public.admin_set_member_password(p_member_id uuid, p_password text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_org uuid;
begin
  select user_id, org_id into v_user, v_org from public.org_members where id = p_member_id;
  if v_user is null then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
  if not private.is_org_admin(v_org) then
    raise exception 'only admins can reset passwords' using errcode = '42501';
  end if;
  if p_password is null or length(p_password) < 8 then
    raise exception 'password must be at least 8 characters' using errcode = '22023';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = v_user;
end $$;
revoke all on function public.admin_set_member_password(uuid, text) from public, anon;
grant execute on function public.admin_set_member_password(uuid, text) to authenticated;

-- A company must always keep at least one admin (blocks removing or
-- demoting the last one). Skipped when the whole company is being deleted.
create or replace function private.guard_last_admin()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role is distinct from 'admin')
     and exists (select 1 from public.organizations where id = old.org_id)
     and not exists (select 1 from public.org_members
                     where org_id = old.org_id and role = 'admin' and id <> old.id) then
    raise exception 'a company needs at least one admin' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;
create trigger org_members_guard_last_admin
  before update or delete on public.org_members
  for each row execute function private.guard_last_admin();
