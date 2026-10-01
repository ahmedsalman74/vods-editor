// The server side of protocol v1: the single-instance lock, the
// in-process mutex, the request slot `next.lua`, the prefs poller and the liveness checks.
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleepFor } from 'node:timers/promises';
import type { Logger } from './log.js';
import { silentLogger } from './log.js';
import { formatRequest, SESSION_RE, type RequestOp } from './lua.js';
import {
  extractResp,
  extractSessionHex,
  findPrefsFile,
  parseEnvelope,
  parseSession,
  type Envelope,
  type Session,
} from './prefs.js';

export const START_INSTRUCTION =
  'in Resolve open a project and run Workspace > Scripts > resolve_mcp_bridge, then retry';

export type BridgeErrorKind =
  | 'lock_held'
  | 'prefs_missing'
  | 'never_started'
  | 'stopped'
  | 'bridge_error'
  | 'resolve_gone'
  | 'timeout'
  | 'bad_response'
  | 'io_error';

export class BridgeError extends Error {
  constructor(
    public readonly kind: BridgeErrorKind,
    message: string,
    public readonly nextStep: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'BridgeError';
  }

  /** One line for an isError result: what failed, then what to do. */
  get text(): string {
    return `${this.message}: ${this.nextStep}`;
  }
}

/**
 * What one request did, handed to the optional `onRequest` observer once it has ended, on success
 * and on every failure. Times are epoch milliseconds from the client's clock; a phase that was
 * never reached is absent (no `lock_acquired_at` after `lock_held`, no `written_at` when the
 * request file could not be written). It carries no Lua code, no paths and no response body.
 */
export interface BridgeRequestReport {
  op: RequestOp;
  started_at: number;
  lock_acquired_at?: number;
  written_at?: number;
  finished_at: number;
  /** Prefs polls spent waiting for the reply. */
  polls: number;
  /** UTF-8 size of the request file. */
  request_bytes?: number;
  /** `ok` when an envelope came back (even one reporting a Lua error), else the failure kind. */
  outcome: 'ok' | BridgeErrorKind | 'unexpected';
  /** The envelope's own `ok`: false when the Lua chunk raised. */
  lua_ok?: boolean;
  /** How long the bridge says the chunk ran. */
  bridge_ms?: number;
}

export interface RequestOptions {
  code?: string | undefined;
  timeoutMs: number;
}

export type StatusReason =
  | 'never_started'
  | 'stopped'
  | 'resolve_gone'
  | 'no_reply'
  | 'bridge_error'
  | 'prefs_missing'
  | 'lock_held';

/** `owned` is true only while this process is inside a request; `holder_pid` is another live process inside one. */
export interface LockStatus {
  path: string;
  owned: boolean;
  holder_pid?: number;
}

export interface BridgeStatus {
  alive: boolean;
  reason?: StatusReason;
  detail?: string;
  prefs_file?: string;
  prefs_mtime?: string;
  session?: Session;
  pid_alive?: boolean;
  ping?: unknown;
  ping_ms?: number;
  lock: LockStatus;
  state_dir: string;
  state_dir_match?: boolean;
}

/** What server.ts depends on; BridgeClient in production, a recording stub in the tool tests. */
export interface Bridge {
  request(op: RequestOp, opts: RequestOptions): Promise<Envelope>;
  status(): Promise<BridgeStatus>;
}

export interface BridgeClientOptions {
  stateDir: string;
  prefsDir: string;
  maxResponseKb: number;
  logger?: Logger | undefined;
  /** Poll interval for the prefs file (default 25 ms). */
  pollMs?: number | undefined;
  /** Ping timeout used by status() (default 2000 ms). */
  pingTimeoutMs?: number | undefined;
  pid?: number | undefined;
  now?: (() => number) | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
  isPidAlive?: ((pid: number) => boolean) | undefined;
  /** Test seam: the two calls Windows may refuse while the bridge holds next.lua open (default node:fs/promises). */
  fs?: Pick<typeof fsp, 'unlink' | 'rename'> | undefined;
  /** Platform whose path rules state_dir_match follows (default process.platform). */
  platform?: NodeJS.Platform | undefined;
  /**
   * Observer called once per request after it has ended (see BridgeRequestReport), in the caller's
   * async context; a throw inside it is logged and ignored, so it can never change a request.
   */
  onRequest?: ((report: BridgeRequestReport) => void) | undefined;
}

export const REQUEST_FILE = 'next.lua';
export const REQUEST_TMP_FILE = 'next.lua.tmp';
export const LOCK_FILE = 'lock';
export const FORCED_READ_EVERY = 20;
/** How often a request re-tries a lock held by another live server (ms). */
const LOCK_POLL_MS = 50;
/** A dead holder's lock is taken over under this exclusive marker file next to the lock. */
export const LOCK_TAKEOVER_FILE = 'lock.takeover';
/** A takeover marker older than this belongs to a process that died inside its takeover; it is removed. */
const LOCK_TAKEOVER_STALE_MS = 30_000;

/**
 * Signal 0 is Node's platform-independent existence test (on Windows libuv opens the process and
 * checks its exit code: ESRCH once it is gone). EPERM means the pid exists but is not ours to
 * signal (another user's, or an elevated Resolve on Windows), so it counts as alive.
 */
export function defaultIsPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function errnoCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | undefined)?.code;
}

/**
 * The errno codes a Windows sharing violation surfaces as: libuv maps ERROR_SHARING_VIOLATION and
 * ERROR_LOCK_VIOLATION to EBUSY and ERROR_ACCESS_DENIED to EPERM; EACCES is included for good
 * measure. On POSIX these are permanent permission errors, so a caller pays at most
 * FS_RETRY_ATTEMPTS x FS_RETRY_DELAY_MS (about a second) before seeing the same failure.
 */
export const TRANSIENT_FS_CODES: ReadonlySet<string> = new Set(['EBUSY', 'EPERM', 'EACCES']);
export const FS_RETRY_ATTEMPTS = 20;
export const FS_RETRY_DELAY_MS = 50;

export interface RetryOptions {
  attempts?: number | undefined;
  delayMs?: number | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
}

/**
 * Run `fn`, retrying while it fails with a transient sharing error. Windows refuses unlink and
 * rename-over of a file another process holds open without FILE_SHARE_DELETE, and the C fopen
 * behind LuaJIT's loadfile grants no share-delete: the bridge re-loads next.lua every 50 ms while
 * it exists, so the server's delete (and a rename onto a leftover) can be refused for a few ms.
 */
export async function retryTransient<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? FS_RETRY_ATTEMPTS;
  const delayMs = opts.delayMs ?? FS_RETRY_DELAY_MS;
  const sleep = opts.sleep ?? ((ms: number) => sleepFor(ms));
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts || !TRANSIENT_FS_CODES.has(errnoCode(err) ?? '')) throw err;
      await sleep(delayMs);
    }
  }
}

/**
 * Whether two spellings of the state dir name the same directory as the file system sees it.
 * win32: `\` and `/` are one separator and case is ignored (the bridge may report the stamp's
 * C:/..., a user-typed RLB_STATE_DIR with backslashes, or USERPROFILE .. "/.davinci-resolve-lua-mcp",
 * mixed); POSIX: a trailing slash is dropped, nothing else.
 */
export function sameStateDir(a: string, b: string, platform: NodeJS.Platform): boolean {
  const canon = (p: string): string => {
    if (platform !== 'win32') return p.length > 1 ? p.replace(/\/+$/, '') : p;
    const s = p.replace(/\\/g, '/');
    return (s.length > 1 ? s.replace(/\/+$/, '') : s).toLowerCase();
  };
  return canon(a) === canon(b);
}

interface PollKey {
  ino: number;
  size: number;
  mtimeMs: number;
}

function pollKey(st: fs.Stats): PollKey {
  return { ino: st.ino, size: st.size, mtimeMs: st.mtimeMs };
}

function sameKey(a: PollKey | undefined, b: PollKey): boolean {
  return a !== undefined && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs;
}

export class BridgeClient implements Bridge {
  readonly stateDir: string;
  readonly prefsDir: string;
  readonly lockPath: string;
  readonly requestPath: string;
  private readonly tmpPath: string;
  private readonly maxResponseKb: number;
  private readonly log: Logger;
  private readonly pollMs: number;
  private readonly pingTimeoutMs: number;
  private readonly pid: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly isPidAlive: (pid: number) => boolean;
  private readonly fs: Pick<typeof fsp, 'unlink' | 'rename'>;
  private readonly platform: NodeJS.Platform;
  private readonly onRequest: ((report: BridgeRequestReport) => void) | undefined;
  private chain: Promise<unknown> = Promise.resolve();
  private lockOwned = false;
  private lockHolder: number | undefined;
  private lockProblem: string | undefined;

  constructor(opts: BridgeClientOptions) {
    this.stateDir = opts.stateDir;
    this.prefsDir = opts.prefsDir;
    this.lockPath = path.join(opts.stateDir, LOCK_FILE);
    this.requestPath = path.join(opts.stateDir, REQUEST_FILE);
    this.tmpPath = path.join(opts.stateDir, REQUEST_TMP_FILE);
    this.maxResponseKb = opts.maxResponseKb;
    this.log = opts.logger ?? silentLogger;
    this.pollMs = opts.pollMs ?? 25;
    this.pingTimeoutMs = opts.pingTimeoutMs ?? 2000;
    this.pid = opts.pid ?? process.pid;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => sleepFor(ms));
    this.isPidAlive = opts.isPidAlive ?? defaultIsPidAlive;
    this.fs = opts.fs ?? fsp;
    this.platform = opts.platform ?? process.platform;
    this.onRequest = opts.onRequest;
  }

  get lock(): LockStatus {
    const out: LockStatus = { path: this.lockPath, owned: this.lockOwned };
    if (!this.lockOwned && this.lockHolder !== undefined) out.holder_pid = this.lockHolder;
    return out;
  }

  // ---- lock -------------------------------------------------------------------------------

  /**
   * Take `<stateDir>/lock` (a hard link of a pid file, so it always holds our pid) for one request. The lock is held
   * only while a request is in flight, never while idle: Claude Desktop keeps an idle "era probe"
   * sibling of the server alive for the whole session, so a lock taken at startup would sit with
   * that sibling for ever (measured 2026-09-21). A dead holder is taken over under an exclusive
   * marker file (`takeOverDeadLock`), so two servers racing on the same dead lock cannot both win;
   * a live holder is waited for up to `waitMs`. Returns true when we own the lock.
   */
  async acquireLock(waitMs = 0): Promise<boolean> {
    const deadline = this.now() + waitMs;
    for (;;) {
      const r = await this.tryLock();
      if (r !== 'held') return r === 'owned';
      const left = deadline - this.now();
      if (left <= 0) return false;
      await this.sleep(Math.min(LOCK_POLL_MS, left));
    }
  }

  /**
   * One pass over the lock file: owned, held by a live pid, or a file-system problem. The lock is
   * created by hard-linking a pid file into place: `link` fails with EEXIST when the lock exists and
   * the new file already holds our pid, so no reader can ever see an empty lock and mistake a live
   * owner for a stale one (an `open(wx)` + write pair had that window, and two racing servers could
   * both end up owning the slot).
   */
  private async tryLock(): Promise<'owned' | 'held' | 'error'> {
    if (this.lockOwned) return 'owned';
    const pidFile = `${this.lockPath}.${this.pid}.pid`;
    try {
      await fsp.writeFile(pidFile, `${this.pid}\n`);
    } catch (err) {
      this.log.warn('lock: cannot write the pid file', err);
      this.lockProblem = (err as Error).message;
      return 'error';
    }
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await fsp.link(pidFile, this.lockPath);
          this.lockOwned = true;
          this.lockHolder = undefined;
          this.lockProblem = undefined;
          this.log.debug('lock acquired', { path: this.lockPath });
          return 'owned';
        } catch (err) {
          if (errnoCode(err) !== 'EEXIST') {
            this.log.warn('lock: cannot create', err);
            this.lockOwned = false;
            this.lockProblem = (err as Error).message;
            return 'error';
          }
        }
        const holder = await this.readLockPid();
        if (holder === this.pid) {
          this.lockOwned = true;
          this.lockHolder = undefined;
          return 'owned';
        }
        if (holder !== undefined && this.isPidAlive(holder)) {
          this.lockOwned = false;
          this.lockHolder = holder;
          return 'held';
        }
        // Dead (or unreadable) holder. The verdict and the removal must not be separate steps: a
        // racer that judged the holder dead and then renamed the lock away could remove a lock that
        // another racer had taken in between (seen on CI 2026-09-21: four racers, two owners).
        const took = await this.takeOverDeadLock(pidFile);
        if (took === 'owned') {
          this.lockOwned = true;
          this.lockHolder = undefined;
          this.lockProblem = undefined;
          return 'owned';
        }
        if (took !== 'retry') return took;
      }
      this.lockOwned = false;
      this.lockProblem = 'the lock file kept changing under us';
      return 'error';
    } finally {
      await fsp.unlink(pidFile).catch(() => undefined);
    }
  }

  /**
   * Take over a lock whose holder is dead, one process at a time. `open(wx)` of the marker file is
   * the mutual exclusion; the holder is re-read under it, and that read is the verdict that counts;
   * the dead lock is then replaced by renaming our pid file over it, which never leaves the slot
   * empty for a fresh `link` to slip into. While the marker exists the lock cannot change identity:
   * a fresh `link` fails on the existing file, a release needs a live owner, and other takeovers
   * wait ('held', so the caller polls). A marker older than LOCK_TAKEOVER_STALE_MS belongs to a
   * process that died inside its takeover and is removed. 'retry' means the lock vanished or an
   * abandoned marker was removed: `tryLock` starts over with a plain link.
   */
  private async takeOverDeadLock(pidFile: string): Promise<'owned' | 'held' | 'retry' | 'error'> {
    const marker = path.join(path.dirname(this.lockPath), LOCK_TAKEOVER_FILE);
    let fh: fsp.FileHandle;
    try {
      fh = await fsp.open(marker, 'wx');
    } catch (err) {
      if (errnoCode(err) !== 'EEXIST') {
        this.log.warn('lock: cannot create the takeover marker', err);
        this.lockOwned = false;
        this.lockProblem = (err as Error).message;
        return 'error';
      }
      let ageMs: number;
      try {
        ageMs = Date.now() - (await fsp.stat(marker)).mtimeMs;
      } catch (statErr) {
        if (errnoCode(statErr) === 'ENOENT') return 'retry'; // that takeover just finished
        this.log.warn('lock: cannot stat the takeover marker', statErr);
        this.lockOwned = false;
        this.lockProblem = (statErr as Error).message;
        return 'error';
      }
      if (ageMs <= LOCK_TAKEOVER_STALE_MS) {
        this.lockOwned = false;
        this.lockHolder = undefined;
        this.lockProblem = `another server is taking over a stale lock (${marker})`;
        return 'held';
      }
      await fsp.unlink(marker).catch(() => undefined);
      this.log.warn('lock: removed an abandoned takeover marker', { marker, age_ms: Math.round(ageMs) });
      return 'retry';
    }
    try {
      try {
        await fh.writeFile(`${this.pid}\n`);
      } finally {
        await fh.close();
      }
      const holder = await this.readLockPid();
      if (holder === this.pid) return 'owned';
      if (holder !== undefined && this.isPidAlive(holder)) {
        this.lockOwned = false;
        this.lockHolder = holder;
        return 'held';
      }
      try {
        await fsp.stat(this.lockPath);
      } catch (err) {
        if (errnoCode(err) === 'ENOENT') return 'retry'; // released meanwhile: a plain link will do
        throw err;
      }
      await fsp.rename(pidFile, this.lockPath);
      this.log.info('lock: took over a dead lock', { holder });
      return 'owned';
    } catch (err) {
      this.log.warn('lock: cannot take over', err);
      this.lockOwned = false;
      this.lockProblem = (err as Error).message;
      return 'error';
    } finally {
      await fsp.unlink(marker).catch(() => undefined);
    }
  }

  private async readLockPid(): Promise<number | undefined> {
    try {
      const text = await fsp.readFile(this.lockPath, 'utf8');
      const n = Number.parseInt(text.trim(), 10);
      return Number.isInteger(n) && n > 0 ? n : undefined;
    } catch {
      return undefined;
    }
  }

  /** Release the lock if the file still holds our pid. Safe to call from process 'exit'. */
  releaseLockSync(): void {
    if (!this.lockOwned) return;
    this.lockOwned = false;
    try {
      const text = fs.readFileSync(this.lockPath, 'utf8');
      if (Number.parseInt(text.trim(), 10) === this.pid) fs.unlinkSync(this.lockPath);
    } catch {
      // already gone
    }
  }

  private async ensureLock(waitMs: number): Promise<void> {
    if (await this.acquireLock(waitMs)) return;
    const holder = this.lockHolder;
    if (holder === undefined) {
      throw new BridgeError(
        'lock_held',
        `cannot take the request slot lock ${this.lockPath} (${this.lockProblem ?? 'unknown problem'})`,
        'the lock is a hard link, so RLB_STATE_DIR must be a writable directory on a local NTFS/ReFS (Windows) or APFS/HFS+ (macOS) volume, not FAT/exFAT, a network share or a cloud-synced folder; fix that or point RLB_STATE_DIR elsewhere',
        { lock: this.lockPath },
      );
    }
    throw new BridgeError(
      'lock_held',
      `another server (pid ${holder}) kept the request slot lock ${this.lockPath} for more than ${(waitMs / 1000).toFixed(1)} s`,
      'it may be running a long chunk: wait, then retry; if it persists, stop the other davinci-resolve-lua-mcp server (a second Claude Desktop entry, make smoke or a dev-register loop) or point RLB_STATE_DIR elsewhere; remove the lock file by hand if the pid is not a server',
      { lock: this.lockPath, holder_pid: holder, waited_ms: waitMs },
    );
  }

  /** The lock as it is on disk right now: a live holder's pid, or none (a stale file counts as free). */
  async inspectLock(): Promise<LockStatus> {
    const out: LockStatus = { path: this.lockPath, owned: this.lockOwned };
    if (this.lockOwned) return out;
    const holder = await this.readLockPid();
    if (holder !== undefined && holder !== this.pid && this.isPidAlive(holder)) out.holder_pid = holder;
    return out;
  }

  /**
   * Startup hygiene, lock owner only: a request file left by an earlier server (or the sandbox
   * diagnostic) would make a bridge launched later pre-seed its `last_id` from it.
   */
  async removeStaleRequest(): Promise<boolean> {
    if (!this.lockOwned) return false;
    let removed = false;
    for (const p of [this.requestPath, this.tmpPath]) {
      try {
        await retryTransient(() => this.fs.unlink(p), { sleep: this.sleep });
        removed = true;
        this.log.info('removed a leftover request file', { path: p });
      } catch (err) {
        if (errnoCode(err) !== 'ENOENT') this.log.warn('cannot remove leftover request file', err);
      }
    }
    return removed;
  }

  // ---- session ------------------------------------------------------------------------------

  private async locatePrefs(): Promise<{ path: string; mtimeMs: number }> {
    const found = await findPrefsFile(this.prefsDir);
    if (!found) {
      throw new BridgeError(
        'prefs_missing',
        `no Fusion.prefs under ${this.prefsDir}`,
        'check that DaVinci Resolve has been launched at least once on this computer, or set RLB_PREFS_DIR (the Fusion prefs folder setting) to its Fusion/Profiles folder (macOS: ~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Profiles; Windows: %APPDATA%\\Blackmagic Design\\DaVinci Resolve\\Support\\Fusion\\Profiles)',
        { prefs_dir: this.prefsDir },
      );
    }
    return found;
  }

  /** Parse RLBSession out of the prefs text; undefined when the bridge never wrote one. */
  private readSession(text: string): Session | undefined {
    const hex = extractSessionHex(text);
    if (hex === undefined || hex === '') return undefined;
    try {
      return parseSession(hex);
    } catch (err) {
      throw new BridgeError(
        'bridge_error',
        `RLBSession in Fusion.prefs is unreadable (${(err as Error).message})`,
        START_INSTRUCTION,
      );
    }
  }

  /** Throw the BridgeError that describes why `op` cannot be sent, or return the live session. */
  private requireRunning(session: Session | undefined, op: RequestOp): Session {
    if (!session) {
      throw new BridgeError('never_started', 'bridge not running (never started)', START_INSTRUCTION);
    }
    if (session.state === 'stopped') {
      const when = session.stopped ? ` at ${new Date(session.stopped * 1000).toISOString()}` : '';
      throw new BridgeError(
        'stopped',
        `bridge not running (stopped${when})`,
        START_INSTRUCTION,
        { session: session.session },
      );
    }
    if (session.state === 'error') {
      throw new BridgeError(
        'bridge_error',
        `the bridge failed to start: ${session.error ?? 'no detail'}`,
        `fix the cause, then ${START_INSTRUCTION}`,
        { session: session.session },
      );
    }
    if (session.pid !== undefined && session.pid > 0 && !this.isPidAlive(session.pid)) {
      throw new BridgeError(
        'resolve_gone',
        `bridge not running (Resolve pid ${session.pid} is gone)`,
        START_INSTRUCTION,
        { pid: session.pid, op },
      );
    }
    if (!SESSION_RE.test(session.session) || session.session === '*') {
      throw new BridgeError(
        'bridge_error',
        `RLBSession holds an unusable session token ${JSON.stringify(session.session)}`,
        START_INSTRUCTION,
      );
    }
    return session;
  }

  // ---- requests -------------------------------------------------------------------------------

  private withMutex<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  request(op: RequestOp, opts: RequestOptions): Promise<Envelope> {
    return this.withMutex(() => this.requestLocked(op, opts));
  }

  ping(timeoutMs: number = this.pingTimeoutMs): Promise<Envelope> {
    return this.request('ping', { timeoutMs });
  }

  run(code: string, timeoutMs: number): Promise<Envelope> {
    return this.request('run', { code, timeoutMs });
  }

  stop(timeoutMs: number = this.pingTimeoutMs): Promise<Envelope> {
    return this.request('stop', { timeoutMs });
  }

  private async requestLocked(op: RequestOp, opts: RequestOptions): Promise<Envelope> {
    const entry = this.now();
    const report: BridgeRequestReport = { op, started_at: entry, finished_at: entry, polls: 0, outcome: 'ok' };
    try {
      await this.ensureLock(opts.timeoutMs);
      report.lock_acquired_at = this.now();
      try {
        const env = await this.exchange(op, opts, entry, report);
        report.lua_ok = env.ok;
        if (env.ms !== undefined) report.bridge_ms = env.ms;
        return env;
      } finally {
        this.releaseLockSync();
      }
    } catch (err) {
      report.outcome = err instanceof BridgeError ? err.kind : 'unexpected';
      throw err;
    } finally {
      report.finished_at = this.now();
      this.emitReport(report);
    }
  }

  private emitReport(report: BridgeRequestReport): void {
    if (!this.onRequest) return;
    try {
      this.onRequest(report);
    } catch (err) {
      this.log.error('onRequest hook threw', err);
    }
  }

  /** The request/response exchange proper; the caller holds the lock and releases it afterwards. */
  private async exchange(op: RequestOp, opts: RequestOptions, entry: number, report: BridgeRequestReport): Promise<Envelope> {
    const prefs = await this.locatePrefs();
    const text = await this.readText(prefs.path);
    // Read fresh every time: a stale session id sent to a live bridge makes that bridge exit.
    const session = this.requireRunning(this.readSession(text), op);

    // Baseline before the request exists: a bridge tick plus a 1 to 6 ms save can land before a
    // baseline taken afterwards, which would hide the response until an unrelated save.
    let last: PollKey | undefined;
    try {
      last = pollKey(await fsp.stat(prefs.path));
    } catch {
      last = undefined;
    }

    const id = randomUUID().replace(/-/g, '');
    const body = formatRequest({
      id,
      session: op === 'run' ? session.session : '*',
      op,
      ts: Math.floor(this.now() / 1000),
      maxKb: this.maxResponseKb,
      code: opts.code,
    });
    try {
      await fsp.writeFile(this.tmpPath, body, 'utf8');
      // A leftover next.lua the bridge has open makes the rename-over fail on Windows for a few ms.
      await retryTransient(() => this.fs.rename(this.tmpPath, this.requestPath), { sleep: this.sleep });
    } catch (err) {
      await fsp.unlink(this.tmpPath).catch(() => undefined);
      throw new BridgeError(
        'io_error',
        `cannot write the request file ${this.requestPath} (${(err as Error).message})`,
        'check that RLB_STATE_DIR is writable',
        { id },
      );
    }
    report.written_at = this.now();
    report.request_bytes = Buffer.byteLength(body, 'utf8');
    this.log.debug('request written', { id, op, bytes: body.length });

    const started = this.now();
    const deadline = entry + opts.timeoutMs; // the wait for the lock counts against the same budget
    let polls = 0;
    try {
      for (;;) {
        await this.sleep(this.pollMs);
        polls += 1;
        report.polls = polls;
        let st: fs.Stats | undefined;
        try {
          st = await fsp.stat(prefs.path);
        } catch {
          st = undefined; // mid-rename; try again next tick
        }
        const key = st ? pollKey(st) : undefined;
        const changed = key !== undefined && !sameKey(last, key);
        if (changed || polls % FORCED_READ_EVERY === 0) {
          if (key) last = key;
          const resp = extractResp(await this.readText(prefs.path));
          if (resp && resp.id === id) {
            let env: Envelope;
            try {
              env = parseEnvelope(resp.hex);
            } catch (err) {
              throw new BridgeError(
                'bad_response',
                `the bridge answered request ${id} with a body the server cannot decode (${(err as Error).message})`,
                'retry; if it repeats, the installed bridge script and this server disagree on the protocol: restart Claude Desktop so the server reinstalls the script, then relaunch it from the Scripts menu',
                { id },
              );
            }
            if (env.session !== session.session && env.session !== '') {
              this.log.warn('response session differs from the request session', { id, sent: session.session, got: env.session });
            }
            this.log.debug('response received', { id, op, ok: env.ok, ms: this.now() - started });
            return env;
          }
        }
        if (this.now() >= deadline) {
          throw new BridgeError(
            'timeout',
            `the bridge did not answer request ${id} within ${((this.now() - started) / 1000).toFixed(1)} s`,
            `either the bridge is busy on a long synchronous call (wait, then retry), or its loop is gone (${START_INSTRUCTION})`,
            { id, op, timeout_ms: opts.timeoutMs },
          );
        }
      }
    } finally {
      // The bridge cannot delete files; a slot that stays occupied is never re-run (same id). Windows
      // may refuse the delete for a few ms while the bridge's loadfile holds the file: retried, then logged.
      try {
        await retryTransient(() => this.fs.unlink(this.requestPath), { sleep: this.sleep });
      } catch (err) {
        if (errnoCode(err) !== 'ENOENT') {
          this.log.warn('cannot remove the request file; the next request replaces it', { path: this.requestPath, error: (err as Error).message });
        }
      }
    }
  }

  private async readText(p: string): Promise<string> {
    try {
      return await fsp.readFile(p, 'utf8');
    } catch (err) {
      throw new BridgeError(
        'io_error',
        `cannot read ${p} (${(err as Error).message})`,
        'check the file permissions of Fusion.prefs',
      );
    }
  }

  // ---- status ---------------------------------------------------------------------------------

  /** Never throws; every failure becomes a reason. Used by resolve_status. */
  async status(): Promise<BridgeStatus> {
    const out: BridgeStatus = { alive: false, lock: this.lock, state_dir: this.stateDir };
    try {
      out.lock = await this.inspectLock();
      const prefs = await this.locatePrefs();
      out.prefs_file = prefs.path;
      out.prefs_mtime = new Date(prefs.mtimeMs).toISOString();
      const text = await this.readText(prefs.path);
      const session = this.readSession(text);
      if (session) {
        out.session = session;
        if (session.pid !== undefined && session.pid > 0) out.pid_alive = this.isPidAlive(session.pid);
        if (session.state_dir !== undefined) {
          out.state_dir_match = sameStateDir(session.state_dir, this.stateDir, this.platform);
        }
      }
      this.requireRunning(session, 'ping');
      const t0 = this.now();
      try {
        const env = await this.ping();
        out.ping = env.result;
        out.ping_ms = this.now() - t0;
        out.alive = env.ok;
        if (!env.ok) {
          out.reason = 'bridge_error';
          out.detail = typeof env.error === 'string' ? env.error : JSON.stringify(env.error);
        }
      } catch (err) {
        if (err instanceof BridgeError && err.kind === 'timeout') {
          out.reason = 'no_reply';
          out.detail = err.text;
        } else {
          throw err;
        }
      }
    } catch (err) {
      out.lock = this.lock;
      if (err instanceof BridgeError) {
        out.reason = kindToReason(err.kind);
        out.detail = err.text;
      } else {
        out.reason = 'bridge_error';
        out.detail = (err as Error).message;
      }
    }
    return out;
  }
}

function kindToReason(kind: BridgeErrorKind): StatusReason {
  switch (kind) {
    case 'lock_held':
    case 'prefs_missing':
    case 'never_started':
    case 'stopped':
    case 'resolve_gone':
    case 'bridge_error':
      return kind;
    case 'timeout':
      return 'no_reply';
    case 'bad_response':
    case 'io_error':
      return 'bridge_error';
  }
}
