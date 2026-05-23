# Skill: Color Decision

Use when the host model is making a color choice — picking a primary, building a palette, or deciding whether a text/background pair meets contrast.

## When to invoke
Whenever a workflow needs a color value that isn't already in the design system, or when checking text/background legibility on a generated surface. **Do not do the math yourself** — call the binary.

## What to read & run
- `knowledge/color-science.md` — OKLCH reasoning, WCAG contrast targets (4.5:1 body / 3:1 large + UI), 11-stop scale rationale, semantic role mapping. Read this for the *why*; use the binary for the *math*.
- `ui color scale <hex>` — generate an 11-stop palette from a base hex.
- `ui color contrast <hex1> <hex2>` — get the WCAG ratio + conformance band.
- `ui color convert <hex>` — inspect a color in OKLCH.
- `ui color semantic <name:hex> ...` — classify and build a full semantic palette.

## What to produce
The concrete hex value(s) or alias that the next step (`ui ds change-token`, a generation prompt, etc.) consumes — never reasoning that ends with "approximately this color".
