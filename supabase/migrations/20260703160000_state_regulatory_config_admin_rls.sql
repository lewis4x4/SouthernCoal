-- A1: State Regulatory Config admin — admin UPDATE on configs, admin INSERT/UPDATE on contacts.

CREATE POLICY "Admin can update state regulatory configs"
  ON state_regulatory_configs FOR UPDATE TO authenticated
  USING (current_user_has_any_role(ARRAY['admin']))
  WITH CHECK (current_user_has_any_role(ARRAY['admin']));

CREATE POLICY "Admin can insert regulatory contacts"
  ON regulatory_contacts FOR INSERT TO authenticated
  WITH CHECK (current_user_has_any_role(ARRAY['admin']));

CREATE POLICY "Admin can update regulatory contacts"
  ON regulatory_contacts FOR UPDATE TO authenticated
  USING (current_user_has_any_role(ARRAY['admin']))
  WITH CHECK (current_user_has_any_role(ARRAY['admin']));
