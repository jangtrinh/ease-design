/**
 * Data/Table — a semantic table (caption / thead / tbody) with zebra rows, reflowing
 * (spec 010 P1 — the kit's tracer-bullet component; see responsive-lint.ts).
 *
 * Mobile-first: below `sm` (40rem / 640px — the counted scale, `knowledge/mode-
 * constraints.md`) three columns cannot render without truncating or forcing a
 * horizontal scroll, so each row becomes a bordered card and each cell grows its own
 * label from `data-th` via `::before` — the standard accessible stacked-table pattern.
 * `thead` is NOT `display:none` (that drops it from the accessibility tree); it uses the
 * visually-hidden clip technique so header text still reaches a screen reader, and
 * explicit `role="table"/"rowgroup"/"row"/"cell"` pin the table semantics that changing
 * `display` away from table/table-row/table-cell can otherwise strip. At `sm` and up the
 * `@media` block reverts to a real grid table: headers visible in place, zebra rows, a
 * right-aligned numeric column — exactly the pre-P1 rendering.
 *
 * Zebra striping uses `--color-muted`; the hovered row uses the L8 `--color-accent` pair;
 * hairlines are `--color-border`. States: Default | Hover | Empty. The leaf role `table` is
 * in the data family, so the specimen contract REQUIRES an `empty` state — a second table
 * renders the static empty-state row (a `colspan` cell) to satisfy it honestly.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-table">
  <style>
    .ui-table { font-family: var(--font-family-body); display: grid; gap: var(--space-5); }
    .ui-table__t { position: relative; width: 100%; border-collapse: collapse; font-size: var(--font-size-sm); color: var(--color-foreground); }
    .ui-table__t caption { text-align: left; font-size: var(--font-size-xs); color: var(--color-muted-foreground); padding-bottom: var(--space-2); }

    /* Reflow floor (< sm / 40rem): stacked cards, one per row. thead is visually hidden
       (never display:none) so its text still reaches a screen reader. */
    .ui-table__t thead {
      position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
      overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
    }
    .ui-table__t, .ui-table__t tbody, .ui-table__t tr { display: block; }
    .ui-table__t tbody tr {
      border: 1px solid var(--color-border); border-radius: var(--radius-button);
      padding: var(--space-3); margin-bottom: var(--space-3);
      transition: background var(--duration-fast) ease;
    }
    .ui-table__t tbody tr:last-child { margin-bottom: 0; }
    .ui-table__t td {
      display: flex; justify-content: space-between; align-items: baseline;
      gap: var(--space-3); padding: var(--space-1) 0; border-bottom: none;
    }
    .ui-table__t td::before {
      content: attr(data-th); font-weight: var(--font-weight-semibold);
      font-size: var(--font-size-xs); color: var(--color-muted-foreground);
    }
    .ui-table__t tbody tr.is-hover { background: var(--color-accent); color: var(--color-accent-foreground); }
    .ui-table__num { text-align: right; font-variant-numeric: tabular-nums; }
    .ui-table__empty { display: block; text-align: center; color: var(--color-muted-foreground); padding: var(--space-8) var(--space-3); }

    /* sm and up (>= 40rem / 640px — knowledge/mode-constraints.md's counted scale):
       revert to a real grid table. Mobile-first: this is the only override block. */
    @media (min-width: 40rem) {
      .ui-table__t { display: table; }
      .ui-table__t thead {
        position: static; width: auto; height: auto; margin: 0; padding: 0;
        overflow: visible; clip: auto; white-space: normal; border: 0; display: table-header-group;
      }
      .ui-table__t tbody { display: table-row-group; }
      .ui-table__t tr { display: table-row; }
      .ui-table__t th {
        display: table-cell; text-align: left; font-weight: var(--font-weight-semibold);
        font-size: var(--font-size-xs); color: var(--color-muted-foreground);
        padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--color-border);
      }
      .ui-table__t td {
        display: table-cell; padding: var(--space-2) var(--space-3);
        border-bottom: 1px solid var(--color-border);
      }
      .ui-table__t td::before { content: none; }
      .ui-table__t td.ui-table__empty { display: table-cell; }
      .ui-table__t tbody tr { border: none; border-radius: 0; padding: 0; margin-bottom: 0; }
      .ui-table__t tbody tr:nth-child(even) { background: var(--color-muted); }
    }
  </style>
  <table class="ui-table__t" role="table">
    <caption>Recent invoices</caption>
    <thead role="rowgroup">
      <tr role="row"><th scope="col" role="columnheader">Invoice</th><th scope="col" role="columnheader">Client</th><th scope="col" role="columnheader" class="ui-table__num">Amount</th></tr>
    </thead>
    <tbody role="rowgroup">
      <tr role="row"><td role="cell" data-th="Invoice">INV-1042</td><td role="cell" data-th="Client">Aurora Labs</td><td role="cell" data-th="Amount" class="ui-table__num">$1,200.00</td></tr>
      <tr role="row"><td role="cell" data-th="Invoice">INV-1041</td><td role="cell" data-th="Client">Northwind</td><td role="cell" data-th="Amount" class="ui-table__num">$840.00</td></tr>
      <tr role="row" class="is-hover"><td role="cell" data-th="Invoice">INV-1040</td><td role="cell" data-th="Client">Globex</td><td role="cell" data-th="Amount" class="ui-table__num">$2,050.00</td></tr>
      <tr role="row"><td role="cell" data-th="Invoice">INV-1039</td><td role="cell" data-th="Client">Initech</td><td role="cell" data-th="Amount" class="ui-table__num">$430.00</td></tr>
    </tbody>
  </table>
  <table class="ui-table__t" role="table">
    <caption>Archived invoices</caption>
    <thead role="rowgroup">
      <tr role="row"><th scope="col" role="columnheader">Invoice</th><th scope="col" role="columnheader">Client</th><th scope="col" role="columnheader" class="ui-table__num">Amount</th></tr>
    </thead>
    <tbody role="rowgroup">
      <tr role="row"><td role="cell" class="ui-table__empty" colspan="3">No archived invoices yet.</td></tr>
    </tbody>
  </table>
</div>`;

export const table: KitComponent = {
  name: "Data/Table",
  category: "data",
  markup,
  description: "Data table — semantic caption/thead/tbody with zebra rows, a hovered row, a static empty state, and a stacked-card reflow below sm (40rem).",
  status: "stable",
  variants: [
    "State=Default", "State=Hover", "State=Empty",
  ],
  tokensUsed: [
    "color.foreground", "color.muted-foreground", "color.border",
    "color.muted", "color.accent", "color.accent-foreground",
    "font-family.body", "font-weight.semibold",
    "font-size.sm", "font-size.xs",
    "space.1", "space.2", "space.3", "space.5", "space.8",
    "radius.button", "duration.fast",
  ],
};
