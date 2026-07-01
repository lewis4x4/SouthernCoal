import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260702200000_keystone_schema_discipline_72.sql',
);

describe('keystone schema discipline §7.2 migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('adds bitemporal columns to sampling_gap_records', () => {
    expect(sql).toContain('valid_from timestamptz');
    expect(sql).toContain('valid_to timestamptz');
    expect(sql).toContain('transaction_time timestamptz');
    expect(sql).toMatch(/ALTER TABLE sampling_gap_records[\s\S]*work_order_id uuid REFERENCES work_orders/);
  });

  it('extends work_orders source_type for sampling_gap alerts', () => {
    expect(sql).toContain("'sampling_gap'");
    expect(sql).toContain('work_orders_source_type_check');
  });

  it('opens gap and work order atomically via helper', () => {
    expect(sql).toContain('open_sampling_gap_with_work_order');
    expect(sql).toContain("'sampling_gap'");
    expect(sql).toMatch(/INSERT INTO work_orders[\s\S]*INSERT INTO sampling_gap_records/);
  });

  it('uses coupled helper in detect_sampling_calendar_gaps', () => {
    expect(sql).toContain('PERFORM open_sampling_gap_with_work_order');
    expect(sql).toContain('valid_to = now()');
  });

  it('defines penalty_exposure_lines with citation and verification_status', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS penalty_exposure_lines');
    expect(sql).toContain('citation text NOT NULL');
    expect(sql).toContain('verification_status text NOT NULL DEFAULT \'draft\'');
    expect(sql).toContain('refresh_penalty_exposure_lines');
  });

  it('returns citation on each penalty ledger source', () => {
    expect(sql).toContain("'citation', citation");
    expect(sql).toContain("'verification_status', verification_status");
  });

  it('adds bitemporal columns to edd_paragraph49_evaluations', () => {
    expect(sql).toMatch(/ALTER TABLE edd_paragraph49_evaluations[\s\S]*valid_from timestamptz/);
  });
});
