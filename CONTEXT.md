# ease-design

DESIGN:OS — a multi-runtime design CLI. The host model writes the HTML; DESIGN:OS supplies
the taste: a `knowledge/` core the model reads directly, a deterministic `ui` kernel that
does every non-LLM transform, and a quality gate the model cannot talk past.

## Language

<!-- Domain glossary — one term per concept. Filled by /es-brainstorm grilling sessions as terms crystallise.
Glossary ONLY: no implementation details, no specs, no decisions (those go to docs/adr/).
Format:
**{Term}**:
{One-two sentence definition of what it IS.}
_Avoid_: {rejected synonyms}
-->

**Road**:
One of the six ways a project's design system enters the store (E1–E6 on the workflow map).
A road is named by its evidence source, not its command — the **Figma road**, the **code
road**, the **URL road**.
_Avoid_: path, entry point, on-ramp (reserve "on-ramp" for the whole onboarding journey)

**Code road**:
The E2 road — compiling a design system from an existing codebase's own evidence: the CSS
custom properties it declares and the components it ships.
_Avoid_: brownfield-code path, code extraction, learn-from-code

**Vocabulary**:
The *what* a design system is made of — its tokens. Harvested by the C0 step of a road
(`ingest-figma-ds` on the Figma road).
_Avoid_: primitives (that names a token tier, not the layer), token layer

**Grammar**:
The *how* a design system is actually used — the measured house style over real screens,
written to `CONVENTIONS.md`. The companion to Vocabulary, harvested by the C7 step
(`synthesize-conventions`).
_Avoid_: conventions (ambiguous with the file), usage DNA, house rules

**Mode**:
A named variant of a token's value across themes. The base mode is the token's `$value`;
every other mode is `$extensions["mode.<name>"]`. Modes are **preserved and documented, not
compiled** — `ui tokens compile` emits the base mode only.
_Avoid_: theme (that names the product's switching mechanism, e.g. `data-theme`, not the
token concept), variant (reserved for component variants), dark-mode override

**Evidence ladder**:
A best→last-resort ordering of evidence sources for one decision, where each rung is tried
before the one below and the rung used is reported. The house idiom — `delivery-assets.md`
(inline-SVG → raster → sprite → crop), `motion-craft.md` (T1 CSS → T6 WebGL), `extract.md`
§3c (SOURCE-grade → GUESS-grade → unverified). A rung ships only with its count over the
real corpus.
_Avoid_: fallback chain, priority list, decision tree

**Parallel hardcoded set**:
The token anti-pattern where each theme redeclares its own primitives instead of a second
semantic layer aliasing one shared set (`knowledge/token-taxonomy.md:121`). A finding to be
recorded at onboarding and normalised — never silently ingested.
_Avoid_: theme duplication, hardcoded dark mode

**Seal**:
The manifest's hash over the compiled DS (`compiledHash` + `registryHash` + `generation`).
A sanctioned command that mutates a sealed artifact must **reseal** — recompute the hashes,
bump the generation, append the changelog — or the next load reports `DS_TAMPERED`.
_Avoid_: lock, signature, checksum

**Role recognition**:
Understanding which of a project's own tokens plays which canonical role (background, primary,
danger…) WITHOUT renaming it — an annotation, not a rewrite. `surface-content` stays
`surface-content`; the tool records that it plays `background`. Stored in
`$extensions["design-os.role"]`, baked at import, owner-editable.
_Avoid_: mapping, conversion, normalization (all imply renaming — forbidden)

**Family role**:
The intent/purpose a token serves — background, foreground, card, primary, secondary, muted,
accent, border, input, ring, destructive, success, warning, info. One axis of role recognition.
_Avoid_: semantic role (too broad — a token has a family AND a position)

**Surface position**:
The other recognition axis — whether a token is a surface (`bg`) or the text on it (`fg`/`text`).
`badge-danger-bg` = danger family, bg position; `badge-danger-text` = danger family, fg position.
The paired axis `ui ds a11y` checks for contrast.
_Avoid_: foreground/background (name the axis, not one value)

**Gap (design-system)**:
A canonical role with no token recognized for it — surfaced as a help-grow list, never
auto-filled. The user adds it in their own name via `ui ds change-token`.
_Avoid_: missing token, hole
