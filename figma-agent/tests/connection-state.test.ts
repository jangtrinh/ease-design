// P1 stability — the connection state machine + the payload the plugin posts to
// its UI. The reducer is the canonical machine the plugin routes every transition
// through; the payload shape is the contract the P2 panel redesign consumes.
import { describe, it, expect } from 'vitest';
import {
  makeStatePayload, reduceConnState, PROTOCOL_VERSION,
  type ConnectionState,
} from '../shared/protocol.ts';

describe('reduceConnState — disconnected→probing→handshake→connected', () => {
  it('walks the happy path in order', () => {
    let s: ConnectionState = 'disconnected';
    s = reduceConnState(s, 'PROBE'); expect(s).toBe('probing');
    s = reduceConnState(s, 'FOUND'); expect(s).toBe('handshake');
    s = reduceConnState(s, 'READY'); expect(s).toBe('connected');
    s = reduceConnState(s, 'LOST'); expect(s).toBe('disconnected');
  });

  it('LOST from any state returns to disconnected', () => {
    for (const s of ['probing', 'handshake', 'connected'] as ConnectionState[]) {
      expect(reduceConnState(s, 'LOST')).toBe('disconnected');
    }
  });

  it('ignores out-of-order events (guards against skipping handshake)', () => {
    // FOUND only advances from probing; READY only from handshake.
    expect(reduceConnState('disconnected', 'FOUND')).toBe('disconnected');
    expect(reduceConnState('connected', 'FOUND')).toBe('connected');
    expect(reduceConnState('probing', 'READY')).toBe('probing');
  });

  it('PROBE re-enters probing from anywhere (a fresh scan)', () => {
    expect(reduceConnState('disconnected', 'PROBE')).toBe('probing');
    expect(reduceConnState('connected', 'PROBE')).toBe('probing');
  });
});

describe('makeStatePayload — the UI contract', () => {
  it('stamps type + protocolVersion and echoes the state', () => {
    const p = makeStatePayload('connected', { brokerUrl: 'ws://localhost:9410', port: 9410 });
    expect(p.type).toBe('CONN_STATE');
    expect(p.state).toBe('connected');
    expect(p.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(p.brokerUrl).toBe('ws://localhost:9410');
    expect(p.port).toBe(9410);
    expect(typeof p.since).toBe('number');
  });

  it('defaults `since` to now and carries an optional detail', () => {
    const before = Date.now();
    const p = makeStatePayload('probing', { detail: 'probing localhost:9411…' });
    expect(p.since).toBeGreaterThanOrEqual(before);
    expect(p.detail).toBe('probing localhost:9411…');
  });
});
