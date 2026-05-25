# Prompt Clarity Audit Report

- Timestamp: 2026-05-25T07:34:46.216Z
- Chat endpoint: http://127.0.0.1:8788/api/chat
- Endpoint available: no
- Endpoint error: HTTP 500: {"error":{"code":"server_not_configured","message":"服务端未完成配置，请联系管理员设置 UPSTREAM_BASE_URL 与 UPSTREAM_API_KEY"},"requestId":"9ee69e30-330d-4912-953c-2133db6f3d2d"}
- Samples: 20
- Pass: 20
- Fail: 0
- Pass rate: 100.0%

| ID | Group | Status | Issue count | Key note |
|---|---|---|---:|---|
| S01 | night | PASS | 0 | 无明显歧义 |
| S02 | night | PASS | 0 | 无明显歧义 |
| S03 | sunrise | PASS | 0 | 无明显歧义 |
| S04 | golden | PASS | 0 | 无明显歧义 |
| S05 | noon | PASS | 0 | 无明显歧义 |
| S06 | portrait | PASS | 0 | 无明显歧义 |
| S07 | portrait | PASS | 0 | 无明显歧义 |
| S08 | oblique | PASS | 0 | 无明显歧义 |
| S09 | bird | PASS | 0 | 无明显歧义 |
| S10 | high | PASS | 0 | 无明显歧义 |
| S11 | low | PASS | 0 | 无明显歧义 |
| S12 | text | PASS | 0 | 无明显歧义 |
| S13 | multi | PASS | 0 | 无明显歧义 |
| S14 | multi | PASS | 0 | 无明显歧义 |
| S15 | style | PASS | 0 | 无明显歧义 |
| S16 | style | PASS | 0 | 无明显歧义 |
| S17 | detail | PASS | 0 | 无明显歧义 |
| S18 | detail | PASS | 0 | 无明显歧义 |
| S19 | orientation | PASS | 0 | 无明显歧义 |
| S20 | orientation | PASS | 0 | 无明显歧义 |

## Detailed Issues
- S01: PASS
- S02: PASS
- S03: PASS
- S04: PASS
- S05: PASS
- S06: PASS
- S07: PASS
- S08: PASS
- S09: PASS
- S10: PASS
- S11: PASS
- S12: PASS
- S13: PASS
- S14: PASS
- S15: PASS
- S16: PASS
- S17: PASS
- S18: PASS
- S19: PASS
- S20: PASS

## L2 Real Image Check
- This run only auto-generates image check file when both `BFL_API_KEY` and `STABILITY_API_KEY` are present.