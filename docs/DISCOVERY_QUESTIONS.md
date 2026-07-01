# Project Sovereign — Discovery Questions

**Version:** 1.0 (DRAFT)
**Date:** 2026-06-30
**Author:** UltraCode
**Status:** Awaiting client answers

*Not legal advice. Internal working artifact for Phase 0 architecture scoping only.*

---

These are the operational unknowns the client must answer before the Sovereign architecture is finalized. Each question is routed to a single accountable owner, de-duplicated across the 11 domain maps, and annotated with why it blocks the build and which domain(s) it serves. The hardest blockers are marked **[BLOCKER]**.

---

## ⚠ Figures Verification Ledger — reconcile to source before any external or legal use

> **Status: DRAFT.** The quantitative claims below were auto-extracted by discovery agents from **real, on-disk source files** (listed under Provenance) and cross-checked by an adversarial anti-fabrication audit. They are **not yet independently reconciled**. Per the engagement's own communication rules, *every number presented to DOJ, EPA, or legal counsel must be traceable to a source document, and no specific penalty dollar amount may be cited unless the underlying data is confirmed complete and verified.* Treat this document as an internal working draft, not a citable record.

**Provenance (files confirmed to exist on disk):**
- `SOUTHERN COAL PROJECT FILES/LAB INVESTIGATION/January2026_Concerns_v2.pdf`
- `SOUTHERN COAL PROJECT FILES/Labs Sample/FTS_Defense_Summary_2025.docx`
- `SOUTHERN COAL PROJECT FILES/All_States_Feasibility_Analysis.docx`
- `SOUTHERN COAL PROJECT FILES/2025/Justice_Consent_Decree_Compliance_Analysis.pdf`
- `SOUTHERN COAL PROJECT FILES/Reports/FILE_ANALYSIS_REPORT.md` · plus `SCC_Meeting_Recap_Feb21.pdf`, `justice_companies_client_profile.md`, `ECHO_SYNC_REPORT.md`

**Flagged for reconciliation (adversarial audit findings — resolve with Bill Johnson / Steve Ball before any external use):**
1. **$9.665M 2025 penalty total does not internally reconcile** — the cited state components (KY + WV + VA + TN) sum to ~$9.657M, an ~$8K gap the January memo itself notes. Recompute from a single reconciled source; do not present the rounded total as authoritative.
2. **Force Majeure "forfeiture" is an unconfirmed observation, not a legal conclusion** — the source says a 3-business-day notice *appears not* to have been filed on S402586 ($299K) and S400311 ($8K). Whether the FM defense is actually lost is a determination for counsel (Steve Ball), not a settled fact.
3. **Headline rates rest on a self-flagged denominator** — the 12.7% failure rate, 2,289 WV misses, and 59.3% WV submission rate derive from a 30,412 "required-event" baseline that the Feb 21 recap flags as *possibly inflated*. The true denominator is unknown until the Sampling Matrix is received.
4. **Derived-from-range dollars** — figures like the ~$873K Q4 bad-road exposure and the ~$1.3M Jan-2026 roll-up appear computed from per-event ranges and do not cleanly reconcile with the $1,060,000 FTS sheet total. Show the derivation or mark GAP.
5. **Make-vs-buy economics are unvalidated** — the ~$1.8M/yr (Aquatic) vs ~$1.06M/yr (in-house) comparison and the $38.49/event break-even cannot be validated until a real lab analytical price exists (contracts negotiated in zero states).
6. **Large exact counts** (e.g., ECHO 144,339 discrepancies; 42+ VA DMLR permits) trace to named files but were not independently re-counted here.

*This ledger is the honest disclosure layer required by a litigation-grade discovery draft. Removing a figure from this document does not make it verified; reconciliation to source does.*

## Tom Lusk (COO) — operations, production, fleet, staffing, MSHA IDs, transport

Tom is the single largest data-source dependency: most domains cannot capture a first data point until he confirms what systems of record exist.

1. **[BLOCKER]** Is there a production system of record today (SCADA historian, mine-planning/reserve software, ERP, or paper daily-production sheets + spreadsheets), and can it export per-shift tons by mine/seam?
   *Why it blocks build:* Decides whether Production is a "pipe-in an existing feed" job or a from-scratch data-capture build. Nothing can be reconciled or automated without this. — *Coal Production & Input Tracking*

2. **[BLOCKER]** Does Justice run a CMMS/EAM (which one), a fixed-asset ledger, and telematics (CAT VisionLink / Komatsu KOMTRAX / Modular / Wenco / Hexagon), and can any export hours/fuel/downtime by unit — or is fleet on spreadsheets? Separately, which CMMS (if any) holds the equipment asset register and PM history (CAT SIS, Komatsu CSS, Joy MineCare, general CMMS, or paper)?
   *Why it blocks build:* Determines whether Fleet and Maintenance are integration plays or greenfield builds; without it, every unit/hours/utilization/PM-compliance number would be fabricated. — *Fleet & Heavy Equipment; Maintenance*

3. **[BLOCKER]** Provide the complete federal 7-digit MSHA Mine ID list for all active/inactive Justice/SCC mines, mapped to each subsidiary org and to state mine-license IDs (WV/KY/VA), including contractor/contract-miner IDs that roll up to the operator. For underground units, include MSHA permissibility approval numbers (2G-/9C-) and beacon/strobe/DPF status.
   *Why it blocks build:* Single deliverable that unblocks the primary dependency for the MSHA domain — populates the Mine ID map, lets `sync-msha-data` filter the public feed, and is prerequisite to inspection/citation/training/POV tracking and permissibility flags on inter-mine transfers. — *Mine Safety; Fleet & Heavy Equipment*

4. What is the actual fleet: unit count by class (haul trucks, dozers, loaders, drills, CMs, roof bolters, pumps, gensets) and the owned vs. leased vs. contractor split per site/mine?
   *Why it blocks build:* The missing quantified baseline behind every dollar/utilization/downtime claim; Function Inventory flags rental-vs-owned co-mingling as a top data-integrity failure. — *Fleet & Heavy Equipment*

5. **[BLOCKER]** Which pumps and haul roads gate specific NPDES outfalls, and can pump-house/road availability be fed as a status signal?
   *Why it blocks build:* Per the Q4-2025 missed-sample reason-code breakdown (source dataset to be confirmed; figures unverified), 64.5% of missed samples were coded "Bad Road Conditions" and 8.5% "Operational Hold"; linking fleet/road/pump state to the affected outfalls is the highest-leverage, already-justified fleet→compliance automation. — *Fleet & Heavy Equipment*

6. What system(s) run truck dispatch, scale ticketing, and loadout today (dedicated software, ERP module, spreadsheets, or paper scale-house tickets), and which loadouts are rail vs. barge vs. truck-only?
   *Why it blocks build:* Determines whether any transport data can be ingested at all; the domain's automatability hinges on a source feed that does not currently exist. — *Transportation & Loadout*

7. How is tonnage reconciled today across mine survey → truck count → plant clean tons → loadout → rail/barge scale → in-transit → sales/royalty statements; what is the typical discrepancy; and how often does "phantom production" (loadout ahead of plant) actually occur?
   *Why it blocks build:* Reconciliation is flagged as recurring pain in multiple inventories but no magnitude is documented; sizing the delta is the core value case for a production/transport ledger. — *Coal Production & Input Tracking; Transportation & Loadout*

8. Who certifies the NTEP/W&M loadout and batch-weigh scales, on what annual schedule per state (WV/VA/KY/AL/TN), and where are the current seal/cert-expiry dates?
   *Why it blocks build:* Billing must be blocked on expired seals; a lapsed certified scale can invalidate shipment weights and severance filings. A low-risk cert-expiry tracker needs this asset+date list, which is absent from sources. — *Coal Production & Input Tracking; Transportation & Loadout*

9. Does prep-plant instrumentation (tph, separation SG, product moisture, yield) log to a queryable historian, or is it read manually per shift?
   *Why it blocks build:* A machine feed vs. manual reads changes automatability of yield/quality monitoring by an order of magnitude. — *Coal Production & Input Tracking*

10. Are MSHA Form 7000-2 quarterly production/employment reports and state severance-tax tonnage forms filed manually today, and from what source numbers?
    *Why it blocks build:* Confirms whether a 7000-2 / severance auto-assembly quick win is even possible. — *Coal Production & Input Tracking*

11. What is SCC's current PM compliance %, reactive-vs-preventive ratio, MTTR, and equipment-downtime rate — and is any of it measured today?
    *Why it blocks build:* Establishes the baseline dollar/frequency case for maintenance automation; without it every maintenance $ claim is a GAP that can't be cited to the client. — *Maintenance*

12. Does SCC run a predictive-maintenance program (oil analysis, vibration, thermography), and are the reports actually reviewed or filed-and-forgotten?
    *Why it blocks build:* "Sampled but never reviewed" is flagged as the dominant PdM failure; scopes whether the Brain's first PdM win is ingestion or review-triage. — *Maintenance*

13. Is there a parts/spares inventory system with min-max reorder points, and how often does a work order stall waiting on parts ("zombie WOs")?
    *Why it blocks build:* Determines feasibility of a parts-reorder automation and quantifies the reactive-maintenance stockout pain. — *Maintenance*

14. **[BLOCKER]** When will the master Sampling Matrix (every outfall → parameters, frequency, assigned lab, method, responsible party) be delivered, and how is permit→lab assignment managed today — spreadsheet, email, or verbal?
    *Why it blocks build:* Single blocker for populating the sampling calendar/schedules, computing the authoritative required-event baseline, and enabling all missed-sampling and exceedance detection. — *Environmental Compliance*

15. Is Aquatic subcontracting WV fieldwork, and can we obtain the missing Q1–Q3 2025 reason codes and any makeup samples?
    *Why it blocks build:* WV is the worst-performing state (submission/miss figures — 59.3% rate, 2,925 misses, 75.7% undocumented — per the enterprise submission report; unverified pending Q38 baseline validation); subcontracting would explain the gap, and reason codes drive the Force Majeure/defense narrative. — *Environmental Compliance*

16. For each subsidiary/permit, what is the current lifecycle state (active / in reclamation / closed) and the source of record — needed to distinguish an obligated permit from a released one?
    *Why it blocks build:* Gates whether a permit still carries sampling/bond/reclamation obligations; the platform cannot validate penalties (e.g., the ~$126K asserted against seemingly-inactive permits per the FTS sheet; validity pending Q41) without it. — *Surface Mining & Reclamation*
    *(Coordinate with Jon Lawson, who holds the active-operations outfall list.)*

17. Which specific state sampler/field credentials must each tech and supervisor hold for the proposed in-house program (13-person staffing per the current program plan; headcount unverified), and are the proposed hires already credentialed? Separately, what is the current system of record for employee credentials and cert expirations, and can we export every person → state → cert → expiry?
    *Why it blocks build:* A cutover from third-party labs with uncredentialed samplers would create a new compliance gap; nothing can be automated until the roster + cert dataset exists (platform tables are empty). — *HR / Workforce / Credentialing*

18. Which credentials are dispatch/site-access BLOCKING vs. advisory, who is the authorized approver for a blocking override, and how are Part 48/46 training records, annual-refresher deadlines, and contractor credentialing maintained today (and where do those records live)?
    *Why it blocks build:* Training currency gates site access; the block-site-without-current-Part-48 rule and the override human-gate need business rules and a source system before they can be enforced. — *HR / Workforce / Credentialing; Mine Safety*

19. How are MSHA citations, abatement deadlines, and the 30-day contest clock tracked today; who owns the contest/pay decision per site; and who are the authorized §50.10 immediate-notification callers and 7000-1/7000-2 filers per mine?
    *Why it blocks build:* Determines whether any digital record exists to backfill vs. greenfield, and defines the human chain/escalation the citation-abatement and Part 50 agents must drive before modeling. — *Mine Safety*

20. Is there a maintenance/reliability manager, shop foreman, or parts buyer who owns PM schedules, breakdown priority, and return-to-service — and who signs off safety-critical return-to-service?
    *Why it blocks build:* No fleet/maintenance-pain owner is named in any source; the return-to-service human gate needs a real approver before it can be modeled. — *Fleet & Heavy Equipment; Maintenance*

21. Which labs perform WET testing for which permits, on what schedule, and are any outfalls under WET suspension/exemption letters?
    *Why it blocks build:* WET failures trigger state-reportable TRE/TIE obligations with penalty exposure; this is unbuilt and the platform has no WET data at all. — *Quality Control & Customer Specs*

22. Does the company have a documented training curriculum/competency matrix (the 2016 EMS Manual references one but none was provided)?
    *Why it blocks build:* Without it the training catalog cannot be seeded correctly. — *HR / Workforce / Credentialing*

23. Is commercial coal-spec QC (BTU/ash/moisture/sulfur per shipment, blend recipes, certificate of analysis, rejected loads, customer claims/penalties) tracked anywhere today, and in what system/spreadsheet?
    *Why it blocks build:* This entire half of the QC domain is GAP-undocumented and off-platform; it drives revenue, claims, and moisture-basis royalty errors but is invisible to compliance officers. — *Quality Control & Customer Specs*

24. What is annual demurrage spend and the dispute rate with railroads (NS/CSX) and barge lines, and where are free-time clocks tracked?
    *Why it blocks build:* Sizes the demurrage-tracker quick win; no demurrage dollar figure appears in any source. — *Transportation & Loadout*

25. How does the reserve/quality block model (ash/sulfur/BTU by seam) reconcile against shipped quality, and how often do off-spec shipments trigger customer claims?
    *Why it blocks build:* Model-vs-shipped bias is flagged as direct revenue/claim exposure a brain could pre-empt. — *Coal Production & Input Tracking* *(coordinate with geology/sales)*

26. Have any of the 2025 stipulated penalties (exposure figure ~$9,665,000 per the penalty-exposure summary; unverified pending Q36/Q38) been paid, disputed, or are they accruing interest — and what is the payment history to date?
    *Why it blocks build:* Without the baseline the platform cannot track whether the program reduces real dollars paid vs. exposure calculated; interest accrual changes the true liability.
    *Note: routed to Steve Ball below as the legal owner; Tom to supply any operational payment records.* — *Financial & Contracts*

---

## Bill Johnson — lab documentation & data, parameter sheets, EDD, permit data, PE stamps

Bill unblocks the entire lab-ingestion and parameter-mapping spine; several parsers are BLOCKED on formats only he can supply.

27. **[BLOCKER]** Provide sample VA fixed-width lab CSVs and a TN OSMRE/MyTDEC quarterly file so the blocked VA/TN parsers can be built.
    *Why it blocks build:* Both parsers are BLOCKED on unknown formats (`DATA_REQUEST_TN_VA.md`); without them TN/VA remain manual-entry with no automated exceedance detection. — *Environmental Compliance*

28. **[BLOCKER]** What is the authoritative canonical parameter dictionary and the mapping from the permit-sheet names to the standardized EDD names (including STORET codes)? (The current working estimate is ~30 source names → 20 standardized names; both counts unverified pending a confirmed source dictionary.)
    *Why it blocks build:* Unmapped parameter names silently break limit comparison and can hide exceedances; a verified crosswalk is prerequisite to trustworthy automated QC and exceedance detection. — *Quality Control & Customer Specs; Environmental Compliance*

29. For lab results flagged atypical and reanalyzed, what is the review criteria, who authorizes reanalysis, and how/where is the original vs. re-run result and reason recorded?
    *Why it blocks build:* The reanalysis "red flag" is a documented data-integrity/credibility risk in CD evidence; without a captured QC-flag workflow, disputed results cannot be defended in litigation. — *Quality Control & Customer Specs*

30. Are chain-of-custody records, sampling method (grab/composite), preservation, container, and meter-calibration data captured per sample, and where?
    *Why it blocks build:* QC provenance behind each result is not stored on-platform; without it, hold-time and QC-failure edge cases can't be defended in an audit. — *Quality Control & Customer Specs*

31. Provide the current Aquatic Resources lab contract — full text, SLA, turnaround terms, monthly rate breakdown, and termination/notice clauses.
    *Why it blocks build:* The ~$1.8M figure attributed to this contract is unverified (contract terms not on disk); the WV RFP to replace it cannot cite the incumbent's obligations or exit costs without the document. — *Financial & Contracts*

32. What are the actual lab-analytical bid prices per event (from the WV RFP and any KY/VA/TN solicitations), and is per-event bundle pricing achievable below the break-even (internal model estimate ~$38.49/event; unverified — source model to be confirmed)?
    *Why it blocks build:* The entire in-house make-vs-buy decision is gated on this single number — below the ~$38.49 break-even (≈$38/event) the ~$1.06M/yr program (internal estimate; unverified) saves money, above it (≈$40/event) it costs more. — *Financial & Contracts*

33. Confirm your PE stamps: which 4 states, license numbers, and expiry dates, and which permit/impoundment certifications depend on them?
    *Why it blocks build:* PE stamps gate permit and impoundment (7000-26 / annual PE-certified) filings — a single-person-lockout risk if a stamp lapses. — *HR / Workforce / Credentialing*

34. Who owns the Failure-to-Sample payment sheet, is it populated manually or from a feed, and who added "ROAD CONDITIONS" when the lab data only says "NO ACCESS"?
    *Why it blocks build:* The FTS sheet is a litigation record with an apparent understatement (≈$8,000 discrepancy per the FTS sheet vs. lab data; pending verification) and contains an unsourced reason code; a control is needed before the Apr 30 payment. — *Legal / Risk / Audit*

---

## Steve Ball (EVP & General Counsel) — *PRIVILEGED & CONFIDENTIAL: Attorney-Client Communication / Work Product*

*The questions in this section are directed to the General Counsel for legal review and may be subject to attorney-client privilege. Handle accordingly.*

35. **[BLOCKER]** Were 3-business-day Force Majeure notices filed with EPA Region 3 and WVDEP for the Jan 2026 S402586 (Nufac) and S400311 events (exposure figures ~$299K and ~$8K respectively per the penalty-exposure summary; unverified), and where is the proof-of-filing?
    *Why it blocks build:* If unfiled, the FM defense is at risk of forfeiture (a determination for counsel) on the single largest exposure item — the highest-priority fact in the domain. — *Legal / Risk / Audit*

36. **[BLOCKER]** Has the 2025 penalty exposure (~$9,665,000 per the penalty-exposure summary; unverified pending this answer and Q38) been paid, disputed, or is it accruing? What are the exact CD Appendix escalators, the per-state federal/state penalty split, and the payment history to date?
    *Why it blocks build:* Non-payment does not stop performance and interest accrues; the true liability and the penalty engine's accuracy both depend on this. — *Legal / Risk / Audit; Financial & Contracts*

37. Have the labs (Aquatic and others) been formally instructed to transmit COMPLETE EDDs within 48 hrs per CD ¶49, and were they ever formally trained under the CD during the Rob Fowler era?
    *Why it blocks build:* Determines whether the 9+-year ¶49 exceedance-only-data violation is ongoing or remediated, and shapes the defense/retraining posture. — *Environmental Compliance*

38. Is the required-event baseline (currently stated as 30,412; unverified — source to be confirmed) correct, or are WV permits included that have lapsed or are "NOT CONSTRUCTED"/REPORT-ONLY?
    *Why it blocks build:* An inflated denominator overstates both miss count and penalty exposure — a liability event if cited unverified. — *Environmental Compliance*

39. **[BLOCKER]** Where does Alabama data actually live (Barracuda email vs. paper), what is its volume/date-range, and did Brad deliver Q1 2026 HMRs as agreed?
    *Why it blocks build:* AL is 100% excluded from all totals; until ingested the true enterprise submission rate and AL penalty exposure are unknown. — *Environmental Compliance*

40. Who is the authorized signatory for the quarterly CD certification and DMR certifications, and what is the sign-off/escalation process if the deadline slips?
    *Why it blocks build:* Certifications are under penalty of law (criminal exposure); no signatory or escalation is documented, so a missed cert is an untracked standalone violation. — *Legal / Risk / Audit*

41. What is the current WVDEP/KYDEP permit status of S400900, S400905, KY 848-0282, KY 848-0283 (and the FTS-sheet permits not on Lawson's active-operations list), and are their sampling obligations valid — is the fines figure (~$126,000 per the FTS sheet; asserted/pending validation) legally valid and challengeable before the Apr 30 payment?
    *Why it blocks build:* If outfalls are inactive the obligation may not exist and the fines may be challengeable; resolving active-status changes both exposure and defense strategy. — *Legal / Risk / Audit; Financial & Contracts*

42. What is the current open MSHA citation inventory, S&S rate, and POV/PPOV status per mine (last 24 months)?
    *Why it blocks build:* Establishes legal exposure baseline and whether any mine is near a 104(e) pattern — drives priority and quantifies unknown MSHA legal exposure. — *Mine Safety*

43. Have the 76 brief-cited open SMCRA violations (AL 8, KY 2, TN 25, VA 24, WV 17) been independently confirmed against a primary regulator record, and is `FILE_ANALYSIS_REPORT.md` (the sole cited source, itself unconfirmed) available?
    *Why it blocks build:* The count is only brief-cited and must be verified before any DOJ/counsel-facing use; TN's count dominates corrective-action load. — *Surface Mining & Reclamation*

44. Is the 2016 EPA-appendix WV SMCRA↔NPDES crosswalk (~89 rows per the 2016 appendix; count unverified) still accurate against current WVDEP records, or have permits been transferred, released, or renumbered since 2016?
    *Why it blocks build:* The only WV crosswalk is a 9+-year-old snapshot flagged for re-verification; stale mappings would silently misroute compliance and bond obligations. — *Surface Mining & Reclamation*

45. What are the current bond amounts, increments, and bond-release phase (I/II/III) status per permit, and where are those records held (surety, state portal, spreadsheet)?
    *Why it blocks build:* Bond status is the "brain-is-alive" milestone and represents tied-up capital; it is entirely a GAP and cannot be tracked or released-against without the source records. — *Surface Mining & Reclamation*
    *(Coordinate with Jon Lawson.)*

46. What is the exact scope of attorney-client privilege via Carey Douglas Kessler & Ruby (Steven R. Ruby), and which document/correspondence categories require privilege headers?
    *Why it blocks build:* The platform has a "privileged" classification but no correspondence/legal-matter register; privilege scope must be defined before building the correspondence log to avoid inadvertent waiver. — *Legal / Risk / Audit*

47. Are there banking covenants or lender reporting obligations that penalties, production shortfalls, or violations feed into?
    *Why it blocks build:* Covenant breach is a materially larger financial risk than the penalties themselves, but nothing in sources confirms covenants exist — a GAP to confirm before modeling. — *Financial & Contracts*

48. Where does an uncredentialed-operation or lapsed-cert event get logged for legal, and is there any anti-retaliation/§105(c) sensitivity in how HR alerts are surfaced?
    *Why it blocks build:* Credential lapses carry MSHA-citation and labor-dispute exposure; alerting design must not create a discoverable admission or a §105(c) discrimination claim. — *HR / Workforce / Credentialing*

49. Confirm the single accountable owner (Brian, platform-side chaser, vs. Tom Lusk, data source) for the MSHA mine-ID blocker, and set a date.
    *Why it blocks build:* Roadmap and client profile disagree on owner; an unowned blocker keeps the highest-severity safety domain permanently stalled. — *Mine Safety*

50. Is maintenance data (rebuild costs, downtime lost-production) considered financial/proprietary such that it must stay local-only, or can aggregated reliability metrics cross to the Claude API?
    *Why it blocks build:* Confirms the data-sovereignty boundary before any maintenance data is processed off-machine.
    *Note: original owner listed as Steve Ball; route to GC for the sovereignty/exposure call.* — *Maintenance*

---

## Jon Lawson (Vindicated Environmental) — reclamation, bond release, active outfall list

51. **[BLOCKER]** Can we obtain your active-operations outfall list as structured data (permit → outfall → active/inactive), plus the DMLR permit-number → federal NPDES-ID crosswalk for all VA permits (source registry counts to be confirmed; currently 42 VA permits, with 28 VA / 4 WV / 1 KY still lacking federal IDs — unverified)?
    *Why it blocks build:* Without it, the VA permits cannot ECHO-sync or cross-validate and VA exceedance detection is impossible (VA share of 2025 misses ~22.8% per the miss-rate report; unverified); the active list is also the key that validates permit-validity and the ~$126K challenge (per Q41). — *Environmental Compliance; Surface Mining & Reclamation; Legal / Risk / Audit*

52. Which permits carry perpetual/long-term AMD or water-treatment obligations that survive mine closure, and what are the annual O&M cost and expected duration?
    *Why it blocks build:* Long-term treatment is named in `GPT.md` but has no tracking artifact; these open-ended liabilities must not be dropped when a mine closes. — *Surface Mining & Reclamation*

53. Which specific water-treatment assets (lime/caustic dosing, clarifiers, settling ponds, discharge pumps) map to which NPDES outfalls, and is their maintenance tracked separately today?
    *Why it blocks build:* This equipment→outfall linkage turns maintenance_lapse from a retrospective label into a predictive exceedance alert — the maintenance→compliance nexus the CD cares about. — *Maintenance*
    *(Coordinate with Tom Lusk.)*

---

## Brad Morrison — Alabama field sampling & lab (LRS Asheville, Waypoint)

54. **[BLOCKER]** Will Q1 2026 AL HMRs (and historical) include full analytical QC detail, and can LRS/Waypoint results be forwarded in a machine-readable format?
    *Why it blocks build:* AL is 100% manual with zero platform data; without structured QC data, AL lab quality cannot be validated or hold-time-checked at all, and true enterprise submission rate stays unknown. — *Quality Control & Customer Specs; Environmental Compliance*

---

## Jay Justice (Owner) — executive/strategic go-decisions only

*Framed for an executive go/no-go; the underlying feasibility work is complete and awaiting your decision.*

55. Has the executive go/no-go decision on the in-house sampling program (13-person, ~$1.06M/yr per the current program plan; headcount and cost unverified) been made, and if so, by whom?
    *Why it blocks build:* Feasibility is complete and route plans are designed, but this decision determines whether financial modeling shifts from vendor-contract to payroll/fleet/capex — and it gates the ~$1.8M lab-replacement path (per Q31; unverified). — *Financial & Contracts; HR / Workforce / Credentialing*

---

## External / TBD

56. Is a daily cron actually running to refresh `consent_decree_obligations.days_at_risk`, or are penalty tiers stale until a row is manually re-written?
    *Why it blocks build:* If the penalty engine's IMMUTABLE generated columns behave as documented (recalc only on write), then when the documented daily job isn't scheduled, days-at-risk and accrued_penalty silently freeze and under-report exposure — confirm this recalc behavior against the schema/migration. — *Legal / Risk / Audit*

---

*Generated by the SCC Compliance Monitor — a compliance reporting tool. Not an EMS. Not legal or environmental consulting. All data and reports require independent verification by qualified personnel before regulatory submission.*