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
  type ActivityRecord,
} from './panel-model';

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

const dot = el('fga-dot');
const pill = el('fga-pill');
const sentence = el('fga-sentence');
const meta = el('fga-meta');
const onboarding = el('fga-onboarding');
const hint = el('fga-hint');
const activityList = el('fga-activity');
const dPort = el('fga-d-port');
const dProto = el('fga-d-proto');
const dHeartbeat = el('fga-d-heartbeat');
const dAttempts = el('fga-d-attempts');
const dFile = el('fga-d-file');
const dPage = el('fga-d-page');
const copyBtn = el('fga-copy');

let payload: ConnectionStatePayload | null = null;
let hadConnection = false; // ever reached `connected` — flips onboarding off + drop-hint on
let probeAttempts = 0; // full broker scans since load (one per scan cycle)
let activity: ActivityRecord[] = []; // newest-first, capped at 50 by pushActivity
let sceneFile = '';
let scenePage = '';

// ─── Rendering ──────────────────────────────────────────────────────────────
function metaLine(state: ConnectionState, now: number): string {
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
  if (!pm || pm.type !== 'FILE_INFO' || !pm.data) return;
  if (typeof pm.data.fileName === 'string') sceneFile = pm.data.fileName;
  if (typeof pm.data.page === 'string') scenePage = pm.data.page;
  renderDetails();
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
    setTimeout(() => { copyBtn.textContent = 'Copy status'; }, 1500);
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  else fallbackCopy(text, done);
});

// A 1s heartbeat keeps the live ages (uptime, retry elapsed, time-ago) fresh
// between transitions.
setInterval(render, 1000);
render();
