// Broker discovery: /tmp advertisement file read/write (spec §1) + validate
// (pid alive, protocol, buildMtime) → reuse; otherwise replace a stale broker
// (BROKER_SHUTDOWN_REQUEST) and/or spawn a detached `node <self> __broker`,
// polling until advertised.
import { spawn } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import {
  BROKER_FILE,
  HEARTBEAT_STALE_MS,
  PROTOCOL_VERSION,
  type BrokerAdvertisement,
} from '../../../shared/protocol.ts';
import { CliError } from './protocol-helpers.ts';

const SPAWN_POLL_MS = 50;
const SPAWN_DEADLINE_MS = 5_000;
const SHUTDOWN_WAIT_MS = 3_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Absolute path of the running CLI bundle (cli/dist/figma-agent.js at runtime). */
export function selfBundlePath(): string {
  return fileURLToPath(import.meta.url);
}

let cachedMtime: number | null = null;
/** mtime of the running bundle — a newer build replaces a stale broker. */
export function selfBuildMtime(): number {
  if (cachedMtime === null) cachedMtime = statSync(selfBundlePath()).mtimeMs;
  return cachedMtime;
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'; // alive, owned by someone else
  }
}

export function readAdvertisement(): BrokerAdvertisement | null {
  try {
    const ad = JSON.parse(readFileSync(BROKER_FILE, 'utf8')) as BrokerAdvertisement;
    if (typeof ad?.port !== 'number' || typeof ad?.pid !== 'number') return null;
    return ad;
  } catch {
    return null; // absent or unreadable → treated as no broker
  }
}

/** Live = pid alive AND advertisement refreshed recently (guards pid reuse). */
export function isAdvertisementLive(ad: BrokerAdvertisement): boolean {
  return isPidAlive(ad.pid) && Date.now() - ad.lastSeen < HEARTBEAT_STALE_MS + 30_000;
}

/** Write/refresh the daemon's advertisement (called from broker-daemon only). */
export function writeAdvertisement(port: number, startedAt: number): void {
  const ad: BrokerAdvertisement = {
    port,
    pid: process.pid,
    protocolV: PROTOCOL_VERSION,
    buildMtime: selfBuildMtime(),
    startedAt,
    lastSeen: Date.now(),
  };
  writeFileSync(BROKER_FILE, JSON.stringify(ad));
}

/** Ask a stale-but-alive broker to exit; escalate to SIGTERM if it lingers. */
async function requestBrokerShutdown(ad: BrokerAdvertisement): Promise<void> {
  await new Promise<void>((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${ad.port}`);
    const done = (): void => {
      try {
        ws.terminate();
      } catch {
        /* already closed */
      }
      resolve();
    };
    const timer = setTimeout(done, 1_500);
    ws.once('open', () => {
      ws.send(JSON.stringify({ type: 'BROKER_SHUTDOWN_REQUEST' }));
      setTimeout(() => {
        clearTimeout(timer);
        done();
      }, 200);
    });
    ws.once('error', () => {
      clearTimeout(timer);
      done();
    });
  });
  const deadline = Date.now() + SHUTDOWN_WAIT_MS;
  while (Date.now() < deadline && isPidAlive(ad.pid)) await sleep(100);
  if (isPidAlive(ad.pid)) {
    try {
      process.kill(ad.pid, 'SIGTERM');
    } catch {
      /* raced to death — fine */
    }
    await sleep(200);
  }
}

/** Spawn a detached broker daemon and poll until it advertises itself. */
async function spawnBroker(): Promise<BrokerAdvertisement> {
  const spawnedAfter = Date.now() - 1_000; // small clock slop
  const child = spawn(process.execPath, [selfBundlePath(), '__broker'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  const deadline = Date.now() + SPAWN_DEADLINE_MS;
  while (Date.now() < deadline) {
    const ad = readAdvertisement();
    // Accept our child OR a concurrent winner (two CLIs racing to spawn).
    if (ad && isPidAlive(ad.pid) && ad.lastSeen >= spawnedAfter) return ad;
    await sleep(SPAWN_POLL_MS);
  }
  throw new CliError('E_NO_BROKER', 'broker did not start within 5s (see /tmp/figma-agent-broker.log)');
}

/**
 * Ensure a healthy broker is running and return its advertisement.
 * Replaces brokers with mismatched protocol or an older bundle build.
 */
export async function ensureBroker(): Promise<BrokerAdvertisement> {
  const myMtime = selfBuildMtime();
  const ad = readAdvertisement();
  if (ad && isAdvertisementLive(ad)) {
    const outdatedBuild = myMtime - ad.buildMtime > 1; // 1ms float tolerance
    if (ad.protocolV === PROTOCOL_VERSION && !outdatedBuild) return ad;
    await requestBrokerShutdown(ad); // stale build / protocol → replace
  }
  return spawnBroker();
}
