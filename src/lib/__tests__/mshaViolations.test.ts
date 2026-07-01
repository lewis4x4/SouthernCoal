import { describe, expect, it } from 'vitest';
import {
  isWithinLookback,
  mapMshaViolationRow,
  parseMshaDate,
  parseMshaViolationLine,
  stripField,
} from '../../../supabase/functions/_shared/msha-violations.ts';

const SAMPLE_LINE =
  '1234567|01/15/2024|01/16/2024|A1000001|1234567|CONTROLLER|7654321|OPERATOR|Operator|"4601432"|MINE NAME|Surface|C||02/01/2024|02/01/2024|2024|1|2024|2|0900|Y|104(a)|303(c)|104(a)||Citation|02/05/2024|1700|02/05/2024|1700|||||||Unlikely|NoLostDays|0|LowNegligence|N|Safety|N|Primary||||500.00|500.00|0.00||||Proposed|02/02/2024||||N||1|1';

describe('msha violations parser', () => {
  it('strips quoted mine ids', () => {
    expect(stripField('"4601432"')).toBe('4601432');
  });

  it('parses mm/dd/yyyy dates', () => {
    expect(parseMshaDate('02/05/2024')).toBe('2024-02-05');
  });

  it('maps a violation row to upsert payload', () => {
    const row = parseMshaViolationLine(SAMPLE_LINE);
    expect(row).not.toBeNull();
    const mapped = mapMshaViolationRow(row!, 'org-uuid');
    expect(mapped?.mine_id).toBe('4601432');
    expect(mapped?.violation_number).toBe('A1000001');
    expect(mapped?.significant_substantial).toBe(true);
    expect(mapped?.abatement_due_date).toBe('2024-02-05');
    expect(mapped?.proposed_penalty).toBe(500);
  });

  it('filters rows outside lookback window', () => {
    expect(isWithinLookback('2024-02-01', 5)).toBe(true);
    expect(isWithinLookback('1990-01-01', 5)).toBe(false);
  });
});
