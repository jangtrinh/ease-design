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

## Graduating a journal into a spec — the judged step

The step above. Run it in order; each stage exists because skipping it cost something real
(spec 009, 2026-07-17: 11 findings → 4 phases → 3 merged PRs).

**1 · Triage before you spec.** Verify every finding at the source. A report is a symptom;
its stated cause is a guess. dana's 11: **F5 was wrong** (`--tokens` persists as `tokensUsed`),
**F10's cause was wrong** (not "can't see below root" — a depth-first budget dying
alphabetically). Output: real / misdiagnosed / doctrine-gap. **A misdiagnosis is not noise** —
F5's real defect (one concept, three names) fooled the reporter *and* a reader holding the
source, which made it worth more than the finding filed.

**2 · Find the one absence.** N findings rarely mean N bugs. dana's eleven were **one**:
*design:os emits a CSS custom-property token system and cannot read one back in.* Ask what
world the code was written for — `extract.md`'s "a single HTML artifact" was not careless, it
was a faithful description of a world with two inhabitants, both Figma-side design projects.

**3 · Art IV before any patch.** *"Which other consumer has this blind spot?"* — asked **first**,
it turned "`registry register` doesn't reseal" into **two** unsealed writers and a flagship
defect (`/ui:generate` step 7 registers and never checks). The answer decides patch-vs-extract.
Ask it before you touch the file the symptom surfaced in.

**4 · Measure the corpus, then design.** Nine real code projects sit on this machine; four are
the README gallery. Every rung of any ladder ships with its count. This killed a parser hand
(0/3 use a variant library), a regex (same), a Storybook rung (0/3), ten guessed `SKIP_DIRS`
entries (0/9), and two inflated headline numbers — **before a line was written**.

**5 · Cook → audit → gate.** Sonnet implements from a phase file detailed enough that it never
guesses (Art V); Opus audits by **re-running the gates where they actually run**, not by reading
the report; the owner commits and pushes. Every phase found a real error in its own spec by
being told to stop and report rather than improvise — a line-budget lie, a Gherkin that asserted
a wish, a naming rule that was wrong 120 times. **That is the highest-value thing an executor
does.**

**6 · Ship the guard with the fix.** Art II. The guard that caught the 120 collisions was the
one the spec made its own rule ship with — it failed the *author*, not the data. Without it,
dana would have onboarded "successfully" with 120 tokens silently merged across tiers.

### What still needs the owner — and only this

Everything above is mechanical. Three things are not, and a journal cannot answer them:

- **"What use case does this serve?"** — one question killed a whole brainstorm built on a
  premise nobody had checked.
- **Appetite.** What "done" means, and what is deferred.
- **A decision the evidence cannot make.** platform-design-system models breakpoints as a variant
  axis *because Figma has no media queries* — evidence that teaches a **Figma constraint**, not a
  universal truth. Only a human separates those.

Bring these three **early and phrased**, with a recommendation and the evidence behind it. Do not
bring anything the codebase can answer — look it up.

## Sessions

| Date | Product | Attempted | Blockers | Notes |
|---|---|---|---|---|
| 2026-07-17 | [dana-desktop](260717-dana-desktop-onboarding.md) | `ui init` → E2 brownfield onboard → `/ui:learn` (React 19 + Vite 6 + Tailwind 4, existing 2-tier CSS token system) | 3 | DS shipped sealed (286 tokens, 102 aliases) but **0 components** — component registration is structurally blocked. |
