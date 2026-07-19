# Qualified Delivery

Read this before generating a marketing or landing-page design from a plain-language request.
Qualified Delivery is a process contract, not a promise that every first output is world-class.

## Boundary

The host model reasons, compiles intent, creates directions, generates, renders, and judges.
The deterministic `ui` binary validates artifact shapes and false-green invariants. It never calls
a model or the network. Spec 013 remains the downstream intake for integrated TSX/JSX/Vue/CSS.

## Three typed boundaries

### 1. Design brief

Preserve the raw request verbatim. Compile audience, context, outcome, action, required content,
constraints, prohibited claims, and acceptance criteria. Every added fact is an assumption tagged:

- `provided` — present in the user request;
- `project-evidence` — present in committed product evidence;
- `inferred` — safe design inference;
- `unknown` — missing truth that must not be invented.

Use the facets in `figma-craft/facet-model.md`; do not invent another intent decomposition.
Ask one question only when ambiguity changes the product outcome, action, or evidence strategy.

Validate:

```sh
ui delivery validate design-brief.json --json
```

### 2. Generation contract

Choose a direction before code. Declare its thesis, page structure, focal mechanism, signature
device, and principal risk. Add required sections, canonical viewports, output, and every machine
gate. Direction differences must be structural, not palette or radius variations.

Marketing P0 canonical viewports: `1440`, `768`, `390`.

Required static gates:

```text
validate-layout · a11y-lint · taste-lint · content-lint · ds-usage-lint · ds-a11y
```

Validate:

```sh
ui delivery validate generation-contract.json --json
```

### 3. Qualification record

Record each attempt; never overwrite history. Maximum three attempts. Machine gates run before
qualitative judgment. Rendered evidence uses the contract viewports. The curator sees the brief,
contract, artifact, screenshots, and gate envelopes but not the maker's private rationale.

Statuses:

- `QUALIFIED` — all required gates pass, all Must criteria are covered, canonical rendered
  evidence exists, and no unsupported claim or unresolved finding remains;
- `DRAFT_WITH_CONCERNS` — useful output with named failures or missing rendered evidence;
- `BLOCKED_BY_EVIDENCE` — missing product truth or user decision prevents responsible delivery.

Validate:

```sh
ui delivery validate qualification-record.json --json
```

## Repair rule

The curator returns the single worst evidence-backed finding. The maker performs one targeted
repair, then every relevant gate and rendered viewport reruns. Stop when qualified, after three
attempts, when the same failure repeats twice without improvement, or when evidence is required.

## Honesty rules

- Never turn a failed or unavailable rendered gate into `QUALIFIED`.
- Never combine unrelated checks into a universal quality score.
- Never fabricate customer counts, revenue, testimonials, awards, integrations, or research.
- Never claim automated scans prove WCAG conformance, desirability, or business performance.
- Keep rejected attempts as audit evidence; do not present them as equivalent deliveries.
