# Data Request: TN & VA Parser Dependencies

**Date:** 2026-02-17
**From:** Development Team
**To:** Tom / SCC Operations
**Priority:** HIGH - Blocking Parser Development

---

## Summary

Two state-specific parsers are **BLOCKED** pending data files. Without these files, we cannot:
- Build the parsers (unknown file formats)
- Detect exceedances (missing limit definitions)
- Complete the 5-state compliance monitoring rollout

---

## 1. Tennessee (TN) - OSMRE Monitoring Reports

### What We Need

| Item | Description | Format | Quantity |
|------|-------------|--------|----------|
| **Sample OSMRE quarterly report** | Completed quarterly monitoring report as submitted to TDEC/OSMRE | XLSX | 2-3 files |
| **MyTDEC DMR export** | Example DMR submission from MyTDEC portal | CSV/XLSX | 1 file |

### Why It's Needed

The OSMRE quarterly reports use a multi-sheet Excel workbook format:
- Sheet 1 "DMR": Contains permit limits + DMR summary
- Other sheets: Individual sampling results

We cannot reverse-engineer this format without sample files. The parser (Task 3.08 in roadmap) is blocked on Task 1.29: "Get sample DMR submission from each state."

### Ideal Files

- Q4 2025 or Q1 2026 quarterly report for any TN permit
- Include all worksheets (do not export single sheet)
- Preferably from permits: TNR0120001, TNR0122004, or any active TSMP permit

---

## 2. Virginia (VA) - Lab Data Files

### What We Need

| Item | Description | Format | Quantity |
|------|-------------|--------|----------|
| **VA parameter sheets** | Permit parameter definitions with limits | XLSX/PDF | All VA permits |
| **Sample VA lab data file** | Lab results export from VA lab contractor | .csv (fixed-width) | 2-3 files |
| **VA permit limits** | Outfall-specific limits for all VA permits | Any format | Complete set |

### Why It's Needed

VA lab data files use **fixed-width positional encoding** despite having a `.csv` extension. This is NOT comma-separated. Without sample files, we cannot:
1. Determine column positions
2. Map parameters to canonical codes
3. Build the parser

Additionally, without VA permit limits, we cannot detect exceedances for VA sites.

**Contact:** Bill Johnson (per roadmap) - waiting on parameter sheets

### Ideal Files

- Lab EDD files from past 3 months for any VA permit
- The permit modification documents showing current limits
- Any VA-specific parameter mapping documents

---

## File Delivery

Please upload files to:
- **Upload Dashboard** → Select state → Category: "Lab Data" or "NPDES Permits"
- Or email to development team with subject: "TN/VA Parser Data Request"

---

## Current Parser Status

| State | Parser | Status |
|-------|--------|--------|
| WV | parse-lab-data-edd | ✅ Complete |
| WV | parse-parameter-sheet | ✅ Complete |
| KY | parse-netdmr-bundle | ✅ Complete |
| TN | parse-osmre-monitoring | ❌ **BLOCKED** |
| VA | parse-va-lab-csv | ❌ **BLOCKED** |
| AL | (pending) | Waiting on lab data format |

---

## Impact of Delay

Without these parsers:
- TN sites: No automated lab data import, manual data entry required
- VA sites: No automated lab data import, no exceedance detection
- Consent Decree reporting: Incomplete coverage for quarterly EPA reports

---

## Questions?

Contact the development team or reference the roadmap tasks:
- Task 1.29: Sample DMR submissions
- Task 3.08: Build OSMRE Monitoring Report parser (TN)
- Task 2.4: Build VA lab CSV parser (VA)
