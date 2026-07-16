// P2 panel — the thin DOM controller. It CONSUMES the P1 connection state machine
// (the `figma-agent:conn-state` CustomEvent) and the new `figma-agent:activity`
// event (both dispatched by ui-relay.ts) and renders the panel.html chrome. No
// framework, no Figma API, no WebSocket — all protocol/connection logic stays in
// the relay; all pure formatting stays in panel-model.ts. This file is glue.
//
// Load order matters: ui-relay.ts imports this module FIRST, so these listeners
// are attached before the relay fires its first transition (a fresh subscriber
// would otherwise miss the opening PROBE).
import { PORT_RANGE_START } from '../../../shared/protocol';
import type { ConnectionState, ConnectionStatePayload } from '../../../shared/protocol';
import {
  stateView, formatAge, formatDuration, timeAgo, humanizeTool,
  toActivityRecord, pushActivity, troubleshootHint, showOnboarding,
  togglePanelMode, detailsLabel, compactMeta, PANEL_HEIGHT,
  syncPromptLabel, syncResultLabel,
  type ActivityRecord, type PanelMode,
} from './panel-model';

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

const panelRoot = el('fga-panel');
const dot = el('fga-dot');
const pill = el('fga-pill');
const sentence = el('fga-sentence');
const meta = el('fga-meta');
const onboarding = el('fga-onboarding');
const hint = el('fga-hint');
const activityList = el('fga-activity');
const expandedZone = el('fga-expanded');
const toggleBtn = el('fga-toggle');
const dPort = el('fga-d-port');
const dProto = el('fga-d-proto');
const dHeartbeat = el('fga-d-heartbeat');
const dAttempts = el('fga-d-attempts');
const dFile = el('fga-d-file');
const dPage = el('fga-d-page');
const copyBtn = el('fga-copy');
const syncPrompt = el('fga-sync');
const syncMsg = el('fga-sync-msg');
const syncNowBtn = el('fga-sync-now');
const syncLaterBtn = el('fga-sync-later');

let payload: ConnectionStatePayload | null = null;
let hadConnection = false; // ever reached `connected` — flips onboarding off + drop-hint on
let probeAttempts = 0; // full broker scans since load (one per scan cycle)
let activity: ActivityRecord[] = []; // newest-first, capped at 50 by pushActivity
let sceneFile = '';
let scenePage = '';
let mode: PanelMode = 'compact'; // ALWAYS compact on open (spec P5.1 — no persistence)

// ─── Rendering ──────────────────────────────────────────────────────────────
function metaLine(state: ConnectionState, now: number): string {
  if (mode === 'compact') {
    const compact = compactMeta(state);
    if (compact !== null) return compact; // disconnected compact still communicates
  }
  if (!payload) return '';
  const age = now - payload.since;
  if (state === 'connected') {
    return `${payload.port ? `Port ${payload.port}` : 'Connected'} · up ${formatAge(age)}`;
  }
  if (state === 'probing') {
    return `Attempt ${Math.max(1, probeAttempts)} · retrying (${formatAge(age)})`;
  }
  return '';
}

function renderDetails(): void {
  const port = payload?.port;
  const pong = payload?.lastPongAge;
  dPort.textContent = port ? String(port) : '—';
  dProto.textContent = payload ? `v${payload.protocolVersion}` : '—';
  dHeartbeat.textContent = pong != null ? `${formatAge(pong)} ago` : '—';
  dAttempts.textContent = String(probeAttempts);
  dFile.textContent = sceneFile || '—';
  dPage.textContent = scenePage || '—';
}

function renderActivity(now: number): void {
  if (activity.length === 0) return; // leave the static "No activity yet" empty-state row
  const rows = activity.slice(0, 8).map((r) => {
    const li = document.createElement('li');
    li.className = 'activity-row';
    const d = document.createElement('span');
    d.className = 'log-dot';
    d.dataset.ok = String(r.ok);
    const tool = document.createElement('span');
    tool.className = 'log-tool';
    tool.textContent = humanizeTool(r.tool);
    const m = document.createElement('span');
    m.className = 'log-meta';
    m.textContent = `${r.ok ? '' : 'failed · '}${formatDuration(r.ms)} · ${timeAgo(now, r.at)}`;
    li.append(d, tool, m);
    return li;
  });
  activityList.replaceChildren(...rows);
}

function render(): void {
  const now = Date.now();
  const state: ConnectionState = payload?.state ?? 'disconnected';
  const view = stateView(state);

  dot.dataset.tone = view.tone;
  dot.classList.toggle('is-pulsing', view.pulse);
  pill.textContent = view.pill;
  pill.dataset.tone = view.tone;
  sentence.textContent = view.sentence;
  meta.textContent = metaLine(state, now);
  onboarding.hidden = !showOnboarding(state, hadConnection);
  hint.textContent = troubleshootHint(state, payload ? now - payload.since : 0, hadConnection) ?? '';
  renderDetails();
  renderActivity(now);
}

// ─── Event wiring ─────────────────────────────────────────────────────────────
window.addEventListener('figma-agent:conn-state', (ev) => {
  const p = (ev as CustomEvent).detail as ConnectionStatePayload | undefined;
  if (!p || typeof p.state !== 'string') return;
  if (p.state === 'connected') hadConnection = true;
  if (p.state === 'probing' && p.port === PORT_RANGE_START) probeAttempts++;
  payload = p;
  render();
});

window.addEventListener('figma-agent:activity', (ev) => {
  const rec = toActivityRecord((ev as CustomEvent).detail);
  if (!rec) return;
  activity = pushActivity(activity, rec);
  renderActivity(Date.now());
});

// Scene identity for the details panel — main announces it (FILE_INFO); ui-relay
// also forwards it to the broker. This listener is read-only and independent.
window.addEventListener('message', (ev: MessageEvent) => {
  const pm = (ev.data as { pluginMessage?: { type?: string; data?: Record<string, unknown> } } | null)?.pluginMessage;
  if (!pm) return;
  // Live-sync idle prompt (spec 004 P4): main fired IDLE_READY → show "N changes ready".
  if (pm.type === 'IDLE_READY' && pm.data) {
    const count = typeof pm.data.count === 'number' ? pm.data.count : 1;
    syncMsg.textContent = syncPromptLabel(count);
    syncPrompt.hidden = false;
    return;
  }
  if (pm.type !== 'FILE_INFO' || !pm.data) return;
  if (typeof pm.data.fileName === 'string') sceneFile = pm.data.fileName;
  if (typeof pm.data.page === 'string') scenePage = pm.data.page;
  renderDetails();
});

// ─── Idle-commit prompt actions (spec 004 P4) ─────────────────────────────────
// "Sync now" → ask the relay to send SYNC_REQUEST to the broker (which runs `ui figma
// reconcile --apply`) AND tell main the batch was acknowledged. "Later" just hides it —
// the next documentchange restarts the idle timer. SYNC_RESULT confirms in place.
syncNowBtn.addEventListener('click', () => {
  syncMsg.textContent = 'Syncing…';
  try { window.dispatchEvent(new CustomEvent('figma-agent:sync-request')); } catch { /* no DOM events */ }
  parent.postMessage({ pluginMessage: { type: 'SYNC_DONE' } }, '*');
});

syncLaterBtn.addEventListener('click', () => { syncPrompt.hidden = true; });

window.addEventListener('figma-agent:sync-result', (ev) => {
  const d = (ev as CustomEvent).detail as { ok?: boolean; summary?: string } | undefined;
  syncMsg.textContent = syncResultLabel(d?.ok === true, typeof d?.summary === 'string' ? d.summary : '');
  syncPrompt.hidden = false;
  setTimeout(() => { syncPrompt.hidden = true; }, 4000); // auto-dismiss the confirmation
});

// ─── Copy status (support hand-off) ───────────────────────────────────────────
function fallbackCopy(text: string, done: () => void): void {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    done();
  } catch { /* clipboard unavailable in this iframe — no-op */ }
}

copyBtn.addEventListener('click', () => {
  const snapshot = {
    state: payload?.state ?? 'disconnected',
    port: payload?.port ?? null,
    protocolVersion: payload?.protocolVersion ?? null,
    lastPongAge: payload?.lastPongAge ?? null,
    reconnectAttempts: probeAttempts,
    file: sceneFile || null,
    page: scenePage || null,
    recentActivity: activity.slice(0, 8),
  };
  const text = JSON.stringify(snapshot, null, 2);
  const done = (): void => {
    copyBtn.textContent = 'Copied';
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  else fallbackCopy(text, done);
});

// ─── Compact ⇄ expanded (P5.1) ───────────────────────────────────────────────
// The DETAILS footer cell toggles the expanded zone and asks main to resize the
// iframe to the mode's height (main owns figma.ui.resize; resize is instant, no
// animation). Default is always compact on open — mode is never persisted.
function applyMode(): void {
  panelRoot.dataset.mode = mode;
  expandedZone.hidden = mode !== 'expanded';
  toggleBtn.textContent = detailsLabel(mode);
  toggleBtn.setAttribute('aria-expanded', String(mode === 'expanded'));
}

toggleBtn.addEventListener('click', () => {
  mode = togglePanelMode(mode);
  applyMode();
  parent.postMessage({ pluginMessage: { type: 'PANEL_RESIZE', h: PANEL_HEIGHT[mode] } }, '*');
  render(); // the meta line is mode-dependent (compact disconnected override)
});

// A 1s heartbeat keeps the live ages (uptime, retry elapsed, time-ago) fresh
// between transitions.
setInterval(render, 1000);
applyMode();
render();
