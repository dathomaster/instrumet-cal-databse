// Generated with `powersync generate schema` from powersync/sync-config.yaml,
// then extended with indexes and the local-only `upload_errors` table.
// NOTE: Postgres `numeric` and `timestamptz` columns sync as text.
import { column, Schema, Table } from '@powersync/web';

const organizations = new Table(
  {
    // id column (text) is automatically included
    name: column.text,
    created_at: column.text,
    updated_at: column.text
  },
  { indexes: {} }
);

const org_members = new Table(
  {
    // id column (text) is automatically included
    org_id: column.text,
    user_id: column.text,
    full_name: column.text,
    email: column.text,
    role: column.text,
    created_at: column.text,
    updated_at: column.text
  },
  { indexes: { user: ['user_id'], org: ['org_id'] } }
);

const customers = new Table(
  {
    // id column (text) is automatically included
    org_id: column.text,
    name: column.text,
    contact_name: column.text,
    email: column.text,
    phone: column.text,
    address_line1: column.text,
    address_line2: column.text,
    city: column.text,
    state: column.text,
    postal_code: column.text,
    country: column.text,
    notes: column.text,
    created_by: column.text,
    created_at: column.text,
    updated_at: column.text
  },
  { indexes: { org: ['org_id'], name: ['name'] } }
);

const equipment = new Table(
  {
    // id column (text) is automatically included
    org_id: column.text,
    customer_id: column.text,
    asset_tag: column.text,
    description: column.text,
    equipment_type: column.text,
    manufacturer: column.text,
    model: column.text,
    serial_number: column.text,
    location: column.text,
    range_min: column.text,
    range_max: column.text,
    units: column.text,
    calibration_interval_days: column.integer,
    last_calibrated_at: column.text,
    next_due_at: column.text,
    status: column.text,
    notes: column.text,
    created_by: column.text,
    created_at: column.text,
    updated_at: column.text
  },
  { indexes: { customer: ['customer_id'], due: ['next_due_at'] } }
);

const reference_standards = new Table(
  {
    // id column (text) is automatically included
    org_id: column.text,
    name: column.text,
    manufacturer: column.text,
    model: column.text,
    serial_number: column.text,
    asset_tag: column.text,
    certificate_number: column.text,
    calibrated_at: column.text,
    due_at: column.text,
    notes: column.text,
    created_at: column.text,
    updated_at: column.text
  },
  { indexes: { org: ['org_id'] } }
);

const calibrations = new Table(
  {
    // id column (text) is automatically included
    org_id: column.text,
    customer_id: column.text,
    equipment_id: column.text,
    technician_id: column.text,
    technician_name: column.text,
    certificate_number: column.text,
    performed_at: column.text,
    due_at: column.text,
    procedure: column.text,
    temperature_c: column.text,
    humidity_pct: column.text,
    as_found_result: column.text,
    as_left_result: column.text,
    status: column.text,
    standards_used: column.text,
    notes: column.text,
    created_at: column.text,
    updated_at: column.text
  },
  { indexes: { equipment: ['equipment_id'], customer: ['customer_id'], performed: ['performed_at'] } }
);

const calibration_points = new Table(
  {
    // id column (text) is automatically included
    org_id: column.text,
    calibration_id: column.text,
    seq: column.integer,
    parameter: column.text,
    units: column.text,
    nominal: column.text,
    tolerance_minus: column.text,
    tolerance_plus: column.text,
    as_found: column.text,
    as_left: column.text,
    as_found_result: column.text,
    as_left_result: column.text,
    notes: column.text,
    created_at: column.text,
    updated_at: column.text
  },
  { indexes: { calibration: ['calibration_id'] } }
);

// Local-only: uploads the server permanently rejected (validation / RLS).
// Shown in Settings so a technician can see and redo the change.
const upload_errors = new Table(
  {
    table_name: column.text,
    row_id: column.text,
    op: column.text,
    message: column.text,
    data: column.text,
    created_at: column.text
  },
  { localOnly: true }
);

export const AppSchema = new Schema({
  upload_errors,
  organizations,
  org_members,
  customers,
  equipment,
  reference_standards,
  calibrations,
  calibration_points
});

export type Database = (typeof AppSchema)['types'];


export type Organization = Database['organizations'];
export type OrgMember = Database['org_members'];
export type Customer = Database['customers'];
export type Equipment = Database['equipment'];
export type ReferenceStandard = Database['reference_standards'];
export type Calibration = Database['calibrations'];
export type CalibrationPoint = Database['calibration_points'];
export type UploadError = Database['upload_errors'];
