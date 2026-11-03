-- Fixes from Supabase security/performance advisors

-- function_search_path_mutable
alter function private.set_updated_at() set search_path = '';
alter function private.guard_member_update() set search_path = public;

-- unindexed_foreign_keys
create index if not exists calibrations_customer_id_idx on public.calibrations(customer_id);

-- multiple_permissive_policies on org_members: one policy per action
drop policy "members read members"       on public.org_members;
drop policy "admins manage members"      on public.org_members;
drop policy "members update own profile" on public.org_members;

create policy "members read members" on public.org_members for select to authenticated
  using (private.is_org_member(org_id));
create policy "admins add members" on public.org_members for insert to authenticated
  with check (private.is_org_admin(org_id));
create policy "admins or self update member" on public.org_members for update to authenticated
  using      (user_id = (select auth.uid()) or private.is_org_admin(org_id))
  with check (user_id = (select auth.uid()) or private.is_org_admin(org_id));
create policy "admins remove members" on public.org_members for delete to authenticated
  using (private.is_org_admin(org_id));
