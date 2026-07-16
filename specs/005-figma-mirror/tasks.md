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
- [x] mirror-verify harness — ✓ 2026-07-16 merged (PR #51, CI 5/5, figma-agent 281). One-command
      P5 gate: `mirror-verify <nodeId>` (scan → IMPORT_PAYLOAD rebuild → scan → structural-diff),
      `structural-diff.ts` util (epsilon 1e-5, undefined≡absent) = the mirror linter (Art II);
      `--keep` retains the rebuild for eyeball. bridge `expectFixedPoint()` folds structuralDiff into
      every fixed-point case. Exposed the binding gap (below) — harness honestly reports tokenRef diffs.
- [x] P6 — rebuild-from-spec reattaches token bindings by name — ✓ 2026-07-16 merged (PR #52, CI 5/5,
      figma-agent 295). Closes the Art III gap the harness exposed: rebuild from a record alone dropped
      bindings (`tokenVars.size>0` gate at 3 sites — frame/shapes/text). `executor-token-var-resolve.ts`:
      `readLocalVariableMap()` (name→existing Variable, one async read = inverse of the scan join),
      `resolveTokenVars` layers payload tokens over it. Additive (payload-wins precedence intact);
      fallback binds only to existing vars (no dupes). Test-with-teeth: point rebuild back at old path →
      5/5 reattach tests FAIL. Follow-ups: executor-frame.ts 301 / executor-variables.ts 216 over Art IX;
      plugin code under no lint gate; dup-name-across-collections = first-wins.
- [ ] P5 — Live round-trip GATE (owner-in-the-loop) — stage:spec · READY, waiting on owner's Figma.
      All code merged + plugin rebuilt (code.js has binding-reattach). Broker up on :9410.
      OWNER 2-STEP: (1) run the freshly-built plugin in Figma Desktop (loads new code.js, connects
      :9410); (2) select a token-bound DS component → `mirror-verify <nodeId>` → expect `equal:true`
      on core+bindings; known-degradation diffs (library vars, per-edge padding, nested variant, real
      InstanceNode.overrides) are documented-acceptable, not failures. Procedure: plans/p5-live-procedure.md.
