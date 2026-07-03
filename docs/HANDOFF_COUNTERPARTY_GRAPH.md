# Handoff — The Counterparty & Interaction Graph

**Version:** 1.0 · **Date:** 2026-07-03
**Authority:** `docs/ENGINEERING_FREEDOM.md` · **Sequencing:** feeds `docs/UNIFIED_MASTER_ROADMAP.md` (new §8 reference) · **Repo:** `SouthernCoal` @ `main`
**What this is:** the missing base layer under every management system — the record of *who the players are, how they relate, and every time we touched them*. Not a CRM (no customers here); a **counterparty + interaction-of-record** graph. For a company under CWA consent decree Case 7:16-cv-00462-GEC, the interaction ledger is a litigation asset, not an address book.

**Fact-check status:** every fold-in anchor and house convention below was verified against the repo at main tip on 2026-07-03, and the data model was run through a three-reviewer adversarial panel (data-modeling / privilege-litigation / multi-tenant-security). All BLOCKER and MAJOR findings are folded in and attributed inline. Live-DB counts remain unverifiable this session (Supabase MCP unauthorized).

---

## 1. The decision — two slices, one hard split

The single most important design choice: **split the ungated identity spine from the governance-gated interaction ledger.** The Rolodex (who exists, how they relate) has no privilege or discovery exposure and ships fully autonomously now. The conversation-log has *every* litigation landmine and waits behind a counsel gate.

- **Slice A — The Party Spine (build now, parallel to ECHO, fully autonomous).** Parties, roles, relationships, merge events, and the org↔party bridge. Pure internal registry; folds in the silos we already run by hand.
- **Slice B — The Interaction Ledger (governance-first; auto-capture behind a HARD GATE).** The append-only, evidence-grade record of every touch. Manual capture may build behind fail-closed privilege; **automated capture (`email_sync`, `portal_scrape`, `field_voice`) must not write a single row until counsel signs a privilege + retention policy** (§5).

**Reused verbatim (verified):** PK `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`; tenant scope `organization_id uuid NOT NULL REFERENCES organizations(id)`; RLS helper `get_user_org_id()` (SECURITY DEFINER, reads `user_profiles`); role gating via `EXISTS (SELECT 1 FROM user_role_assignments ura JOIN roles r ON r.id=ura.role_id WHERE ura.user_id=auth.uid() AND r.name IN (...))`; `set_updated_at()` trigger; `useAuditLog` fire-and-forget. `user_profiles.id = auth.uid()` (no separate user_id). **There is no `vendors` table** — do not fold one in; create vendor parties fresh. **`user_profiles` has no role column** — roles live in `user_role_assignments`.

---

## 2. What the adversarial panel changed (plausible → world-class)

| Reviewer finding | Severity | Resolution folded in |
|---|---|---|
| Privilege-at-capture is a waiver machine | BLOCKER×2 | Machines may set **only** `pending_review`; attorney-client/work-product elevation is a counsel-only human act, logged. Fail closed. |
| Reinvents the existing classification system | BLOCKER | **Reuse `src/lib/classification.ts` (6-level `RecordClassification` floor model) + the `legal_hold` permission.** Privilege is a *facet* mapped into it, not a competing enum. |
| "Deletable tier" = spoliation trap | BLOCKER | Replaced with hold-aware retention: no background purge; disposition only via counsel-approved logged event; WORM/object-lock originals. |
| Silent shared/private promotion hole | BLOCKER | DB `CHECK ((is_shared_reference AND org_id IS NULL) OR (NOT is_shared_reference AND org_id IS NOT NULL))`; tenant writes `WITH CHECK org_id=get_user_org_id() AND NOT is_shared_reference`. |
| No platform-admin identity exists | BLOCKER | Shared-party writes route through a SECURITY DEFINER RPC gated on a JWT `app_metadata.platform_admin` claim — **new infra**, spec'd in §7. |
| Cross-boundary merge corrupts tenancy | BLOCKER | Merge-boundary trigger: tenant merges join same-tenant private only; shared↔shared platform-admin only; shared↔private **prohibited**. Cross-boundary linkage uses a private `same_as` alias edge instead. |
| `interaction_participants` join-table leaks | BLOCKER | Participant SELECT scoped to the **parent interaction's** tenancy, never the party's; generated `org_id` forced equal to parent. |
| No merge-event table; `superseded_by` alone unsound | BLOCKER | Add `party_merge_events` (append-only authority); `superseded_by` is derived; child FKs never repointed; identity resolved through a view; interactions snapshot party identity **as observed at capture**. |
| Bitemporal applied asymmetrically | BLOCKER | Uniform `valid_from`/`valid_to`/`transaction_time` on parties, roles, relationships (house §7.2 convention); interactions are append-only `occurred_at` events (system-time only). |
| role_type/relationship_type as enums for an extensible taxonomy | MAJOR | Governed **reference tables** (`party_role_types`, `party_relationship_types`), mirroring the `roles` lookup pattern. Closed sets (direction, channel, participant_role, capture_source) stay CHECK. |
| org=tenant=party bridge unspecified | MAJOR | `organizations.party_id uuid UNIQUE REFERENCES parties(id)`, backfilled for all 27 orgs; `msha_mine_org_map` stays the operational controller map and is the **single source** from which `owns_or_controls` edges derive. |
| `statutory_significance` silently manufactures duties | MAJOR | Advisory/DRAFT when machine-suggested; a human (counsel/Env Mgr) confirms before it feeds any admission-ledger/accrual view — mirrors the penalty-ledger DRAFT gate + AI verification-badge pattern. |
| Adjudicator Atlas won't survive a motion to compel | MAJOR×2 | **Deferred, counsel-gated.** Separate segregated artifact, k≥5 cell suppression + noise, stores only suppressed aggregates. Shared party = identity resolution only, never a scored dossier. |
| Merkle anchor overclaims admissibility | MAJOR | Spec: RFC 3161 (or public-ledger) timestamp, per-row inclusion proof, a 902(13)/(14) certification artifact, and capture chain-of-custody. |
| No partition/index strategy at scale | MAJOR | `interactions` RANGE-partitioned by `occurred_at` (quarterly); composite `(organization_id, occurred_at DESC)` and `(organization_id, matter_id, occurred_at)`; partial index on unreviewed privilege; purgeable payload split to `interaction_media`. |

---

## 3. Slice A — The Party Spine (build now)

### 3.1 Governed taxonomy (reference tables, not enums)

```sql
CREATE TABLE party_role_types (
  code text PRIMARY KEY,
  display_label text NOT NULL,
  category text NOT NULL,            -- internal | regulator | commercial | legal | financial | community
  statutory_basis text,
  is_active boolean NOT NULL DEFAULT true,
  deprecated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- seed: employee, certified_examiner, regulator_staff, agency, counsel, surety, insurer,
--       lender, lab, vendor, royalty_owner, lessor, contractor, community_member,
--       elected_official, doj_monitor  (reconcile with emergency_contacts.contact_role — §6)

CREATE TABLE party_relationship_types (
  code text PRIMARY KEY,
  display_label text NOT NULL,
  is_directed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- seed: employs, represents, regulates, contracts_with, owns_or_controls,
--       registered_agent_for, surety_for, counsel_for, same_as
```

### 3.2 `parties` (the exemplar — copy conventions verbatim)

```sql
CREATE TABLE parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_kind text NOT NULL CHECK (party_kind IN ('person','organization')),
  display_name text NOT NULL,
  legal_name text,
  organization_id uuid REFERENCES organizations(id),          -- tenant owner; NULL iff shared reference
  is_shared_reference boolean NOT NULL DEFAULT false,
  user_profile_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,  -- auth link for employees
  external_ids jsonb NOT NULL DEFAULT '{}',                    -- {msha_controller_id, echo_facility_npdes, ...}
  superseded_by uuid REFERENCES parties(id),                  -- DERIVED; authority = party_merge_events
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  transaction_time timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parties_tenancy_invariant CHECK (
    (is_shared_reference AND organization_id IS NULL)
    OR (NOT is_shared_reference AND organization_id IS NOT NULL)
  )
);
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parties_select" ON parties FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id() OR is_shared_reference);

CREATE POLICY "parties_insert" ON parties FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id() AND NOT is_shared_reference
    AND EXISTS (SELECT 1 FROM user_role_assignments ura JOIN roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid() AND r.name IN ('admin','executive','environmental_manager','site_manager')));

CREATE POLICY "parties_update" ON parties FOR UPDATE TO authenticated
  USING (organization_id = get_user_org_id() AND NOT is_shared_reference)
  WITH CHECK (organization_id = get_user_org_id() AND NOT is_shared_reference);

CREATE POLICY "parties_service" ON parties FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER set_parties_updated_at BEFORE UPDATE ON parties
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

Shared-reference rows (`organization_id NULL`) are **read-only to every tenant** and writable **only** by the platform-admin RPC (§7) — no tenant policy can touch them because every write policy requires `NOT is_shared_reference`.

### 3.3 `party_roles` and `party_relationships` (temporal; tenant-private assertions)

Both carry the full bitemporal triad (`valid_from`/`valid_to`/`transaction_time`) and `organization_id NOT NULL` — **a role/relationship is always a tenant's private assertion *about* a (possibly shared) identity.** Two tenants asserting the same regulator role hold two independent private rows; neither can see or infer the other's (closes the existence-oracle leak).

- `party_roles`: `party_id`→parties, `role_type_code`→party_role_types, `organization_id`, `site_id`/`npdes_permit_id` NULL (asset scope), `source`, `confidence`, bitemporal triad. RLS SELECT strictly `organization_id = get_user_org_id()` (never widened to shared). Add an `EXCLUDE USING gist` no-overlap constraint on `(party_id, role_type_code, valid range)` per tenant so a party can't hold the same role twice at once.
- `party_relationships`: `from_party_id`, `to_party_id`, `relationship_type_code`, `organization_id`, `evidence_refs jsonb`, bitemporal triad. The `owns_or_controls` edges (SMCRA §510(c)/AVS query) **derive from `msha_mine_org_map`**, which stays the operational source of truth — do not duplicate the mapping. Exception: a shared↔shared structural edge (e.g. `regulator_staff employed_by agency`) may be shared (`organization_id NULL`, platform-admin-written) with a CHECK that a shared edge connects only shared parties.

### 3.4 `party_merge_events` (identity-resolution authority)

```sql
CREATE TABLE party_merge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surviving_party_id uuid NOT NULL REFERENCES parties(id),
  superseded_party_id uuid NOT NULL REFERENCES parties(id),
  organization_id uuid REFERENCES organizations(id),  -- NULL only for platform-admin shared merges
  merged_by uuid REFERENCES user_profiles(id),
  basis text NOT NULL,
  confidence numeric,
  unmerge_of uuid REFERENCES party_merge_events(id),   -- reversibility
  transaction_time timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- append-only (no UPDATE/DELETE policies); superseded_by on parties is a materialized convenience only.
```

**Merge-boundary trigger on `parties.superseded_by`:** assert source and target share `(is_shared_reference, organization_id)`, OR the session is platform-admin. Tenant merges join same-tenant private rows only; shared↔shared is platform-admin only; **shared↔private is prohibited** — use a private `same_as` relationship edge instead. Child FKs (`party_roles`, `party_relationships`, and later `interaction_participants`) are **never repointed**; identity resolves through a `parties_resolved` view that follows `superseded_by`. Fuzzy-match candidates surface in the existing Review Queue for human confirmation; a per-attribute survivorship policy governs the golden record.

### 3.5 The org↔party bridge (one source of truth for "the company is also a party")

```sql
ALTER TABLE organizations ADD COLUMN party_id uuid UNIQUE REFERENCES parties(id);
-- migration backfills one organization-kind party per existing org (SCC parent + 26 subs),
-- sets is_shared_reference=false, organization_id = the org's own id.
```

Tenancy stays anchored on `get_user_org_id()`; the bridge lets the org participate in relationships (owns/controls, is-counsel-for) without collapsing tenant identity into the graph.

---

## 4. Slice B — The Interaction Ledger (governance-first, gated)

**Do not build auto-capture until §5 clears.** Manual capture may be built behind fail-closed privilege.

- `interactions` (**append-only**, immutable via omitted UPDATE/DELETE policies + service-role bypass, per the `human_overrides` house pattern): `organization_id NOT NULL` (**always tenant-private, even when referencing a shared regulator party** — the single most important invariant, keep it inviolable); `occurred_at`, `transaction_time`; `direction` CHECK(inbound|outbound|internal); `channel` CHECK(call|email|letter|portal|inspection_visit|meeting|sms|field_voice); `subject`, `summary`; **`classification` mapped into the existing `src/lib/classification.ts` floor model — NOT a new privilege enum**; `statutory_significance` CHECK(none|notice|certification|disclosure|response|spill_notification) **defaulting to advisory/DRAFT** until human-confirmed; `capture_source` CHECK(manual|email_sync|field_voice|portal_scrape); linked refs `npdes_permit_id`/`facility_id`/`obligation_id`/`citation_id`/`matter_id` NULL; `content_hash`; `anchor_ref` (RFC 3161 / public-ledger root + inclusion proof); `certification_ref` (902(13)/(14) artifact). RANGE-partition by `occurred_at` (quarterly); indexes `(organization_id, occurred_at DESC)`, `(organization_id, matter_id, occurred_at)`, partial on unreviewed privilege.
- **Privilege fail-closed:** any row with `capture_source IN (field_voice,email_sync,portal_scrape)`, or any counsel participant, or `matter_id NOT NULL`, defaults to `pending_review` classification, **visible only to counsel roles** until a human clears it. Machines never set attorney-client/work-product. Elevation/clearance is a counsel-only append to `interaction_privilege_reviews` (actor + basis), never an in-place mutation.
- `interaction_participants`: `interaction_id`→interactions, `party_id`→parties, `participant_role` CHECK(from|to|cc|present), `organization_id` **generated/forced equal to the parent interaction's org** (trigger). SELECT scoped strictly to `interaction_id IN (SELECT id FROM interactions WHERE organization_id = get_user_org_id())` — never the party's tenancy. Party identity stored **as observed at capture** (snapshot), resolved through the merge view for display only.
- `interaction_media` (purgeable child, hold-aware): binary payloads (voice audio, images) separated from the immutable interaction record so the anchor covers the record, not the disposable blob. **No background purge** — disposition only via a counsel-approved, logged event; a `legal_hold` flag (the existing permission) suppresses all disposition; originals under WORM/object-lock.

---

## 5. Hard gates & explicitly deferred

| Item | Gate |
|---|---|
| **Interaction-ledger auto-capture** (`email_sync`/`portal_scrape`/`field_voice`) | **HARD GATE (new).** A counsel-signed, versioned privilege-classification + retention/disposition + FOIA-response policy row must exist and be stamped on every captured row before any auto-capture source writes. Provide a counsel-only quarantine/clawback path (FRE 502(b)/(d)). |
| Privilege elevation to attorney-client/work-product | Counsel-only human act, logged. Machines set `pending_review` only. |
| `statutory_significance` feeding any admission-ledger/accrual view | Human (counsel/Env Mgr) confirmation — DRAFT until verified (penalty-ledger gate pattern). |
| **Adjudicator Atlas** (cross-tenant regulator analytics) | **Deferred + counsel-gated.** Separate segregated artifact, k≥5 suppression + noise, suppressed aggregates only. Not this phase. |
| Platform-admin shared-party writes | Via SECURITY DEFINER RPC gated on JWT `app_metadata.platform_admin` (§7) — not a tenant `admin`. |
| Deferred UI (not this handoff) | Party-360 record, Matters/pipeline, human Task layer — Slice C, after the spine + ledger land. |

Slice A (the party spine) is **fully autonomous** — new additive tables, no external action, no privilege surface. Only Slice B's auto-capture and the Atlas are gated.

---

## 6. Fold-in map (corrected against the schema)

| Existing | Reality | Fold-in |
|---|---|---|
| `user_profiles` | PK = auth.uid(); no role column | → `parties(person)` via `user_profile_id`; roles read from `user_role_assignments`. `user_profiles` stays the auth identity — do not merge away. |
| `organizations` (27) | self-FK `parent_id`, `org_type` parent/subsidiary/affiliate; `tenant_id` col exists | → org-kind parties via the `party_id` bridge; keep tenancy on `get_user_org_id()`. |
| **`vendors`** | **does not exist** | Create vendor parties fresh (party + `vendor`/`lab` role). No table to fold. |
| `emergency_contacts` | closest existing contact register; `contact_role` CHECK has 12 values (epa_coordinator, state_dep_contact, legal_counsel, lab_contact…) | → seed `parties` + `party_roles`; **reconcile `party_role_types` codes with this enum** so they don't diverge. |
| `external_msha_inspections` | no inspector/district columns; `mine_id text` | → `interactions(inspection_visit)` (Slice B); agency/inspector become shared parties; link via `msha_mine_org_map`. |
| `msha_mine_org_map` | controller allowlist (3 Justice IDs) → 106 mines → 27 subs, hard-coded org UUIDs | **stays the operational source**; `owns_or_controls` edges derive from it. |
| State agencies | live in `src/lib/constants.ts` (WV=`DEP`, VA=`DMLR`…), **not** the DB | seed as shared-reference agency parties. |
| Labs | free-text `sampling_events.lab_name` (Aquatic, FTS, LRS Asheville, Waypoint) | seed as lab parties; later FK `lab_name` → party. |
| `scheduled_reports.recipients text[]`, discovery owners (Tom Lusk, Bill Johnson, Steve Ball, Jon Lawson, Brad Morrison, Jay Justice; outside counsel Carey Douglas Kessler & Ruby) | loose strings / markdown | seed person parties; their outreach becomes interactions (Slice B). |

---

## 7. Multi-tenant boundary (decide once, up front)

- **Shared-reference parties** (`organization_id NULL`, `is_shared_reference true`): regulators, agencies, standards bodies, DOJ monitors. Readable by all tenants; writable only by the platform-admin RPC. The CHECK invariant makes the hybrid/promotion state unrepresentable.
- **Tenant-private everything else:** `party_roles`, `party_relationships`, `interactions`, `interaction_participants` are always `organization_id = get_user_org_id()` and never widen to shared.
- **Platform admin is new infra:** the codebase has no `is_platform_admin`. Add a JWT `app_metadata.platform_admin` claim checked via `auth.jwt()`, and route all shared-party writes through a SECURITY DEFINER RPC (`upsert_shared_party(...)`) gated on it. Tenant `admin` role must **not** be able to write shared parties.
- This boundary is what later makes a *lawful* Adjudicator Atlas possible (shared identity, private assertions, segregated suppressed aggregates) — but the Atlas itself is deferred and counsel-gated.

---

## 8. Acceptance criteria

- [ ] Slice A tables live with RLS; `parties_tenancy_invariant` CHECK enforced; a tenant cannot INSERT/UPDATE a shared-reference party (test both).
- [ ] All 27 orgs bridged to org-kind parties via `organizations.party_id` (UNIQUE).
- [ ] `user_profiles`, `emergency_contacts`, state agencies, named labs, and the 6 discovery owners seeded as parties/roles; `party_role_types` reconciled with `emergency_contacts.contact_role`.
- [ ] `owns_or_controls` edges derive from `msha_mine_org_map` (no duplicated mapping); as-of query "who controlled mine X on date D" returns correctly through the bitemporal columns.
- [ ] Merge: a same-tenant merge logs a `party_merge_events` row, repoints no child FKs, resolves through the view; a shared↔private merge is rejected by the trigger.
- [ ] Slice B built manual-only with privilege fail-closed (a `field_voice`/counsel/matter-tagged row is counsel-only until cleared); auto-capture sources refuse to write with no signed policy row present.
- [ ] `interaction_participants` cannot be used to infer another tenant's interactions (write the cross-tenant attack test).
- [ ] `classification` uses `src/lib/classification.ts` — no competing privilege enum shipped.

**Verify each slice:** `npm run typecheck && npm run lint && npm test && npm run build`. Prod apply via MCP + committed migration file, noting the documented ledger drift (`supabase/BASELINE_ADOPTION.md`).

## 9. References

`src/lib/classification.ts` (RecordClassification floor model — reuse) · `supabase/migrations/20260216170001_create_get_user_org_id.sql` · `..._corrective_actions_rls.sql` (RLS exemplar) · `20260702200000_keystone_schema_discipline_72.sql` (bitemporal triad) · `20260404000000_phase8_work_orders_compliance_db.sql` (`human_overrides` append-only pattern) · `20260701180000_msha_mine_org_map.sql` · `20260404300000_phase11_emergency_hardening.sql` (`emergency_contacts`) · `src/lib/rbac.ts` · `docs/UNIFIED_MASTER_ROADMAP.md` §7 · SCC-OS keystone memo (external, `SOUTHERN COAL/`) — this is the party/interaction substrate that memo's admission-ledger, Regulator's Mirror, and disclosure engine silently assume.

---

*Generated by SCC Compliance Monitor tooling. Not legal advice. Not an EMS. All data and reports require independent verification by qualified personnel before regulatory or litigation submission.*
