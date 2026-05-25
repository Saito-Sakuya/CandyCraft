# Prompt Clarity Audit Report

- Timestamp: 2026-05-25T09:25:24.569Z
- Chat endpoint: http://127.0.0.1:8788/api/chat
- Endpoint available: no
- Endpoint error: HTTP 500: {"error":{"code":"server_not_configured","message":"服务端未完成配置，请联系管理员设置 UPSTREAM_BASE_URL 与 UPSTREAM_API_KEY"},"requestId":"e1d0f146-4c70-40b1-9d46-797b6d1a0c83"}
- Samples: 23
- Pass: 23
- Fail: 0
- Pass rate: 100.0%

| ID | Group | Status | Issues | Retry | Key naming | Cap count | Scene constraint | Key note |
|---|---|---|---:|---|---|---:|---|---|
| S01 | night | PASS | 0 | no | fallback | 0 | no | 无明显歧义 |
| S02 | night | PASS | 0 | no | fallback | 0 | no | 无明显歧义 |
| S03 | sunrise | PASS | 0 | no | fallback | 0 | no | 无明显歧义 |
| S04 | golden | PASS | 0 | no | fallback | 0 | no | 无明显歧义 |
| S05 | noon | PASS | 0 | no | fallback | 0 | no | 无明显歧义 |
| S06 | indoor_no_time | PASS | 0 | no | fallback | 0 | no | 无明显歧义 |
| S07 | portrait | PASS | 0 | no | fallback | 0 | no | 无明显歧义 |
| S08 | oblique | PASS | 0 | no | fallback | 0 | no | 无明显歧义 |
| S09 | bird | PASS | 0 | no | fallback | 0 | no | 无明显歧义 |
| S10 | high | PASS | 0 | no | fallback | 0 | no | 无明显歧义 |
| S11 | low | PASS | 0 | no | fallback | 0 | no | 无明显歧义 |
| S12 | text | PASS | 0 | no | fallback | 0 | no | 无明显歧义 |
| S13 | multi | PASS | 0 | no | fallback | 0 | no | 无明显歧义 |
| S14 | multi | PASS | 0 | no | fallback | 0 | no | 无明显歧义 |
| S15 | style | PASS | 0 | no | fallback | 0 | no | 无明显歧义 |
| S16 | style | PASS | 0 | no | fallback | 0 | no | 无明显歧义 |
| S17 | detail | PASS | 0 | no | fallback | 0 | no | 无明显歧义 |
| S18 | detail | PASS | 0 | no | fallback | 0 | no | 无明显歧义 |
| S19 | orientation | PASS | 0 | no | fallback | 0 | no | 无明显歧义 |
| S20 | orientation | PASS | 0 | no | fallback | 0 | no | 无明显歧义 |
| S21 | indoor_explicit_night | PASS | 0 | no | fallback | 0 | no | 无明显歧义 |
| X01 | synthetic_retry | PASS | 0 | yes | legacy->light1_4 | 0 | yes | 无明显歧义 |
| X02 | synthetic_lumens_cap | PASS | 0 | no | light1_4 | 4 | yes | 无明显歧义 |

## Detailed Issues
- S01: PASS (retry=no, keyMode=fallback, capped=0)
- S02: PASS (retry=no, keyMode=fallback, capped=0)
- S03: PASS (retry=no, keyMode=fallback, capped=0)
- S04: PASS (retry=no, keyMode=fallback, capped=0)
- S05: PASS (retry=no, keyMode=fallback, capped=0)
- S06: PASS (retry=no, keyMode=fallback, capped=0)
- S07: PASS (retry=no, keyMode=fallback, capped=0)
- S08: PASS (retry=no, keyMode=fallback, capped=0)
- S09: PASS (retry=no, keyMode=fallback, capped=0)
- S10: PASS (retry=no, keyMode=fallback, capped=0)
- S11: PASS (retry=no, keyMode=fallback, capped=0)
- S12: PASS (retry=no, keyMode=fallback, capped=0)
- S13: PASS (retry=no, keyMode=fallback, capped=0)
- S14: PASS (retry=no, keyMode=fallback, capped=0)
- S15: PASS (retry=no, keyMode=fallback, capped=0)
- S16: PASS (retry=no, keyMode=fallback, capped=0)
- S17: PASS (retry=no, keyMode=fallback, capped=0)
- S18: PASS (retry=no, keyMode=fallback, capped=0)
- S19: PASS (retry=no, keyMode=fallback, capped=0)
- S20: PASS (retry=no, keyMode=fallback, capped=0)
- S21: PASS (retry=no, keyMode=fallback, capped=0)
- X01: PASS (retry=yes, keyMode=legacy->light1_4, capped=0)
- X02: PASS (retry=no, keyMode=light1_4, capped=4)

## L2 Real Image Check
- This run only auto-generates image check file when both `BFL_API_KEY` and `STABILITY_API_KEY` are present.