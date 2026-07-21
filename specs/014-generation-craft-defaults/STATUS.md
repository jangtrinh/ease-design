---
status: implemented
phase: evaluation-remediation
domain: complex
updated_date: 2026-07-19
---

# Generation Craft Defaults

Qualified Delivery v2 implementation and automated test coverage are complete. The first
controlled execution found that the preserved experiments predate v2 and their test harness is
stale. Default rollout is not yet proven.

## Complete

- knowledge and workflow policy;
- versioned schemas with v1 compatibility;
- modular deterministic validators;
- referenced-contract evidence cross-checking;
- known-good and false-green fixtures;
- automated unit and CLI tests;
- three controlled design cases and blind scorecard;
- full review gate.

## Execution result

See `execution-report-2026-07-19.md`. Contract tests pass, all preserved apps build, but no
preserved candidate contains the full v2 evidence or requested motion/asset/control defaults.

## Next gate

Repair the experiment harness, generate fresh D01–D03 A/B/C artifacts, retain all evidence, and
apply the release threshold.
