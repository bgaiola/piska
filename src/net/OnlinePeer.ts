/**
 * OnlinePeer — thin wrapper around PeerJS for PISKA's Vs Online mode.
 *
 * Owns the lifecycle of a peer connection: code generation, broker handshake
 * (using the free public PeerJS broker), incoming/outgoing data channel, and
 * a small reliable JSON message envelope used by the lobby and the Vs scene.
 *
 * Host:  `new OnlinePeer({ role: 'host' })`. Generates a random 6-char code
 *        (no ambiguous chars) and registers with the broker under
 *        `piska-<code>`. Waits for a guest's `DataConnection`.
 *
 * Guest: `new OnlinePeer({ role: 'guest', code })`. Connects as an anonymous
 *        peer to the broker, then dials `piska-<code>` directly.
 *
 * The class buffers `send(...)` calls before the connection opens so the
 * lobby can fire `hello` / `start` messages eagerly without races. A periodic
 * ping/pong keeps RTT visible to the HUD and detects silent drops.
 */
import Peer, { type DataConnection } from 'peerjs';
import type { GarbagePiece } from '@/engine';

export type OnlineRole = 'host' | 'guest';

export interface BoardSnapshot {
  /** Sparse list of occupied cells. Each entry is `[row, col, encodedByte]`.
   *  `encodedByte` packs `color (3 bits) | kind (1 bit) | state (3 bits) | unlocking (1 bit)`.
   *  See `encodeBlock` / `decodeBlock` in `OnlineVsScene`. */
  cells: Array<[number, number, number]>;
  score: number;
  cursor: { row: number; col: number };
  riseOffset: number;
  dropDelayMs: number;
  rows: number;
  cols: number;
}

export type OnlineMessage =
  | { kind: 'hello'; role: OnlineRole; protocolVersion: number; nickname?: string }
  | { kind: 'start'; hostSeed: number; guestSeed: number; startsAt: number /* epoch ms */ }
  | { kind: 'garbage'; pieces: GarbagePiece[] }
  | { kind: 'state'; snapshot: BoardSnapshot }
  | { kind: 'gameover'; reason: 'topout' | 'disconnect' }
  | { kind: 'ping'; t: number }
  | { kind: 'pong'; t: number }
  /** Sent by either side from the result screen to request a rematch. The
   *  host (whoever was host originally) emits `rematch-start` once both
   *  peers have asked for a rematch. */
  | { kind: 'rematch' }
  | { kind: 'rematch-start'; hostSeed: number; guestSeed: number; startsAt: number };

export interface OnlinePeerHandlers {
  /** Fires once the local peer is registered with the broker. For hosts the
   *  argument is the room code players should share. Guests also receive
   *  their (typed) code back here. */
  onOpen?: (myCode: string) => void;
  /** Fires when the peer-to-peer DataConnection is open and ready to send. */
  onConnect?: () => void;
  onMessage?: (msg: OnlineMessage) => void;
  onError?: (err: Error) => void;
  onDisconnect?: () => void;
}

const PROTOCOL_PREFIX = 'piska-';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const PING_INTERVAL_MS = 5000;

function generateCode(length: number = CODE_LENGTH): string {
  const out: string[] = [];
  const cryptoObj =
    typeof globalThis !== 'undefined'
      ? (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto
      : undefined;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const buf = new Uint32Array(length);
    cryptoObj.getRandomValues(buf);
    for (let i = 0; i < length; i++) {
      out.push(CODE_ALPHABET[buf[i] % CODE_ALPHABET.length]);
    }
  } else {
    for (let i = 0; i < length; i++) {
      out.push(CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]);
    }
  }
  return out.join('');
}

/** Normalize whatever the user typed into the lobby. Strips whitespace and
 *  upper-cases. Does NOT translate confusable characters — keep the alphabet
 *  obvious so people don't get surprised by 0↔O substitutions. */
export function normalizeRoomCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

export class OnlinePeer {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  readonly role: OnlineRole;
  /** Room code WITHOUT the `piska-` prefix. Hosts generate this locally;
   *  guests receive it in the constructor. */
  readonly code: string;
  private handlers: OnlinePeerHandlers = {};
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastRttMs = 0;
  private outQueue: OnlineMessage[] = [];
  private destroyed = false;
  private connectionOpened = false;

  constructor(opts: { role: 'host' } | { role: 'guest'; code: string }) {
    this.role = opts.role;
    if (opts.role === 'host') {
      this.code = generateCode();
    } else {
      this.code = normalizeRoomCode(opts.code);
    }
  }

  setHandlers(h: OnlinePeerHandlers): void {
    this.handlers = h;
  }

  /** Initiate the connection. For hosts: register with the broker under our
   *  prefixed code and wait for an incoming `connection`. For guests: open an
   *  anonymous peer and dial the host. Resolves once the local peer is open
   *  with the broker — the actual peer-to-peer link arrives via `onConnect`. */
  async start(): Promise<void> {
    if (this.destroyed) return;
    if (this.role === 'host') {
      this.peer = new Peer(`${PROTOCOL_PREFIX}${this.code}`, { debug: 1 });
    } else {
      this.peer = new Peer({ debug: 1 });
    }

    this.peer.on('open', () => {
      this.handlers.onOpen?.(this.code);
      if (this.role === 'guest' && this.peer) {
        // Dial the host immediately once we have our own broker id.
        const conn = this.peer.connect(`${PROTOCOL_PREFIX}${this.code}`, {
          reliable: true,
        });
        this.attachConnection(conn);
      }
    });

    this.peer.on('connection', (conn: DataConnection) => {
      // Only honor the first incoming connection per host session.
      if (this.conn) {
        conn.close();
        return;
      }
      this.attachConnection(conn);
    });

    this.peer.on('error', (err: unknown) => {
      const e =
        err instanceof Error
          ? err
          : new Error(typeof err === 'string' ? err : 'PeerJS error');
      this.handlers.onError?.(e);
    });

    this.peer.on('disconnected', () => {
      // Disconnected from the broker. The data channel may still work, but
      // signal it so the lobby can surface it if we're still in setup.
      if (!this.connectionOpened) {
        this.handlers.onError?.(new Error('Conexão com servidor perdida'));
      }
    });
  }

  send(msg: OnlineMessage): void {
    if (this.destroyed) return;
    if (this.conn && this.conn.open) {
      try {
        // `send` returns void | Promise<void> depending on chunking; ignore
        // the promise — we don't need flow control for these small messages.
        void this.conn.send(msg);
      } catch (e) {
        this.handlers.onError?.(
          e instanceof Error ? e : new Error('Falha ao enviar mensagem'),
        );
      }
      return;
    }
    // Buffer until the data channel opens.
    this.outQueue.push(msg);
  }

  rttMs(): number {
    return this.lastRttMs;
  }

  isOpen(): boolean {
    return this.conn?.open === true;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    try {
      this.conn?.close();
    } catch {
      // ignore
    }
    this.conn = null;
    try {
      this.peer?.destroy();
    } catch {
      // ignore
    }
    this.peer = null;
    this.outQueue = [];
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private attachConnection(conn: DataConnection): void {
    this.conn = conn;

    conn.on('open', () => {
      this.connectionOpened = true;
      // Flush anything that was queued before the channel was ready.
      const pending = this.outQueue.slice();
      this.outQueue = [];
      for (const m of pending) {
        try {
          void conn.send(m);
        } catch {
          // best-effort flush
        }
      }
      this.startPing();
      this.handlers.onConnect?.();
    });

    conn.on('data', (data: unknown) => {
      const msg = this.parseMessage(data);
      if (!msg) return;
      // Handle ping/pong internally so callers don't have to.
      if (msg.kind === 'ping') {
        this.send({ kind: 'pong', t: msg.t });
        return;
      }
      if (msg.kind === 'pong') {
        this.lastRttMs = Math.max(0, Date.now() - msg.t);
        return;
      }
      this.handlers.onMessage?.(msg);
    });

    conn.on('close', () => {
      if (this.destroyed) return;
      this.handlers.onDisconnect?.();
    });

    conn.on('error', (err: unknown) => {
      const e =
        err instanceof Error
          ? err
          : new Error(typeof err === 'string' ? err : 'Erro na conexão');
      this.handlers.onError?.(e);
    });
  }

  private startPing(): void {
    if (this.pingTimer !== null) return;
    this.pingTimer = setInterval(() => {
      if (!this.conn || !this.conn.open) return;
      this.send({ kind: 'ping', t: Date.now() });
    }, PING_INTERVAL_MS);
  }

  /** Defensive parse — PeerJS surfaces `unknown` from `data` events and a
   *  buggy peer (or different protocol version) could send garbage. */
  private parseMessage(data: unknown): OnlineMessage | null {
    if (!data || typeof data !== 'object') return null;
    const obj = data as { kind?: unknown };
    if (typeof obj.kind !== 'string') return null;
    // We trust our own protocol — any field-level mismatches will surface
    // as runtime errors in handlers, which is fine for v1.
    return data as OnlineMessage;
  }
}
