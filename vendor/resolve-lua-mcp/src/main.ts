// main(options): the server's wiring, factored out of index.ts so a private instrumented build can
// import it and add hooks: config, logging, the lock, the stdio transport,
// then the self-install check. stdout is the MCP transport: nothing here writes to it.
//
// Hooks, all optional and no-ops by default:
//   wrapServer(server)      applied to the McpServer right after createServer builds it and before
//                           the transport gets it; must return that McpServer or a Proxy over it
//                           (serveStdio checks `instanceof McpServer`)
//   onToolFailure(err, t)   forwarded to createServer (ServerDeps.onToolFailure)
//   onToolError(err, t)     forwarded to createServer (ServerDeps.onToolError)
//   onBridgeRequest(r)      forwarded to the BridgeClient (BridgeClientOptions.onRequest): one
//                           BridgeRequestReport per request, in the calling tool's async context
//   beforeExit()            awaited, with a cap, on every exit path: the clean shutdown before the
//                           lock is released and the crash handlers before exit(1), so a monitoring
//                           flush is never cut short
// `runtime` holds the test seams (env, process, transport); production uses the process defaults.
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type { McpServer, Transport } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { installBridgeFiles, type InstallResult } from './bridgeInstall.js';
import { loadConfig } from './config.js';
import { DocsIndex } from './docsSearch.js';
import { createLogger, type Logger } from './log.js';
import { BridgeClient, type BridgeError, type BridgeRequestReport } from './protocol.js';
import { createServer, SERVER_VERSION, type ToolName } from './server.js';

/** The bundle root (holds bridge/ and scripts/) both from src/ in development and from server/ in the bundle. */
const BUNDLE_DIR = path.resolve(__dirname, '..');
const RETRYABLE_INSTALL = new Set(['scripts_dir_missing', 'permission_denied', 'error']);
const DEFAULT_BEFORE_EXIT_CAP_MS = 2000;
/** The host closes stdin to ask for a shutdown, then waits before SIGTERM (MCP stdio transport). */
const STDIN_GRACE_MS = 5000;

/** What main() needs from `process`; a fake EventEmitter satisfies it structurally in tests. */
export interface MainProcess {
  readonly pid: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- process.on's own listener type
  on(event: string, listener: (...args: any[]) => void): unknown;
  exit(code: number): void;
  stdin: { on(event: 'end', listener: () => void): unknown };
}

export interface MainRuntime {
  env: NodeJS.ProcessEnv;
  proc: MainProcess;
  /** Bring-your-own transport (tests pass the server half of InMemoryTransport.createLinkedPair()); default: real stdio. */
  transport?: Transport | undefined;
  /** How long beforeExit may run before the exit proceeds without it (default 2000 ms). */
  beforeExitCapMs?: number | undefined;
}

export interface MainOptions {
  wrapServer?: ((server: McpServer) => McpServer) | undefined;
  onToolFailure?: ((error: BridgeError, tool: ToolName) => void) | undefined;
  onToolError?: ((error: unknown, tool: ToolName) => void) | undefined;
  onBridgeRequest?: ((report: BridgeRequestReport) => void) | undefined;
  beforeExit?: (() => Promise<void>) | undefined;
  runtime?: Partial<MainRuntime> | undefined;
}

export interface MainHandle {
  /** Close the transport, run beforeExit, release the lock, exit(code). Later calls return the first shutdown. */
  shutdown(why: string, code: number): Promise<void>;
}

export async function main(options: MainOptions = {}): Promise<MainHandle> {
  const runtime: MainRuntime = { env: process.env, proc: process, ...options.runtime };
  const proc = runtime.proc;
  const capMs = runtime.beforeExitCapMs ?? DEFAULT_BEFORE_EXIT_CAP_MS;

  // Crash handlers first, so nothing below can die silently; the logger and the bridge come later.
  let logger: Logger | undefined;
  let bridge: BridgeClient | undefined;
  let exited = false;
  const exitNow = (code: number): void => {
    if (exited) return;
    exited = true;
    bridge?.releaseLockSync();
    proc.exit(code);
  };
  const runBeforeExit = async (): Promise<void> => {
    const hook = options.beforeExit;
    if (!hook) return;
    let timer: NodeJS.Timeout | undefined;
    const cap = new Promise<void>((resolve) => {
      // Ref'd on purpose: once the transport is closed nothing else keeps the event loop alive,
      // and an unref'd timer would let Node exit on its own before exit(code) runs.
      timer = setTimeout(() => {
        logger?.warn('beforeExit hook still running after the cap; exiting without it', { cap_ms: capMs });
        resolve();
      }, capMs);
    });
    try {
      await Promise.race([Promise.resolve().then(hook), cap]);
    } catch (err) {
      logger?.error('beforeExit hook threw', err);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  const crash = (what: string, err: unknown): void => {
    const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error(`${new Date().toISOString()} ERROR ${what}: ${detail}`);
    logger?.error(what, err);
    void runBeforeExit().finally(() => exitNow(1));
  };
  proc.on('uncaughtException', (err: unknown) => crash('uncaught exception', err));
  proc.on('unhandledRejection', (reason: unknown) => crash('unhandled rejection', reason));
  proc.on('exit', () => bridge?.releaseLockSync());

  const config = loadConfig(runtime.env);
  let logFile: string | undefined = path.join(config.stateDir, 'server.log');
  try {
    // `mode` is not supported on Windows (fs.mkdir docs): the directory inherits %USERPROFILE%'s ACLs, the equivalent.
    await fsp.mkdir(config.stateDir, { recursive: true, mode: 0o700 });
  } catch (err) {
    config.problems.push(`cannot create RLB_STATE_DIR ${config.stateDir}: ${(err as Error).message}`);
    logFile = undefined;
  }
  const log = createLogger({ file: logFile, level: config.logLevel });
  logger = log;
  log.info('starting', { version: SERVER_VERSION, pid: proc.pid, node: process.version, state_dir: config.stateDir });
  for (const p of config.problems) log.warn('config problem', p);
  if (config.platform === 'win32') log.debug('state dir: mode 0700 is not applied on Windows; the directory inherits its parent ACLs', { state_dir: config.stateDir });

  const client = new BridgeClient({
    stateDir: config.stateDir,
    prefsDir: config.prefsDir,
    maxResponseKb: config.maxResponseKb,
    logger: log,
    pid: proc.pid,
    platform: config.platform,
    onRequest: options.onBridgeRequest,
  });
  bridge = client;
  // The lock is taken per request, never held while idle (Claude Desktop keeps an idle era-probe
  // sibling of the server alive all session; a startup lock would sit with it). Startup hygiene
  // takes it for a moment: a request file left by an earlier server would make a bridge launched
  // later pre-seed its last_id from it.
  if (await client.acquireLock()) {
    try {
      await client.removeStaleRequest();
    } finally {
      client.releaseLockSync();
    }
  } else {
    log.info('request slot busy at startup; leftover-request check skipped', client.lock);
  }

  const docs = new DocsIndex(config.docsDir);

  let installResult: InstallResult | undefined;
  let installing: Promise<InstallResult> | undefined;
  const install = (): Promise<InstallResult> => {
    if (installResult && !RETRYABLE_INSTALL.has(installResult.outcome)) return Promise.resolve(installResult);
    if (!installing) {
      installing = installBridgeFiles({
        scriptsDir: config.scriptsDir,
        stateDir: config.stateDir,
        autoInstall: config.autoInstall,
        bundleDir: BUNDLE_DIR,
        logger: log,
      })
        .then((r) => {
          installResult = r;
          return r;
        })
        .finally(() => {
          installing = undefined;
        });
    }
    return installing;
  };

  const factory = (): McpServer => {
    const server = createServer({ config, bridge: client, docs, install, logger: log, logFile, onToolFailure: options.onToolFailure, onToolError: options.onToolError });
    return options.wrapServer ? options.wrapServer(server) : server;
  };
  const handle = serveStdio(factory, {
    onerror: (err) => log.error('transport error', err),
    ...(runtime.transport ? { transport: runtime.transport } : {}),
  });
  log.info('serving on stdio');

  // After the transport is up, so the host never waits on file I/O.
  setImmediate(() => {
    install()
      .then((r) => log.info('bridge script check', { outcome: r.outcome, message: r.message }))
      .catch((err: unknown) => log.error('bridge script check failed', err));
  });

  let closing: Promise<void> | undefined;
  const doShutdown = async (why: string, code: number): Promise<void> => {
    log.info('shutting down', { why });
    // The lock guards an in-flight request's slot: release it only after the transport (and any
    // tool call still polling the prefs file) has finished, never before.
    await handle.close().catch(() => undefined);
    await runBeforeExit();
    exitNow(code);
  };
  const shutdown = (why: string, code: number): Promise<void> => (closing ??= doShutdown(why, code));
  proc.on('SIGINT', () => void shutdown('SIGINT', 0));
  proc.on('SIGTERM', () => void shutdown('SIGTERM', 0));
  // Windows: Ctrl+Break, the one signal a console can deliver besides SIGINT (SIGTERM cannot be received
  // there; subprocess.kill() is TerminateProcess and runs no handler). Any platform may listen for it.
  proc.on('SIGBREAK', () => void shutdown('SIGBREAK', 0));
  // In-flight tool calls finish first (the event loop drains on its own); the unref'd timer only
  // forces the exit when something keeps the loop alive.
  proc.stdin.on('end', () => {
    log.info('stdin closed; exiting once in-flight work is done');
    setTimeout(() => void shutdown('stdin closed (grace period over)', 0), STDIN_GRACE_MS).unref();
  });
  return { shutdown };
}
