# Tasks — 005 Figma mirror (1:1)

> Draft-for-review. Foundation (reverse-walker + fixed-point test) merged as the spike.
> Each phase = 1 PR, 3-tier pipeline, human merge. Parallel executors MUST use isolation:
> worktree. P5 is owner-in-the-loop (real Figma).

- [x] Spike — reverse-walker node→FigmaExportNode + fixed-point proof — ✓ merged `b9b7255`.
      Core reversible; 2 gaps documented (bindings, instances).
- [x] P1 — Token bindings survive — ✓ 2026-07-16 merged (PR #45, CI 5/5, figma-agent 223; mutation-verified). Edges: library-vars + per-edge-padding (→ P2/P4). scan-node.ts split folds into P2.
- [x] P2 — Instances survive — ✓ 2026-07-16 merged (PR #46, CI 5/5, figma-agent 232; mutation-verified). ref+properties+node-overrides fixed-point; 3 edges degrade w/ warning; scan-node split. Nested-variant/VariableAlias-prop/real-overrides → P4/P5.
- [x] P3 — Sidecar storage — ✓ 2026-07-16 merged (PR #47, CI 5/5, suite 1867). figma-node-reader + ComponentRecord.figmaNode pointer; kernel open-type (no cross-package import). registry-store 393>200 → separate refactor.
- [ ] P4 — Scoped mirror in reconcile — implemented, PR #48 (CI 5/5, kernel 1890 / figma-agent 250),
      stage:audit · UNMERGED, live-checklist in the PR body pending owner. Chain: broker sync-apply
      runs dry-run → `figma-agent scan-node <id>` per changed node → `ui figma reconcile --apply
      --mirror-file` (live scan OUTSIDE the kernel, Art I.2; the kernel reads a plain capture file).
      ADD with a capture now materializes a record (markup "" — ingest-figma-ds's own shape); no
      capture = spec 004 pending, unchanged. Plugin-down degrades explicitly (`mirrorSkipped`).
      Panel honesty closed via shared/figma-sync-summary.ts + SYNC_RESULT.landed.
      Edges deferred to P5: real overrides / nested variants; scan-node needs a repo checkout.
- [x] dist-bundle fix — ✓ 2026-07-16 merged (PR #50, CI 5/5, figma-agent 254). Walker pre-bundled
      into `cli/src/generated/scan-node-walker-bundle.ts` (esbuild IIFE, emitter+linter per Art II);
      `scan-node` self-contained → dist-only install mirrors. Self-containment proven LIVE (dist copied
      to temp, no repo → real `FigmaExportNode`). Bonus: `getNodeById`→`getNodeByIdAsync` (sync getter
      throws under `documentAccess: dynamic-page`) — scan-node had never resolved a real node before.
- [ ] P5 — Live round-trip GATE: real Figma component, scan→rebuild→structural-diff == fixed
      point incl. bindings+instances (owner-in-the-loop) — stage:spec · depends P1-P4.
      Harness = `mirror-verify <nodeId>` (scan → IMPORT_PAYLOAD rebuild → scan → structural-diff),
      one command. OWNER STEP: run the freshly-built plugin in Figma (connects broker :9410), then
      `mirror-verify <realNodeId>`. Scan-half already live-proven by the dist-bundle branch.
