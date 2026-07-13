/**
 * COMPONENT_KIT — the mature default component kit `ds init` registers into every fresh
 * design system (unless `--bare`). Wave A ships the 7 Control-family components; each is a
 * `stable` `ComponentRecord` whose markup uses ONLY the L8 semantic token tier and declares
 * its full State matrix via `variants`, so `ds specimen` reports zero gaps on a fresh DS.
 *
 * The array is sorted by name for deterministic registration order (saveRegistry also
 * sorts on write, but a sorted source keeps this list self-documenting).
 */
import type { ComponentRecord } from "../registry-store.js";
import { button } from "./button.js";
import { input } from "./input.js";
import { textarea } from "./textarea.js";
import { select } from "./select.js";
import { checkbox } from "./checkbox.js";
import { radio } from "./radio.js";
import { switchControl } from "./switch.js";

export const COMPONENT_KIT: ComponentRecord[] = [
  button,
  checkbox,
  input,
  radio,
  select,
  switchControl,
  textarea,
].sort((a, b) => a.name.localeCompare(b.name));
