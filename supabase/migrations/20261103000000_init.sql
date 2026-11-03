-- =====================================================================
-- Calibration DB — initial schema
-- Offline-first: ids are UUIDs generated on the client (PowerSync).
-- All data is scoped to an organization; every technician who is a
-- member of the organization can read and edit its data.
-- Booleans are avoided on purpose (SQLite stores them as 0/1, which
-- PostgREST will not coerce into boolean on upload) — use text enums.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- helpers ---------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- organizations & membership -------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.org_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  full_name   text,
  email       text,
  role        text not null default 'technician' check (role in ('admin','technician')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, user_id)
);
create index on public.org_members(user_id);

-- SECURITY DEFINER so RLS policies can check membership without recursion
create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members m
                 where m.org_id = p_org and m.user_id = auth.uid());
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members m
                 where m.org_id = p_org and m.user_id = auth.uid() and m.role = 'admin');
$$;

-- ---------- customers -------------------------------------------------
create table public.customers (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  name           text not null,
  contact_name   text,
  email          text,
  phone          text,
  address_line1  text,
  address_line2  text,
  city           text,
  state          text,
  postal_code    text,
  country        text,
  notes          text,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.customers(org_id);

-- ---------- customer equipment (units under test) ---------------------
create table public.equipment (
  id                         uuid primary key default gen_random_uuid(),
  org_id                     uuid not null references public.organizations(id) on delete cascade,
  customer_id                uuid not null references public.customers(id) on delete cascade,
  asset_tag                  text,
  description                text not null,
  equipment_type             text,
  manufacturer               text,
  model                      text,
  serial_number              text,
  location                   text,
  range_min                  numeric,
  range_max                  numeric,
  units                      text,
  calibration_interval_days  integer default 365,
  last_calibrated_at         timestamptz,
  next_due_at                timestamptz,
  status                     text not null default 'active' check (status in ('active','out_of_service','retired')),
  notes                      text,
  created_by                 uuid,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
create index on public.equipment(org_id);
create index on public.equipment(customer_id);

-- ---------- reference standards (your traceable test equipment) -------
create table public.reference_standards (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  name                text not null,
  manufacturer        text,
  model               text,
  serial_number       text,
  asset_tag           text,
  certificate_number  text,
  calibrated_at       timestamptz,
  due_at              timestamptz,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on public.reference_standards(org_id);

-- ---------- calibration events ---------------------------------------
create table public.calibrations (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  customer_id         uuid not null references public.customers(id) on delete cascade,
  equipment_id        uuid not null references public.equipment(id) on delete cascade,
  technician_id       uuid,
  technician_name     text,
  certificate_number  text,
  performed_at        timestamptz not null default now(),
  due_at              timestamptz,
  procedure           text,
  temperature_c       numeric,
  humidity_pct        numeric,
  as_found_result     text check (as_found_result in ('pass','fail','limited')),
  as_left_result      text check (as_left_result in ('pass','fail','limited','adjusted')),
  status              text not null default 'draft' check (status in ('draft','completed')),
  standards_used      text,   -- JSON array of reference_standards.id
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on public.calibrations(org_id);
create index on public.calibrations(equipment_id);

-- ---------- individual measurement points ----------------------------
create table public.calibration_points (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  calibration_id    uuid not null references public.calibrations(id) on delete cascade,
  seq               integer not null default 0,
  parameter         text,
  units             text,
  nominal           numeric,
  tolerance_minus   numeric,
  tolerance_plus    numeric,
  as_found          numeric,
  as_left           numeric,
  as_found_result   text check (as_found_result in ('pass','fail')),
  as_left_result    text check (as_left_result in ('pass','fail')),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on public.calibration_points(org_id);
create index on public.calibration_points(calibration_id);

-- ---------- updated_at triggers + REPLICA IDENTITY FULL ---------------
do $$
declare t text;
begin
  foreach t in array array['organizations','org_members','customers','equipment',
                           'reference_standards','calibrations','calibration_points']
  loop
    execute format('create trigger %I_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t, t);
    execute format('alter table public.%I replica identity full', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------- Row Level Security ----------------------------------------
create policy "members read org"   on public.organizations for select using (public.is_org_member(id));
create policy "admins update org"  on public.organizations for update using (public.is_org_admin(id));

create policy "members read members" on public.org_members for select using (public.is_org_member(org_id));
create policy "admins manage members" on public.org_members for all
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
create policy "members update own profile" on public.org_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['customers','equipment','reference_standards',
                           'calibrations','calibration_points']
  loop
    execute format('create policy "org members full access" on public.%I for all
                    using (public.is_org_member(org_id))
                    with check (public.is_org_member(org_id))', t);
  end loop;
end $$;

-- Prevent a technician from escalating their own role
create or replace function public.guard_member_role()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and not public.is_org_admin(old.org_id) then
    raise exception 'only admins can change roles' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger org_members_guard_role before update on public.org_members
  for each row execute function public.guard_member_role();

-- ---------- Data API grants (required for new Supabase projects) ------
grant select, update on public.organizations to authenticated;
grant select, insert, update, delete on
  public.org_members, public.customers, public.equipment,
  public.reference_standards, public.calibrations, public.calibration_points
  to authenticated;

-- ---------- Auto-join new users to the company ------------------------
-- Single-company setup: every new auth user is added to the first
-- organization. The FIRST user to sign up becomes admin.
-- IMPORTANT: turn OFF public sign-ups in Supabase (Auth > Providers > Email
-- "Allow new users to sign up") once your technicians are invited, so
-- strangers cannot join your company.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_role text := 'technician';
begin
  select id into v_org from public.organizations order by created_at limit 1;
  if v_org is null then
    insert into public.organizations(name) values ('My Calibration Company') returning id into v_org;
    v_role := 'admin';
  end if;
  insert into public.org_members(org_id, user_id, email, full_name, role)
  values (v_org, new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), v_role)
  on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- PowerSync replication -------------------------------------
-- The powersync_role (with its password) is created separately — see
-- supabase/powersync_role.sql — so the password never lands in git.
create publication powersync for table
  public.organizations, public.org_members, public.customers, public.equipment,
  public.reference_standards, public.calibrations, public.calibration_points;
