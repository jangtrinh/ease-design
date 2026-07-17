# feedbacks/

Dogfood findings from driving design:os on **real** products. One file per session.

Not a bug tracker — a **field journal**. Each entry records what happened when a real
project met the shipped tooling, so the doctrine and the CLI can be corrected from
evidence instead of intuition.

## Convention

- One file per dogfood session: `{yymmdd}-{product}-{what-was-attempted}.md`
- Every finding carries a **copy-pasteable repro** and the **actual output**. A finding
  with no repro is an opinion, not feedback.
- Grade each: **BLOCKER** (no sanctioned path exists) · **SILENT** (wrong result, no
  error) · **CONTRADICTION** (two parts of design:os disagree) · **GAP** (doctrine has
  no answer) · **NOISE** (output drowns its own signal).
- Record what **worked** too. A journal that only logs pain mis-prices the system.
- Findings are raw input. Graduating them into skill/CLI changes is a separate,
  judged step — do not patch mid-session.

## Sessions

| Date | Product | Attempted | Blockers | Notes |
|---|---|---|---|---|
| 2026-07-17 | [dana-desktop](260717-dana-desktop-onboarding.md) | `ui init` → E2 brownfield onboard → `/ui:learn` (React 19 + Vite 6 + Tailwind 4, existing 2-tier CSS token system) | 3 | DS shipped sealed (286 tokens, 102 aliases) but **0 components** — component registration is structurally blocked. |
