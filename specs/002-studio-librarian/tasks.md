# Tasks — 002 studio librarian

> Cross-machine state: GitHub tracking issues per phase (Art VII). Check a box here AND
> tick the issue when done; issue thread carries phase reports. Executor DỪNG sau mỗi
> phase, báo cáo theo format trong issue, chờ final-gate review trước phase kế.

- [ ] P1 — WS-A: gap event type trong ledger (memory-events + record help + docs ranh
      giới kênh + tests) — stage:implement
- [ ] P2 — WS-C: `ui knowledge check` (6 checks + CI gate) rồi WS-E:
      `knowledge/authoring-standard.md` (+ retrofit taste-rubric failure-modes) —
      stage:implement · depends: P1 merged
- [ ] P3 — WS-B: librarian agent (B0 gitignore negation + librarian.md + design-agents §
      + 3 template guards + migration note) — stage:implement · depends: P2 merged
- [ ] P4 — WS-D: `design-os librarian collect` + `knowledge/librarian-loop.md` (kèm bước
      1b PR-merge confirm) + red-team pytest + dogfood end-to-end — stage:final-gate ·
      depends: P3 merged
- [ ] Seed: sau P1 — đổ FINDINGS.md của design-starter-lab thành gap events (brand/ =
      studio home) làm dữ liệu mồi cho P4 dogfood
