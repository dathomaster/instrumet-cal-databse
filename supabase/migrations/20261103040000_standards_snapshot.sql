-- Traceability: when a calibration is completed, store a snapshot of the
-- reference standards used (name, serial, certificate no., due date) so the
-- certificate keeps showing them as they were, even if a standard is later
-- recalibrated, edited or deleted.
alter table public.calibrations add column if not exists standards_snapshot text; -- JSON array
