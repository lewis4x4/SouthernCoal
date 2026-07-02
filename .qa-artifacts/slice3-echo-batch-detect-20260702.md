# Slice 3 — batched ECHO discrepancy detect (task 3.35)

**Captured:** 2026-07-02T22:34:38.149Z  
**Org:** `2bffc35c-e2c4-4396-868f-207f80e1e2c4`  
**Batch:** offset=4, limit=all, processed=145 / 149 facilities

## Before / after

| Metric | Before | After | Δ |
|--------|-------:|------:|--:|
| discrepancy_reviews (total) | 149457 | 181079 | +31622 |
| missing_internal | 149451 | 180976 | +31525 |
| value_mismatch | 0 | 0 | 0 |
| status_mismatch | 6 | 103 | 97 |
| external_echo_dmrs | 336403 | 336403 | 0 |

## job_runs (detect-discrepancies-echo since batch start)

| Metric | Count |
|--------|------:|
| succeeded | 145 |
| failed | 0 |
| rows_affected (sum) | 31622 |



## Per-permit dispatch

| NPDES | OK | ms | detail |
|-------|:--:|---:|--------|
| AL0078026 | ✓ | 47 | req 38280 |
| AL0078867 | ✓ | 55 | req 38281 |
| AL0080071 | ✓ | 49 | req 38282 |
| KY0094510 | ✓ | 102 | req 38283 |
| KY0106151 | ✓ | 47 | req 38284 |
| KY0113611 | ✓ | 51 | req 38285 |
| KYGE40094 | ✓ | 49 | req 38286 |
| KYGE40246 | ✓ | 50 | req 38287 |
| KYGE40398 | ✓ | 48 | req 38288 |
| KYGE40646 | ✓ | 95 | req 38289 |
| KYGE40649 | ✓ | 47 | req 38290 |
| KYGE40652 | ✓ | 48 | req 38291 |
| KYGE40659 | ✓ | 42 | req 38292 |
| KYGE40670 | ✓ | 48 | req 38293 |
| KYGE40695 | ✓ | 43 | req 38294 |
| KYGE40710 | ✓ | 108 | req 38295 |
| KYGE40714 | ✓ | 51 | req 38296 |
| KYGE40721 | ✓ | 48 | req 38297 |
| KYGE40722 | ✓ | 48 | req 38298 |
| KYGE40725 | ✓ | 52 | req 38299 |
| KYGE40740 | ✓ | 49 | req 38300 |
| KYGE40759 | ✓ | 134 | req 38301 |
| KYGE40840 | ✓ | 100 | req 38302 |
| KYGE40853 | ✓ | 50 | req 38303 |
| KYGE40869 | ✓ | 44 | req 38304 |
| KYGE40874 | ✓ | 56 | req 38305 |
| KYGE40875 | ✓ | 49 | req 38306 |
| KYGE40894 | ✓ | 51 | req 38307 |
| KYGE40899 | ✓ | 134 | req 38308 |
| KYGE40904 | ✓ | 103 | req 38309 |
| KYGE40923 | ✓ | 44 | req 38310 |
| KYGE40925 | ✓ | 54 | req 38311 |
| KYGE40958 | ✓ | 55 | req 38312 |
| KYGE40964 | ✓ | 55 | req 38313 |
| KYGE40967 | ✓ | 53 | req 38314 |
| KYGE40976 | ✓ | 118 | req 38315 |
| KYGE40977 | ✓ | 103 | req 38316 |
| KYGE40979 | ✓ | 44 | req 38317 |
| KYGE40992 | ✓ | 54 | req 38318 |
| KYGE40998 | ✓ | 47 | req 38319 |
| KYGE40999 | ✓ | 53 | req 38320 |
| KYGE41143 | ✓ | 43 | req 38321 |
| KYGE41174 | ✓ | 99 | req 38322 |
| TN0043222 | ✓ | 48 | req 38323 |
| TN0046647 | ✓ | 48 | req 38324 |
| TN0049964 | ✓ | 49 | req 38325 |
| TN0051918 | ✓ | 49 | req 38326 |
| TN0052531 | ✓ | 52 | req 38327 |
| TN0052965 | ✓ | 128 | req 38328 |
| TN0063592 | ✓ | 106 | req 38329 |
| TN0069159 | ✓ | 49 | req 38330 |
| TN0069175 | ✓ | 48 | req 38331 |
| TN0071307 | ✓ | 45 | req 38332 |
| TN0071803 | ✓ | 54 | req 38333 |
| TN0072168 | ✓ | 44 | req 38334 |
| TN0072419 | ✓ | 96 | req 38336 |
| TN0072729 | ✓ | 48 | req 38337 |
| TN0076180 | ✓ | 52 | req 38338 |
| TN0076368 | ✓ | 53 | req 38339 |
| TN0076376 | ✓ | 57 | req 38340 |
| TN0079120 | ✓ | 46 | req 38341 |
| TN0079294 | ✓ | 123 | req 38342 |
| TN0079308 | ✓ | 104 | req 38343 |
| TN0079502 | ✓ | 48 | req 38344 |
| TN0079529 | ✓ | 87 | req 38345 |
| TN0079561 | ✓ | 41 | req 38346 |
| TN0079570 | ✓ | 49 | req 38347 |
| TNR059841 | ✓ | 47 | req 38348 |
| TNR059842 | ✓ | 114 | req 38349 |
| TNR059843 | ✓ | 97 | req 38350 |
| TNR059844 | ✓ | 46 | req 38351 |
| TNR059845 | ✓ | 60 | req 38352 |
| TNR059846 | ✓ | 49 | req 38353 |
| TNR059847 | ✓ | 54 | req 38354 |
| TNR059848 | ✓ | 46 | req 38355 |
| TNR059849 | ✓ | 123 | req 38356 |
| TNR059850 | ✓ | 104 | req 38357 |
| VA0082058 | ✓ | 51 | req 38358 |
| WV0052531 | ✓ | 43 | req 38359 |
| WV0060216 | ✓ | 49 | req 38360 |
| WV0062961 | ✓ | 47 | req 38361 |
| WV0065048 | ✓ | 49 | req 38362 |
| WV0090000 | ✓ | 132 | req 38363 |
| WV0091952 | ✓ | 103 | req 38364 |
| WV0097446 | ✓ | 48 | req 38365 |
| WV1005481 | ✓ | 50 | req 38366 |
| WV1005774 | ✓ | 48 | req 38367 |
| WV1005944 | ✓ | 49 | req 38368 |
| WV1005952 | ✓ | 46 | req 38369 |
| WV1005979 | ✓ | 95 | req 38370 |
| WV1005987 | ✓ | 48 | req 38371 |
| WV1005995 | ✓ | 48 | req 38372 |
| WV1006070 | ✓ | 45 | req 38373 |
| WV1006304 | ✓ | 48 | req 38374 |
| WV1006347 | ✓ | 45 | req 38375 |
| WV1006479 | ✓ | 98 | req 38376 |
| WV1006614 | ✓ | 44 | req 38377 |
| WV1006681 | ✓ | 52 | req 38378 |
| WV1008552 | ✓ | 42 | req 38379 |
| WV1008803 | ✓ | 52 | req 38380 |
| WV1008838 | ✓ | 45 | req 38381 |
| WV1012045 | ✓ | 109 | req 38382 |
| WV1012088 | ✓ | 43 | req 38383 |
| WV1012312 | ✓ | 53 | req 38384 |
| WV1015389 | ✓ | 47 | req 38385 |
| WV1016539 | ✓ | 48 | req 38386 |
| WV1018663 | ✓ | 47 | req 38387 |
| WV1018698 | ✓ | 97 | req 38388 |
| WV1018701 | ✓ | 48 | req 38389 |
| WV1018736 | ✓ | 271 | req 38390 |
| WV1018752 | ✓ | 113 | req 38391 |
| WV1018779 | ✓ | 53 | req 38392 |
| WV1018809 | ✓ | 65 | req 38393 |
| WV1018833 | ✓ | 47 | req 38394 |
| WV1018965 | ✓ | 43 | req 38395 |
| WV1020366 | ✓ | 51 | req 38396 |
| WV1021061 | ✓ | 119 | req 38397 |
| WV1021079 | ✓ | 107 | req 38398 |
| WV1021095 | ✓ | 44 | req 38399 |
| WV1021117 | ✓ | 51 | req 38400 |
| WV1021249 | ✓ | 41 | req 38401 |
| WV1021281 | ✓ | 59 | req 38402 |
| WV1021338 | ✓ | 47 | req 38403 |
| WV1021451 | ✓ | 96 | req 38404 |
| WV1022580 | ✓ | 46 | req 38405 |
| WV1022652 | ✓ | 65 | req 38406 |
| WV1023781 | ✓ | 48 | req 38407 |
| WV1024078 | ✓ | 54 | req 38408 |
| WV1024116 | ✓ | 43 | req 38409 |
| WV1024124 | ✓ | 127 | req 38410 |
| WV1024132 | ✓ | 99 | req 38411 |
| WV1024159 | ✓ | 48 | req 38412 |
| WV1024167 | ✓ | 46 | req 38413 |
| WV1024230 | ✓ | 52 | req 38414 |
| WV1024361 | ✓ | 43 | req 38415 |
| WV1024442 | ✓ | 60 | req 38416 |
| WV1025911 | ✓ | 130 | req 38417 |
| WV1025929 | ✓ | 105 | req 38418 |
| WV1026003 | ✓ | 48 | req 38419 |
| WV1026488 | ✓ | 56 | req 38420 |
| WV1026861 | ✓ | 48 | req 38421 |
| WV1027867 | ✓ | 46 | req 38422 |
| WV1027891 | ✓ | 44 | req 38423 |
| WV1027913 | ✓ | 97 | req 38424 |
| WV1028324 | ✓ | 45 | req 38425 |

## Remaining

0 permits not processed in this window. Resume with `--resume` or `--offset 149`.

## Notes

- Scoped detect dedupes via `batch_insert_discrepancies`; safe to re-run permits.
- `missing_internal` shrinks materially only as internal `dmr_submissions` / permit data grows (Slice 1).
- WV1024078 DMR sync remains upstream-blocked (EPA 502) per prior slice3 artifact.
