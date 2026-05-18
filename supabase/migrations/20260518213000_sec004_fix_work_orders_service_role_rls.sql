-- BLA-751 / SEC-004: service-role bypass was applied to PUBLIC role.
-- Root cause: "Service role full access" policies omitted TO service_role.
-- Rollback (commented):
--   Recreate policies without TO clause (NOT recommended — restores anon bypass).

BEGIN;

DROP POLICY IF EXISTS "Service role full access on work_orders" ON public.work_orders;
CREATE POLICY "Service role full access on work_orders"
  ON public.work_orders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on work_order_events" ON public.work_order_events;
CREATE POLICY "Service role full access on work_order_events"
  ON public.work_order_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Remove Sentinel anon-insert probe artifacts (service role only after policy fix).
DELETE FROM public.work_orders
WHERE title LIKE 'sentinel-anon-insert-probe%';

COMMIT;
