/**
 * Factory soul — the design:os SHIPPED baseline stance (see knowledge/design-soul.md §7).
 *
 * A new tier BELOW studio/project soul in the taste precedence chain:
 *
 *   brief > project soul > studio soul > FACTORY SOUL (shipped) > memory prior > knowledge floors
 *
 * Where `design/soul.md` (ds-soul.ts) declares ONE project's stance and
 * `studio-soul.md` (ds-soul-studio.ts) declares a studio's, the factory soul is
 * the stance THE PRODUCT ships with — a world-class product-design baseline that
 * applies to every project out of the box, zero setup. Any studio or project
 * soul overrides it clause-by-clause (precedence, never a machine merge).
 *
 * Constitution: this module is PURE and fs-free. The factory soul is a
 * compiled-in constant — never read from disk, never a model call — so it is
 * identical on every runtime and always present.
 *
 * Emitter/linter pairing (a standard needs both): the emitter is this
 * FACTORY_SOUL constant + the `## Soul — factory` context section + the
 * `ui ds soul factory` command; the linter is tests/ds-soul-factory.test.ts,
 * which enforces `checkSoul(FACTORY_SOUL)` returns 0 findings (0 error AND
 * 0 warning) FOREVER — the shipped baseline must pass the very check it teaches.
 */
import { soulSectionForContext } from "./ds-soul.js";

/**
 * The shipped design:os baseline stance — ratified by the product itself.
 * VERBATIM deliverable: do not edit a single word (the linter enforces it stays
 * 0-findings; any reword must be ratified upstream, not patched here).
 */
export const FACTORY_SOUL = `---
status: ratified
layer: factory
---

# Design Soul — factory (the design:os baseline)

_The stance design:os ships with: what world-class product design never does,
always holds, and how its copy speaks. It applies to every project out of the
box. Any studio or project soul overrides it clause-by-clause.
Precedence: brief > project soul > studio soul > factory soul > memory > floors._

## Never

- A screen whose hierarchy cannot survive a squint — if no single element
  leads at thumbnail size, it is not designed yet.
- Decoration that does no work: gradient-mesh heroes, glassmorphism for its
  own sake, shadows deeper than the elevation they signal, border + shadow +
  fill all competing on the same edge.
- More than one accent hue or more than two type families on one surface.
- Raw values where a token exists — hand-picked hex, off-scale spacing,
  one-off radii.
- Filler content in anything a user sees: dummy text, invented names, stock
  photos standing in for the real artifact.
- Motion that communicates nothing — animation without state, causality, or
  spatial meaning; any animation that ignores reduced-motion.
- Copy a competitor could paste unchanged — "seamless", "powerful",
  "all-in-one", a benefit with no noun behind it.

## Always

- Typography carries the design: size, weight, and spacing do the work
  before color is allowed to; color arrives with a reason — state, brand,
  or data — never as filler.
- One primary action per screen; every other control visibly yields to it.
- Real content pressure-tests the layout before it ships: the longest name,
  the empty list, the 3-digit badge, the slow connection.
- Empty, loading, error, and disabled states are designed WITH the happy
  path, not retrofitted after it.
- Spacing from the scale, radii from the system, contrast at or above the
  floor — the constraint IS the aesthetic, not an obstacle to it.
- Density matches the job: a dashboard breathes less, a landing page
  breathes more — both on purpose, neither by accident.
- Alignment is proven, not felt: every edge sits on the grid or has a
  stated reason not to.

## Voice

- Concrete nouns, real numbers, active verbs — "Restores in 12 seconds",
  never "blazing fast".
- Say what it does, not what it is — and keep the claim's evidence in view.
- Buttons name the result ("Save invoice"), never the mechanism ("Submit").
- Errors say what happened, what it affects, and the next step — in that
  order, in the user's language, without blame.
`;

/**
 * The factory soul prepared for `ui ds context`'s "## Soul — factory" section —
 * reuses the project soul's trim + 150-line cap (soulSectionForContext) so all
 * three tiers render through one identical formatter. Pure: no fs, no opts; the
 * constant is compiled in, so the section is deterministic and always available.
 */
export function factorySoulSectionForContext(): string {
  return soulSectionForContext(FACTORY_SOUL);
}
