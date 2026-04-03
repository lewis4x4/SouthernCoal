
-- ============================================================
-- updated_at trigger function (reusable)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- work_orders table
-- ============================================================
CREATE TABLE public.work_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  source_type   text NOT NULL DEFAULT 'manual'
                CHECK (source_type IN ('field_deficiency','inspection','incident','exceedance','manual')),
  source_id     uuid,
  site_id       uuid REFERENCES public.sites(id),
  outfall_id    uuid REFERENCES public.outfalls(id),
  permit_id     uuid REFERENCES public.npdes_permits(id),
  title         text NOT NULL,
  description   text,
  priority      text NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('low','medium','high','critical')),
  status        text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','assigned','in_progress','completed','verified','cancelled')),
  category      text
                CHECK (category IS NULL OR category IN (
                  'equipment_repair','erosion_control','sediment_removal',
                  'outfall_maintenance','bmp_installation','signage',
                  'access_road','vegetation','structural','other'
                )),
  assigned_to   uuid REFERENCES public.user_profiles(id),
  assigned_by   uuid REFERENCES public.user_profiles(id),
  assigned_at   timestamptz,
  due_date      date,
  sla_hours     integer,
  completed_by  uuid REFERENCES public.user_profiles(id),
  completed_at  timestamptz,
  verified_by   uuid REFERENCES public.user_profiles(id),
  verified_at   timestamptz,
  before_photo_path text,
  after_photo_path  text,
  is_recurring  boolean NOT NULL DEFAULT false,
  recurrence_count integer NOT NULL DEFAULT 0,
  previous_work_order_id uuid REFERENCES public.work_orders(id),
  notes         text,
  decree_paragraphs text[],
  created_by    uuid REFERENCES public.user_profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_work_orders_org         ON public.work_orders(organization_id);
CREATE INDEX idx_work_orders_status      ON public.work_orders(status);
CREATE INDEX idx_work_orders_assigned_to ON public.work_orders(assigned_to);
CREATE INDEX idx_work_orders_due_date    ON public.work_orders(due_date);
CREATE INDEX idx_work_orders_site        ON public.work_orders(site_id);
CREATE INDEX idx_work_orders_source      ON public.work_orders(source_type, source_id);

-- updated_at trigger
CREATE TRIGGER set_work_orders_updated_at
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- work_order_events table
-- ============================================================
CREATE TABLE public.work_order_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id   uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  event_type      text NOT NULL
                  CHECK (event_type IN (
                    'created','assigned','status_changed','priority_changed',
                    'note_added','photo_uploaded','reassigned','completed',
                    'verified','cancelled','reopened','sla_warning','sla_breach'
                  )),
  old_value       text,
  new_value       text,
  notes           text,
  photo_path      text,
  created_by      uuid REFERENCES public.user_profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_work_order_events_wo ON public.work_order_events(work_order_id);

-- ============================================================
-- RLS — work_orders
-- ============================================================
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own org work orders"
  ON public.work_orders FOR SELECT
  USING (organization_id = get_user_org_id());

CREATE POLICY "Managers create work orders"
  ON public.work_orders FOR INSERT
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Users update own org work orders"
  ON public.work_orders FOR UPDATE
  USING (
    organization_id = get_user_org_id()
    AND (
      assigned_to = auth.uid()
      OR created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM user_role_assignments ura
        JOIN roles r ON r.id = ura.role_id
        WHERE ura.user_id = auth.uid()
          AND r.name IN ('site_manager','environmental_manager','admin','executive')
      )
    )
  );

CREATE POLICY "Admins delete work orders"
  ON public.work_orders FOR DELETE
  USING (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid()
        AND r.name = 'admin'
    )
  );

CREATE POLICY "Service role full access on work_orders"
  ON public.work_orders FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- RLS — work_order_events
-- ============================================================
ALTER TABLE public.work_order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own org work order events"
  ON public.work_order_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = work_order_id
        AND wo.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Users create work order events"
  ON public.work_order_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = work_order_id
        AND wo.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Service role full access on work_order_events"
  ON public.work_order_events FOR ALL
  USING (true)
  WITH CHECK (true);
;
