import { describe, expect, it } from 'vitest';
import {
  countPhotosByCategory,
  parsePhotoEvidenceCategory,
  serializePhotoEvidenceCategory,
  stripPhotoEvidenceCategory,
} from '@/lib/photoEvidenceBuckets';

describe('photoEvidenceBuckets', () => {
  it('serializes and parses a typed photo category in notes', () => {
    const notes = serializePhotoEvidenceCategory('flow_no_flow', 'Dry channel at lip');
    expect(parsePhotoEvidenceCategory(notes)).toBe('flow_no_flow');
    expect(stripPhotoEvidenceCategory(notes)).toBe('Dry channel at lip');
  });

  it('counts photos by category without counting non-photo assets', () => {
    const counts = countPhotosByCategory([
      { evidence_type: 'photo', notes: serializePhotoEvidenceCategory('outlet_signage') },
      { evidence_type: 'photo', notes: serializePhotoEvidenceCategory('outlet_signage') },
      { evidence_type: 'photo', notes: serializePhotoEvidenceCategory('sample_containers') },
      { evidence_type: 'document', notes: serializePhotoEvidenceCategory('flow_no_flow') },
    ]);

    expect(counts.outlet_signage).toBe(2);
    expect(counts.sample_containers).toBe(1);
    expect(counts.flow_no_flow).toBe(0);
  });
});
