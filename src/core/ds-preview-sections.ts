/**
 * Specimen-page section builders — the pure HTML fragments the generator assembles
 * (see ds-preview.ts). Each builder renders ONE section from REAL resolved-token /
 * registry data; none author component markup (the registry is the only component
 * source). Split out of ds-preview.ts to keep each module focused. No IO.
 */
import { inferForegroundPairs } from "./token-pairs.js";
import type { ResolvedToken } from "./token-model.js";
import type { ComponentRecord } from "./registry-store.js";

// ─── Shared helpers ──────────────────────────────────────────────────────────────

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** HTML-escape text content / attribute values (markup fragments are injected verbatim). */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/** Dotted token path → CSS custom-property stem, e.g. "color.primary" → "color-primary". */
function cssStem(path: string): string {
  return path.replace(/\./g, "-");
}
function hexOf(t: ResolvedToken | undefined): string | null {
  return t !== undefined && typeof t.value === "string" && HEX_RE.test(t.value) ? t.value : null;
}
/** Drop the leading "color." for display labels. */
function role(path: string): string {
  return path.replace(/^color\./, "");
}
/** Slugify a component name into a stable id, e.g. "Control/Button" → "c-control-button". */
function compId(name: string): string {
  return "c-" + name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

// ─── Foundations ───────────────────────────────────────────────────────────────

/** Color section: paired-role swatches (each rendering its own foreground) + unpaired roles. */
export function colorSection(
  byPath: Map<string, ResolvedToken>,
  ratioByPair: Map<string, number>,
): string {
  const pairs = inferForegroundPairs([...byPath.keys()]);
  const swatches: string[] = [];
  for (const [fg, surface] of pairs) {
    const sHex = hexOf(byPath.get(surface));
    const fHex = hexOf(byPath.get(fg));
    if (sHex === null || fHex === null) continue; // only render colour pairs we can show
    const ratio = ratioByPair.get(`${fg}|${surface}`);
    const meta = `${esc(sHex)} / ${esc(fHex)}${ratio !== undefined ? ` &middot; ${ratio}:1` : ""}`;
    swatches.push(
      `      <div class="swatch"><div class="chip" style="background:var(--${cssStem(surface)});color:var(--${cssStem(fg)})">Aa</div>` +
        `<div class="info">${esc(role(surface))} / ${esc(role(fg))}<br><code>${meta}</code></div></div>`,
    );
  }

  // Unpaired structural roles (present-only) + the categorical chart row.
  const unpaired: string[] = [];
  for (const name of ["border", "input", "ring"]) {
    const hex = hexOf(byPath.get(`color.${name}`));
    if (hex === null) continue;
    unpaired.push(
      `      <div class="swatch"><div class="chip" style="background:var(--color-${name});color:var(--color-foreground)">${name}</div>` +
        `<div class="info">${name} <span class="muted">(unpaired)</span><br><code>${esc(hex)}</code></div></div>`,
    );
  }
  for (let i = 1; i <= 5; i++) {
    const hex = hexOf(byPath.get(`color.chart-${i}`));
    if (hex === null) continue;
    unpaired.push(
      `      <div class="swatch"><div class="chip" style="background:var(--color-chart-${i});color:var(--color-background)">${i}</div>` +
        `<div class="info">chart-${i}<br><code>${esc(hex)}</code></div></div>`,
    );
  }

  const parts = [
    `  <section aria-labelledby="s-color">`,
    `    <h2 class="kicker" id="s-color">Color &mdash; paired roles</h2>`,
    `    <div class="swatches">`,
    ...swatches,
    `    </div>`,
  ];
  if (unpaired.length > 0) {
    parts.push(
      `    <p class="section-note">Unpaired structural roles &mdash; no foreground pairing (hairline, control border, focus ring, chart series).</p>`,
      `    <div class="swatches">`,
      ...unpaired,
      `    </div>`,
    );
  }
  parts.push(`  </section>`);
  return parts.join("\n");
}

/** Type ramp: every font-size token, ascending, rendered at its own size. */
export function typeSection(resolved: readonly ResolvedToken[]): string {
  const sizes = resolved
    .filter((t) => t.path.startsWith("font-size.") && typeof t.value === "string")
    .map((t) => ({ name: t.path.slice("font-size.".length), value: String(t.value), px: parseFloat(String(t.value)) }))
    .sort((a, b) => (Number.isNaN(a.px) || Number.isNaN(b.px) ? a.name.localeCompare(b.name) : a.px - b.px));
  const rows = sizes.map(
    (s) =>
      `    <div class="type-row"><span class="tag meta">${esc(s.name)} &middot; ${esc(s.value)}</span>` +
      `<span style="font-size:var(--font-size-${esc(s.name)})">The quick brown fox jumps over the lazy dog</span></div>`,
  );
  return [
    `  <section aria-labelledby="s-type">`,
    `    <h2 class="kicker" id="s-type">Typography &mdash; the size ramp</h2>`,
    ...rows,
    `  </section>`,
  ].join("\n");
}

/** Box-shadow string for a composite shadow token via its expanded per-member CSS vars. */
function shadowValue(path: string): string {
  const p = cssStem(path);
  return `var(--${p}-offset-x) var(--${p}-offset-y) var(--${p}-blur) var(--${p}-spread) color-mix(in srgb, var(--${p}-color) 16%, transparent)`;
}

/** Shape & depth: radius chips + shadow/elevation chips, enumerated from the tree. */
export function shapeSection(resolved: readonly ResolvedToken[]): string {
  const radii = resolved.filter((t) => t.path.startsWith("radius.") && typeof t.value === "string");
  const shadows = resolved.filter((t) => t.type === "shadow");
  const chips: string[] = [];
  for (const t of radii) {
    const name = t.path.slice("radius.".length);
    chips.push(
      `      <div class="rchip" style="border-radius:var(--radius-${esc(name)})">radius-${esc(name)} &middot; ${esc(String(t.value))}</div>`,
    );
  }
  for (const t of shadows) {
    chips.push(`      <div class="echip" style="box-shadow:${shadowValue(t.path)}">${esc(t.path)}</div>`);
  }
  return [
    `  <section aria-labelledby="s-shape">`,
    `    <h2 class="kicker" id="s-shape">Shape &amp; depth</h2>`,
    `    <div class="chips">`,
    ...chips,
    `    </div>`,
    `  </section>`,
  ].join("\n");
}

/** Motion: every duration token as a labelled chip. */
export function motionSection(resolved: readonly ResolvedToken[]): string {
  const durations = resolved.filter((t) => t.type === "duration");
  if (durations.length === 0) return "";
  const chips = durations.map(
    (t) => `      <div class="dchip">${esc(t.path)} &middot; ${esc(String(t.value))}</div>`,
  );
  return [
    `  <section aria-labelledby="s-motion">`,
    `    <h2 class="kicker" id="s-motion">Motion &mdash; durations</h2>`,
    `    <div class="chips">`,
    ...chips,
    `    </div>`,
    `  </section>`,
  ].join("\n");
}

// ─── Components ──────────────────────────────────────────────────────────────────

/** Components section: one block per record WITH markup; name-only records listed after. */
export function componentsSection(components: readonly ComponentRecord[]): { html: string; rendered: number } {
  const withMarkup = components.filter((c) => c.markup.trim() !== "");
  const nameOnly = components.filter((c) => c.markup.trim() === "");

  const blocks: string[] = [];
  withMarkup.forEach((c, i) => {
    const id = compId(c.name);
    const marker = c.status !== undefined ? ` <span class="status-tag">[${esc(c.status)}]</span>` : "";
    const variants =
      c.variants !== undefined && c.variants.length > 0
        ? `\n      <p class="meta comp-variants">${esc(c.variants.join(" · "))}</p>`
        : "";
    blocks.push(
      `    <article class="comp" aria-labelledby="${id}">\n` +
        `      <h3 class="comp-kicker" id="${id}">${i + 1} · ${esc(c.name)}${marker}</h3>${variants}\n` +
        `      <div class="ui-specimen__frame">${c.markup}</div>\n` +
        `    </article>`,
    );
  });

  const parts = [
    `  <section aria-labelledby="s-components">`,
    `    <h2 class="kicker" id="s-components">Components &mdash; from the registry</h2>`,
  ];
  if (withMarkup.length === 0) {
    parts.push(`    <p class="section-note">No components registered in this design system.</p>`);
  } else {
    parts.push(...blocks);
  }
  if (nameOnly.length > 0) {
    parts.push(
      `    <p class="section-note">Registered without preview markup: ${esc(nameOnly.map((c) => c.name).join(", "))}.</p>`,
    );
  }
  parts.push(`  </section>`);
  return { html: parts.join("\n"), rendered: withMarkup.length };
}
