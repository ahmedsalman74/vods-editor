// RLB_* environment parsing. Never throws: every bad value falls back to its default and is
// recorded in `problems`, which resolve_status reports. The defaults depend on the platform:
// Blackmagic documents the per-user Resolve folders for macOS (~/Library/Application Support/...)
// and Windows (%APPDATA%\...\Support\...); the Windows ones are documented, not measured.
import * as os from 'node:os';
import * as path from 'node:path';
import { isLogLevel, type LogLevel } from './log.js';

export type Platform = NodeJS.Platform;

export interface Config {
  /** process.platform of the server (or the value a test injected); 'win32' selects the Windows defaults and path rules. */
  platform: Platform;
  /** What the defaults and `~` derive from: os.homedir() ($HOME on macOS, %USERPROFILE% on Windows). */
  home: string;
  /**
   * Request slot, lock and server.log live here (mode 0700 on POSIX; Windows inherits the profile
   * folder's ACLs). Absolute, no trailing separator; on win32 spelled with forward slashes
   * (C:/Users/x/.davinci-resolve-lua-mcp) because it is stamped into the Lua files and compared
   * with the bridge's RLBSession.state_dir, and LuaJIT's loadfile accepts `/` on Windows.
   */
  stateDir: string;
  /** Resolve's user Utility scripts folder: the only Resolve path the server writes (native spelling). */
  scriptsDir: string;
  autoInstall: boolean;
  /** Default `timeout_s` for run_lua and the bridge-backed tools, 1..300. */
  defaultTimeoutS: number;
  /** Response cap sent to the bridge as `max_kb`, 1..192. */
  maxResponseKb: number;
  logLevel: LogLevel;
  /** Directory holding `<profile>/Fusion.prefs`; the newest profile file is used (native spelling). */
  prefsDir: string;
  /** Blackmagic's shipped scripting docs (read-only, native spelling). */
  docsDir: string;
  problems: string[];
}

export const TIMEOUT_MIN_S = 1;
export const TIMEOUT_MAX_S = 300;
export const RESPONSE_KB_MIN = 1;
export const RESPONSE_KB_MAX = 192;

export const DEFAULT_TIMEOUT_S = 30;
export const DEFAULT_RESPONSE_KB = 64;
/** The macOS docs folder; `defaultDocsDir` gives the platform's. */
export const DEFAULT_DOCS_DIR =
  '/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting';

/** path.posix or path.win32, never the host's `path`: the Mac test suite asserts the exact Windows strings. */
function pathFor(platform: Platform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix;
}

const RESOLVE_MAC = 'Library/Application Support/Blackmagic Design/DaVinci Resolve';
/** Blackmagic's README: the per-user Windows folders sit under `...\DaVinci Resolve\Support\`. */
const RESOLVE_WIN = ['Blackmagic Design', 'DaVinci Resolve', 'Support'] as const;

/** %APPDATA% (Blackmagic roots the per-user Resolve folders there), else its documented place under the profile. */
function appDataDir(env: NodeJS.ProcessEnv, home: string): string {
  return pick(env, 'APPDATA') ?? path.win32.join(home, 'AppData', 'Roaming');
}

function programDataDir(env: NodeJS.ProcessEnv): string {
  return pick(env, 'PROGRAMDATA') ?? 'C:\\ProgramData';
}

export function defaultStateDir(home: string, platform: Platform): string {
  return pathFor(platform).join(home, '.davinci-resolve-lua-mcp');
}

export function defaultScriptsDir(home: string, platform: Platform, env: NodeJS.ProcessEnv): string {
  if (platform === 'win32') return path.win32.join(appDataDir(env, home), ...RESOLVE_WIN, 'Fusion', 'Scripts', 'Utility');
  return path.posix.join(home, RESOLVE_MAC, 'Fusion/Scripts/Utility');
}

export function defaultPrefsDir(home: string, platform: Platform, env: NodeJS.ProcessEnv): string {
  if (platform === 'win32') return path.win32.join(appDataDir(env, home), ...RESOLVE_WIN, 'Fusion', 'Profiles');
  return path.posix.join(home, RESOLVE_MAC, 'Fusion/Profiles');
}

export function defaultDocsDir(platform: Platform, env: NodeJS.ProcessEnv): string {
  if (platform === 'win32') return path.win32.join(programDataDir(env), ...RESOLVE_WIN, 'Developer', 'Scripting');
  return DEFAULT_DOCS_DIR;
}

/**
 * `~`, `~/x`, `${HOME}` and `${HOME}/x` become absolute; on win32 `~\x` and `${HOME}\x` too.
 * Anything else is returned unchanged. The MCPB manifest spec lets a `user_config.default` use
 * `${HOME}`, but Claude Desktop 2.2553.1 passed the default through literally (measured
 * 2026-09-21), so the server expands it as well. `platform` is required so no call site silently
 * depends on the host.
 */
export function expandHome(value: string, home: string, platform: Platform): string {
  if (value === '~' || value === '${HOME}') return home;
  const seps = platform === 'win32' ? ['/', '\\'] : ['/'];
  for (const prefix of ['~', '${HOME}']) {
    for (const sep of seps) {
      if (value.startsWith(prefix + sep)) return pathFor(platform).join(home, value.slice(prefix.length + 1));
    }
  }
  return value;
}

/**
 * The state directory is spliced into the Lua files at install time, into a `[==[...]==]` literal
 * in each. Characters that could close the literal, a backslash or a quote (the server spells a
 * Windows state directory with forward slashes before this check, so either means a caller
 * bypassed loadConfig), a line break, or the `@@` prefix the bridge treats as "unstamped", are
 * refused.
 */
export function stateDirStampProblem(dir: string): string | undefined {
  if (dir.includes(']==]')) return 'contains "]==]", which would close the Lua long-bracket stamp';
  if (dir.includes('"')) return 'contains a double quote, which the Lua stamp refuses';
  if (dir.includes('\\')) return 'contains a backslash, which the Lua stamp refuses (on Windows the server spells the state directory with forward slashes)';
  if (/[\r\n]/.test(dir)) return 'contains a line break';
  if (dir.startsWith('@@')) return 'starts with "@@", which the bridge treats as an unstamped placeholder';
  return undefined;
}

/** True when every character is printable ASCII: what LuaJIT's ANSI `fopen` on Windows is sure to open. */
export function isAsciiPath(p: string): boolean {
  return !/[^\x20-\x7e]/.test(p);
}

/**
 * A `user_config` setting with no manifest `default` that the user never saved reaches the server
 * as its unfilled placeholder: Claude Desktop 2.7032.0 passed `${user_config.scripts_dir}` and
 * `${user_config.prefs_dir}` literally (measured 2026-09-24).
 */
const UNFILLED_USER_CONFIG = /^\$\{user_config\.\w+\}$/;

function pick(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const raw = env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  // An unset setting arrives as "" (an empty directory picker) or as its unfilled placeholder;
  // both mean unset, so the platform default applies without a problem.
  return trimmed === '' || UNFILLED_USER_CONFIG.test(trimmed) ? undefined : trimmed;
}

/** Drop trailing separators, but never turn a root (`/`, `C:\`) into something else. */
function trimTrailingSep(dir: string, platform: Platform): string {
  if (platform !== 'win32') return dir.replace(/(.)\/+$/, '$1');
  const t = dir.replace(/(.)[\\/]+$/, '$1');
  return /^[A-Za-z]:$/.test(t) ? `${t}\\` : t;
}

function readDir(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: string,
  home: string,
  platform: Platform,
  problems: string[],
): string {
  const p = pathFor(platform);
  const raw = pick(env, name);
  if (raw === undefined) return fallback;
  const expanded = expandHome(raw, home, platform);
  if (!p.isAbsolute(expanded)) {
    problems.push(`${name}="${raw}" is not an absolute path; using ${fallback}`);
    return fallback;
  }
  return trimTrailingSep(p.normalize(expanded), platform);
}

function readInt(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
  problems: string[],
): number {
  const raw = pick(env, name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    problems.push(`${name}="${raw}" is not an integer in ${min}..${max}; using ${fallback}`);
    return fallback;
  }
  return n;
}

function readBool(env: NodeJS.ProcessEnv, name: string, fallback: boolean, problems: string[]): boolean {
  const raw = pick(env, name);
  if (raw === undefined) return fallback;
  const v = raw.toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(v)) return true;
  if (['false', '0', 'no', 'off'].includes(v)) return false;
  problems.push(`${name}="${raw}" is not a boolean; using ${fallback}`);
  return fallback;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
  platform: Platform = process.platform,
): Config {
  const problems: string[] = [];
  let stateDir = readDir(env, 'RLB_STATE_DIR', defaultStateDir(home, platform), home, platform, problems);
  // win32: the state dir is the one path that crosses into Lua. LuaJIT's fopen/loadfile and Node's
  // fs both accept forward slashes on Windows, so the server spells it C:/Users/x/... everywhere
  // (config, stamp, log, resolve_status) and stateDirStampProblem keeps refusing backslashes.
  if (platform === 'win32') stateDir = stateDir.replace(/\\/g, '/');
  const stampProblem = stateDirStampProblem(stateDir);
  if (stampProblem) {
    problems.push(`RLB_STATE_DIR="${stateDir}" ${stampProblem}; the bridge files cannot be installed with it`);
  }
  if (platform === 'win32' && !isAsciiPath(stateDir)) {
    problems.push(
      `RLB_STATE_DIR="${stateDir}" contains non-ASCII characters; the Lua runtime inside Resolve opens files through the ANSI C library on Windows and may not find it (every request would time out with no_reply): if that happens, set RLB_STATE_DIR to an ASCII-only directory such as C:/rlb-state`,
    );
  }
  const scriptsDir = readDir(env, 'RLB_SCRIPTS_DIR', defaultScriptsDir(home, platform, env), home, platform, problems);
  const autoInstall = readBool(env, 'RLB_AUTO_INSTALL', true, problems);
  const defaultTimeoutS = readInt(env, 'RLB_DEFAULT_TIMEOUT_S', DEFAULT_TIMEOUT_S, TIMEOUT_MIN_S, TIMEOUT_MAX_S, problems);
  const maxResponseKb = readInt(env, 'RLB_MAX_RESPONSE_KB', DEFAULT_RESPONSE_KB, RESPONSE_KB_MIN, RESPONSE_KB_MAX, problems);
  const rawLevel = pick(env, 'RLB_LOG_LEVEL');
  let logLevel: LogLevel = 'info';
  if (rawLevel !== undefined) {
    if (isLogLevel(rawLevel.toLowerCase())) logLevel = rawLevel.toLowerCase() as LogLevel;
    else problems.push(`RLB_LOG_LEVEL="${rawLevel}" is not one of debug, info, warn, error; using info`);
  }
  const prefsDir = readDir(env, 'RLB_PREFS_DIR', defaultPrefsDir(home, platform, env), home, platform, problems);
  const docsDir = readDir(env, 'RLB_DOCS_DIR', defaultDocsDir(platform, env), home, platform, problems);
  return {
    platform,
    home,
    stateDir,
    scriptsDir,
    autoInstall: autoInstall && stampProblem === undefined,
    defaultTimeoutS,
    maxResponseKb,
    logLevel,
    prefsDir,
    docsDir,
    problems,
  };
}
