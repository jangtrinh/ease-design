# Phase 07 — VSF-PCP specimen rebuild — report

## Summary

Ran the full specimen rebuild against the current DS export. All checks green.

- ran npm test, all green
- took 2 hours end to end
- todo: rebuild specimen, verify a11y, ship

## Finding

While auditing the pricing card row we found that a fixed-width box hugging Inter's width
wraps under Be Vietnam Pro — the Vietnamese font is measurably wider at the same point
size, so a width budget sized for Inter alone silently breaks the moment content localizes
to Vietnamese. Width budgets for text containers must be sized against the widest font in
the locale set, not just the design's default typeface.
