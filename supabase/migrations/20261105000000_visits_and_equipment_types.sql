-- =====================================================================
-- Visit-based workflow
--   customer -> visit -> calibrations (one per equipment) -> run readings
-- Equipment has three types: load_cell, extensometer, crosshead.
-- Existing test records are removed (approved by the operator).
-- =====================================================================

-- ---------- remove test data (cascades to equipment / calibrations / points)
delete from public.customers;

-- ---------- customers: specific location, defaults to "Test Lab"
alter table public.customers add column if not exists location text not null default 'Test Lab';

-- ---------- visits ------------------------------------------------------
create table public.visits (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  customer_id      uuid not null references public.customers(id) on delete cascade,
  visit_date       date not null default current_date,
  location         text,          -- copied from the customer, editable per visit
  technician_id    uuid,
  technician_name  text,
  notes            text,          -- service report: maintenance performed / concerns
  status           text not null default 'open' check (status in ('open','completed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index visits_org_id_idx on public.visits(org_id);
create index visits_customer_id_idx on public.visits(customer_id);

create trigger visits_updated_at before update on public.visits
  for each row execute function private.set_updated_at();
alter table public.visits replica identity full;
alter table public.visits enable row level security;
create policy "org members full access" on public.visits for all to authenticated
  using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
grant select, insert, update, delete on public.visits to authenticated;

-- ---------- equipment: three types with their own fields ------------------
alter table public.equipment
  drop column if exists range_min,
  drop column if exists range_max,
  alter column description drop not null,
  add column capacity           numeric,   -- load cell
  add column indicator_model    text,      -- crosshead: indicating device
  add column indicator_serial   text,
  add column gauge_length       numeric,   -- extensometer
  add column gauge_length_units text,
  add column test_frame_id      uuid references public.equipment(id) on delete set null; -- load cell -> crosshead
alter table public.equipment alter column equipment_type set not null;
alter table public.equipment add constraint equipment_type_check
  check (equipment_type in ('load_cell','extensometer','crosshead'));
create index equipment_test_frame_id_idx on public.equipment(test_frame_id);
comment on column public.equipment.model is 'Device model (load cell / extensometer) or machine model (crosshead)';
comment on column public.equipment.serial_number is 'Device SN (load cell / extensometer) or machine SN (crosshead)';
comment on column public.equipment.units is 'Load cell capacity units';

-- ---------- calibrations: belong to a visit; options; % tolerance; result --
alter table public.calibrations
  drop column if exists as_found_result,
  drop column if exists as_left_result,
  add column visit_id      uuid not null references public.visits(id) on delete cascade,
  add column config        text,                       -- JSON: modes / tests / directions / units
  add column tolerance_pct numeric not null default 1.0, -- pass if |% error| <= tolerance
  add column result        text check (result in ('pass','fail'));
create index calibrations_visit_id_idx on public.calibrations(visit_id);

-- ---------- readings: one row per sheet line, two runs --------------------
alter table public.calibration_points
  drop column if exists parameter,
  drop column if exists units,
  drop column if exists tolerance_minus,
  drop column if exists tolerance_plus,
  drop column if exists as_found,
  drop column if exists as_left,
  drop column if exists as_found_result,
  drop column if exists as_left_result,
  add column section        text not null default 'main', -- e.g. tension, compression, speed_up, displacement_down
  add column run1           numeric,  -- indicated value / actual displacement
  add column run2           numeric,
  add column run1_time      numeric,  -- crosshead speed: seconds
  add column run1_distance  numeric,  -- crosshead speed: distance travelled
  add column run2_time      numeric,
  add column run2_distance  numeric;
comment on column public.calibration_points.nominal is 'Applied value (load / displacement) or target speed';

-- ---------- PowerSync replication -------------------------------------
alter publication powersync add table public.visits;
