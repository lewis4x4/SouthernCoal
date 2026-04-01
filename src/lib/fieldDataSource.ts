/**
 * How the current field visit detail was hydrated (Lane A M2 — cache vs live honesty).
 * Set only from `loadVisitDetails` in useFieldOps.
 */
export type FieldVisitDetailLoadSource =
  | 'live'
  | 'device_visit_cache'
  | 'device_route_shell';
