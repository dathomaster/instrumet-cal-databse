// Generated with `powersync generate schema` from powersync/sync-config.yaml,
// then extended with indexes and the local-only `upload_errors` table.
// NOTE: Postgres `numeric`, `date` and `timestamptz` columns sync as text.
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
    org_id: column.text,
    name: column.text, // company name
    contact_name: column.text,
    email: column.text,
    phone: column.text,
    address_line1: column.text, // street
    address_line2: column.text,
    city: column.text,
    state: column.text,
    postal_code: column.text, // zip
    country: column.text,
    location: column.text, // specific location, defaults to "Test Lab"
    notes: column.text,
    created_by: column.text,
    created_at: column.text,
    updated_at: column.text
  },
  { indexes: { org: ['org_id'], name: ['name'] } }
);

const visits = new Table(
  {
    org_id: column.text,
    customer_id: column.text,
    visit_date: column.text,
    location: column.text,
    technician_id: column.text,
    technician_name: column.text,
    notes: column.text, // service report: maintenance / concerns
    status: column.text, // open | completed
    created_at: column.text,
    updated_at: column.text
  },
  { indexes: { customer: ['customer_id'], date: ['visit_date'] } }
);

const equipment = new Table(
  {
    org_id: column.text,
    customer_id: column.text,
    equipment_type: column.text, // load_cell | extensometer | crosshead
    model: column.text, // device model, or machine model for a crosshead
    serial_number: column.text, // device SN, or machine SN for a crosshead
    capacity: column.text, // load cell
    units: column.text, // load cell capacity units
    test_frame_id: column.text, // load cell -> crosshead it is mounted on
    indicator_model: column.text, // crosshead indicating device
    indicator_serial: column.text,
    gauge_length: column.text, // extensometer
    gauge_length_units: column.text,
    description: column.text,
    asset_tag: column.text,
    manufacturer: column.text,
    location: column.text,
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
    org_id: column.text,
    customer_id: column.text,
    equipment_id: column.text,
    visit_id: column.text,
    config: column.text, // JSON, see lib/sheets.ts
    tolerance_pct: column.text,
    result: column.text, // pass | fail
    technician_id: column.text,
    technician_name: column.text,
    certificate_number: column.text,
    performed_at: column.text,
    due_at: column.text,
    procedure: column.text,
    temperature_c: column.text,
    humidity_pct: column.text,
    status: column.text, // draft | completed
    standards_used: column.text,
    standards_snapshot: column.text,
    notes: column.text,
    created_at: column.text,
    updated_at: column.text
  },
  { indexes: { equipment: ['equipment_id'], visit: ['visit_id'], customer: ['customer_id'], performed: ['performed_at'] } }
);

// One sheet line: applied/target value plus two runs.
const calibration_points = new Table(
  {
    org_id: column.text,
    calibration_id: column.text,
    section: column.text, // tension | compression | main | displacement_up | speed_down ...
    seq: column.integer,
    nominal: column.text, // applied load / applied displacement / target speed
    run1: column.text, // indicated value / actual displacement
    run2: column.text,
    run1_time: column.text, // crosshead speed (seconds)
    run1_distance: column.text,
    run2_time: column.text,
    run2_distance: column.text,
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
  visits,
  equipment,
  reference_standards,
  calibrations,
  calibration_points
});

export type Database = (typeof AppSchema)['types'];

export type Organization = Database['organizations'];
export type OrgMember = Database['org_members'];
export type Customer = Database['customers'];
export type Visit = Database['visits'];
export type Equipment = Database['equipment'];
export type ReferenceStandard = Database['reference_standards'];
export type Calibration = Database['calibrations'];
export type CalibrationPoint = Database['calibration_points'];
export type UploadError = Database['upload_errors'];
