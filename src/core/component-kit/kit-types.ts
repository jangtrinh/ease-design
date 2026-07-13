/**
 * Component-kit shared type — the shape every kit component must satisfy.
 *
 * A `KitComponent` is a {@link ComponentRecord} with the three fields the mature
 * default kit ALWAYS ships made required: `variants` (the declared axis grammar —
 * `Tone=…`, `Size=…`, `State=…`), a one-line `description`, and `status: "stable"`.
 * Narrowing these at the type level means a half-authored kit component fails
 * `tsc` before it can ever reach `ds init` / `ds specimen`.
 *
 * Every record here is still a plain `ComponentRecord`, so it passes
 * `validateComponentRecord` unchanged and registers via `registerComponent`.
 */
import type { ComponentRecord } from "../registry-store.js";

export interface KitComponent extends ComponentRecord {
  /** Declared variant axes, e.g. `["Tone=Primary", "Size=Md", "State=Hover", …]`.
   * The specimen contract reads the `State=…` dimension, so it is the source of truth
   * for the state matrix (the narrow `states` enum can't express Loading/Invalid/etc.). */
  variants: string[];
  /** One-line human description (shown by `ds docs`). */
  description: string;
  /** The whole kit is production-grade; a `stable` gap would gate `ds specimen`. */
  status: "stable";
}
