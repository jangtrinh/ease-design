# Does onboarding a real codebase change what gets generated?

**Date**: 2026-07-17 · **Status**: run, H₀ rejected
**Why this exists**: spec 009 opened the code road and measured it end to end — 10/10 projects
compiled a vocabulary, 4/4 registered components, 2064 tests, four merged PRs. **Every one of
those numbers is an intermediate.** `ds status exit 0` is not a design. Nobody had run
`/ui:generate` against a design system learned from real code. Not once, ever — the only
generated HTML in the repo (`examples/generated/`) came from a persona-compiled DS for an
invented intent ("Weekly vegan meal-prep subscription").

We graded the pipeline for a day and never looked at what comes out of it.

## H₀

> Onboarding a real codebase produces UI indistinguishable from a generic persona default.

If H₀ holds, the code road produces no measurable value at the moment it exists for.

## Design

Two arms, same intent, one design system each, **blind** — neither generator knew the other
existed, that this was an experiment, or that token provenance was the measure. They received
exactly what a host model receives: `ui ds context --strict --with-theme`, `generate.md`, an
intent, and the four linters as the floor.

| | A | B |
|---|---|---|
| DS | dana-desktop, **learned from its own CSS** (spec 009's road) | persona-compiled (`ds init --persona data-dense-observatory`) |
| tokens in `@theme` | 414 | 192 |
| registered components | **0** | 27 (the kit) |
| intent | *a settings screen for an AI desktop app: API key management, model selection, theme toggle* | (identical) |

**The measure needs no judge.** The two token namespaces have **zero overlap** — 414 unique to
dana (`badge-danger-bg`, `citation-bg`, `surface-content-alt`), 192 unique to the persona
(`primary`, `accent`, `muted-foreground`). Any `var(--color-citation-bg)` in the output is
*proof* of dana. Counting beats judging.

## Result — H₀ rejected

|  | A (learned) | B (persona) |
|---|---|---|
| output size | 54,629 chars | 47,521 chars |
| distinct tokens used | 70 | 55 |
| **→ own DS's namespace** | **55** | **54** |
| **→ the other DS's namespace** | **0** | **0** |
| hardcoded colours (outside the declaration block) | 2 | 0 |
| **tokens the model invented** | **14** | **0** |
| ghost tokens (used, never declared) | 0 | 0 |

**Perfect separation.** A learned DS carries its identity into generated output **as reliably as
a persona DS designed for the job** — 55 vs 54, two hardcoded hexes across 54KB. The road works.

## The finding is the asymmetry: 14 invented vs 0

A invented `--surface-card`, `--surface-card-hover`, `--border-c`, `--border-strong-c`, and ten
more. B invented nothing.

dana has **414 tokens and not one of them is a card surface.** Its vocabulary is
`badge-danger-bg`, `citation-bg`, `chat-*` — **the words dana's product uses**. The persona's is
`card`, `popover`, `muted-foreground`, `accent` — **the words you need to build a screen that
does not exist yet**.

> **A persona DS is designed for generation. A learned DS is whatever the project happened to
> declare.** They are different kinds of vocabulary, and design:os treats them as
> interchangeable.

This is not a bug in the road. It is a gap the road makes visible for the first time, and it is
**measurable**: 14 invented tokens = 14 counted distances between *what dana declared* and *what
building a new screen requires*.

And they **died with the page** — no `ui ds change-token` was called. The next generation invents
them again, differently. The DS does not learn from the generation it just served.

## The Art II hole this exposed — verified with a hand-built probe

`ds context`'s ENFORCEMENT clause tells every model:

> *"Any new design **MUST** style exclusively with the semantic tokens below — never hardcode
> colors, spacing, radius, or shadow when a token covers them."*

**Nothing checks it.** Probe:

```html
<style>
  :root { --real-color: #1a1a1a; }
  .card { color: var(--totally-undeclared-token); border: 1px solid var(--another-ghost); }
</style>
```
```
taste-lint       0 error, 0 warning
validate-layout  0 error, 0 warning
content-lint     0 error, 0 warning
a11y-lint        0 error, 0 warning
```

A page may reference tokens that do not exist, hardcode every colour, or use a *different* DS's
tokens entirely — and pass all four floors. No linter knows the project's design system exists.

**Third instance of this shape today**: the kit (0 `@media` in 1,971 lines, all floors green —
an absence has no bugs); `truncated` (an honesty flag nothing verified); this. **Standard
written. Emitter shipped. Linter never.** Art II names exactly this failure and it keeps
recurring in the places the doctrine speaks loudest.

## Also confirmed live: the dogfood's F11, still open

`ds a11y` on dana's learned DS: **1,540 cartesian pairs checked, 1,011 below AA** — including
`badge-danger-text` on `badge-neutral-bg`, a combination that never renders. The dana journal
said it in July: *"948 below AA… a first-time user reads that as a verdict on their product."*
It is 1,011 now, on a DS we just compiled. Unfixed.

## Method note — the instrument was wrong three times in this run

This experiment was designed specifically to stop guessing. It still produced three false
findings, each caught only by looking one level closer:

1. **"109 hardcoded colours"** — 107 were the `:root` token *declaration* block the model pasted
   in. Caught before reporting, because the generator had said what it did.
2. **"a ghost token `var(--token-name)` breaks at runtime and all four linters pass"** — it was
   **prose inside an HTML comment**. Reported before checking. Retracted.
3. **"both arms have 1 ghost token"** — both were prose inside **CSS** comments; the regex
   stripped HTML comments only.

Same mechanism every time: **match a string, conclude about behaviour.** The finding underneath
#2 turned out to be true — but only because it was re-tested with a hand-built probe instead of
inferred from a comment. **An instrument that has not been tested is a source of findings, not a
measure of them.**
