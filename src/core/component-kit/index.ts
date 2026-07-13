/**
 * COMPONENT_KIT — the mature default component kit `ds init` registers into every fresh
 * design system (unless `--bare`). It ships 27 `stable` `ComponentRecord`s: the 7 Control-family
 * controls (wave A); Field, Badge, Card, Alert, Tabs, Table, and Dialog (wave B); Avatar,
 * Separator, Skeleton, Progress, Kbd, Tooltip, and Toast (wave C); plus Accordion, Breadcrumb,
 * Pagination, Popover, DropdownMenu, and Combobox (wave D). Each uses ONLY the L8 semantic token
 * tier and declares its full State matrix via `variants`, so `ds specimen` reports zero gaps on a
 * fresh DS.
 *
 * The array is sorted by name for deterministic registration order (saveRegistry also
 * sorts on write, but a sorted source keeps this list self-documenting).
 */
import type { ComponentRecord } from "../registry-store.js";
import { accordion } from "./accordion.js";
import { alert } from "./alert.js";
import { avatar } from "./avatar.js";
import { badge } from "./badge.js";
import { breadcrumb } from "./breadcrumb.js";
import { button } from "./button.js";
import { card } from "./card.js";
import { checkbox } from "./checkbox.js";
import { combobox } from "./combobox.js";
import { dialog } from "./dialog.js";
import { dropdownMenu } from "./dropdown-menu.js";
import { field } from "./field.js";
import { input } from "./input.js";
import { kbd } from "./kbd.js";
import { pagination } from "./pagination.js";
import { popover } from "./popover.js";
import { progress } from "./progress.js";
import { radio } from "./radio.js";
import { select } from "./select.js";
import { separator } from "./separator.js";
import { skeleton } from "./skeleton.js";
import { switchControl } from "./switch.js";
import { table } from "./table.js";
import { tabs } from "./tabs.js";
import { textarea } from "./textarea.js";
import { toast } from "./toast.js";
import { tooltip } from "./tooltip.js";

export const COMPONENT_KIT: ComponentRecord[] = [
  accordion,
  alert,
  avatar,
  badge,
  breadcrumb,
  button,
  card,
  checkbox,
  combobox,
  dialog,
  dropdownMenu,
  field,
  input,
  kbd,
  pagination,
  popover,
  progress,
  radio,
  select,
  separator,
  skeleton,
  switchControl,
  table,
  tabs,
  textarea,
  toast,
  tooltip,
].sort((a, b) => a.name.localeCompare(b.name));
