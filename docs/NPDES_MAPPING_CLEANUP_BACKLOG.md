# NPDES Federal Mapping — Cleanup Backlog

**Import run:** `bulk_import_scc_federal_npdes_mapping_2026_05_25`  
**Source:** `../SOUTHERN COAL/SCC_Federal_NPDES_Mapping_IMPORT.csv` + `../SOUTHERN COAL/SCC_Federal_NPDES_Mapping_GAPS.md`  
**Imported:** CONFIRMED + IDENTITY rows only (109 permits). PROXIMITY / UNKNOWN / ECHO_NOT_TRACKABLE skipped.

Re-import safe rows:

```bash
npm run import:npdes-mappings -- --apply
```

---

## Deferred — handle in end-of-milestone cleanup

### VA (28 permits — Federal NPDES still blank)

| Category | Permit numbers | Action |
|----------|----------------|--------|
| Bare 008-series (9) | `0081742`, `0081800`, `0081918`, `0081954`, `0081975`, `0082052`, `0082053`, `0082071`, `0082094` | VPDES PDF or VA DEQ CEDS; resolve twins with `VA008*` rows |
| Bare DMLR (2) | `1102003`, `1602068` | CD Attachment F or CEDS pairing |
| Valid-format unconfirmed (14) | `VA0081554`, `VA0081916`, `VA0081917`, `VA0081918`, `VA0081949`, `VA0081954`, `VA0081991`, `VA0082042`, `VA0082047`, `VA0082051`, `VA0082054`, `VA0082066`, `VA0082071`, `VA0082074` | Operator/DEQ sign-off → likely IDENTITY import |
| False positive | `VA0082058` | Find real SCC VPDES (ECHO hit = school) |
| Pseudo-NPDES | `VA1101916` | Real federal ID from VPDES |
| PROXIMITY (held) | `VA0081914` | Confirm Q4 2025 CD Attachment F → then import |

### WV (4 permits)

| `permit_number` | Issue |
|---------------|--------|
| `0081742` / `WV0081742` | Possible VA/WV conflation — verify state |
| `1102042`, `1102051` | Registry says WV DEP; Lawson list says VA Outfalls |
| `WV-UAT-FAKE-001` | Delete test row from `npdes_permits` |

### KY (1 permit)

| `permit_number` | Issue |
|---------------|--------|
| `KYGE40000` | Master general permit — intentionally not mapped (`ECHO_NOT_TRACKABLE`) |

### Registry data quality

- [ ] Dedupe `1602072` + `VA0082072` (same mine; both now map to `VA0082072`)
- [ ] Dedupe bare/`VA`-prefixed twins: `0081918`/`VA0081918`, `0081954`/`VA0081954`, `0082071`/`VA0082071`
- [ ] Add missing WV permits in ECHO but not in registry: `WV1020366`, `WV1021451`, `WV1024116`, `WV1027867` (per gap report)

### Source files for second-pass crosswalk (optional)

Re-run mapping agent with: `SCC_NPDES_Permit_Inventory.csv`, `echo-sync-coverage.csv`, `WV_2026_Outfalls_DNR_to_NPDES_Bridge_COMPLETED.md`, `SCC_DMR_Export_CY2025_KY_WV_TN.csv`

---

## Verify after import

1. **Compliance → ECHO Data** — Registry Mapping Gaps panel + Active Mappings count  
2. **SCC-OS Permit Registry** — Federal NPDES column on mapped rows  
3. Spot-check `1602072` → `VA0082072` in permit profile
