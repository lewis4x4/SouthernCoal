
-- Seed missing outfalls discovered during EDD parsing
-- WV0097446 (Keystone No. 1 Strip - Sewell) needs outfalls 007 and 009
-- WV1021095 (Mine No. 65 - Little Firecreek) needs outfall 001

-- Get permit IDs
WITH permit_ids AS (
  SELECT id, permit_number
  FROM npdes_permits
  WHERE permit_number IN ('WV0097446', 'WV1021095')
)
INSERT INTO outfalls (permit_id, outfall_number, is_active)
SELECT p.id, v.outfall_number, true
FROM permit_ids p
CROSS JOIN (VALUES 
  ('WV0097446', '007'),
  ('WV0097446', '009'),
  ('WV1021095', '001')
) AS v(permit_number, outfall_number)
WHERE p.permit_number = v.permit_number
ON CONFLICT DO NOTHING;
;
