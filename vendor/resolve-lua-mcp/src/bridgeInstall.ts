// First-run self-install of the two Lua files into Resolve's user Utility scripts folder, the only
// Resolve path this project writes. The folder is never created; a missing one is reported.
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type { Logger } from './log.js';
import { silentLogger } from './log.js';
import { stateDirStampProblem } from './config.js';
import { retryTransient } from './protocol.js';

export const STAMP_TOKEN = '@@RLB_STATE_DIR@@';

export interface BridgeFile {
  /** Path inside the bundle (and the repository). */
  source: string;
  /** File name inside the Utility folder; the Scripts menu shows it without the extension. */
  name: string;
}

export const BRIDGE_FILES: readonly BridgeFile[] = [
  { source: 'bridge/resolve_mcp_bridge.lua', name: 'resolve_mcp_bridge.lua' },
  { source: 'scripts/claude_diag.lua', name: 'claude_diag.lua' },
];

export type InstallOutcome =
  | 'installed'
  | 'updated'
  | 'up_to_date'
  | 'skipped_auto_install_off'
  | 'scripts_dir_missing'
  | 'permission_denied'
  | 'state_dir_unstampable'
  | 'error';

export type FileAction = 'installed' | 'updated' | 'up_to_date';

export interface InstalledFile {
  name: string;
  path: string;
  version: string;
  action?: FileAction;
  reason?: string;
}

export interface InstallResult {
  outcome: InstallOutcome;
  message: string;
  scripts_dir: string;
  state_dir: string;
  files: InstalledFile[];
  checked_at: string;
}

export interface InstallOptions {
  scriptsDir: string;
  stateDir: string;
  autoInstall: boolean;
  /** Directory holding `bridge/` and `scripts/` (the bundle root, or the repository root). */
  bundleDir: string;
  logger?: Logger | undefined;
}

/** The first line of a Lua file: `-- resolve_mcp_bridge v0.1.0` or `-- claude_diag v0.1.0 (...)`. */
export function versionHeader(text: string): string {
  const nl = text.indexOf('\n');
  return (nl < 0 ? text : text.slice(0, nl)).replace(/\r$/, '');
}

/** Replace every placeholder with the absolute state directory. Throws when the path is unsafe. */
export function stampLua(source: string, stateDir: string): string {
  const problem = stateDirStampProblem(stateDir);
  if (problem) throw new Error(`state directory ${JSON.stringify(stateDir)} ${problem}`);
  if (!source.includes(STAMP_TOKEN)) throw new Error('source has no @@RLB_STATE_DIR@@ placeholder');
  return source.split(STAMP_TOKEN).join(stateDir);
}

// A persistent EBUSY (Windows: something else keeps the file open after the retries) is not a
// permission problem: it falls through to outcome 'error', which the next resolve_status retries.
function isPermission(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === 'EACCES' || code === 'EPERM' || code === 'EROFS';
}

async function writeAtomic(target: string, content: string): Promise<void> {
  const tmp = `${target}.tmp`;
  try {
    await fsp.writeFile(tmp, content, 'utf8');
    // Windows: an antivirus scanner or an editor holding the installed script refuses the replace for a moment.
    await retryTransient(() => fsp.rename(tmp, target));
  } catch (err) {
    await fsp.unlink(tmp).catch(() => undefined);
    throw err;
  }
}

export async function installBridgeFiles(opts: InstallOptions): Promise<InstallResult> {
  const log = opts.logger ?? silentLogger;
  const base = {
    scripts_dir: opts.scriptsDir,
    state_dir: opts.stateDir,
    files: [] as InstalledFile[],
    checked_at: new Date().toISOString(),
  };
  if (!opts.autoInstall) {
    return { ...base, outcome: 'skipped_auto_install_off', message: 'auto-install is off (RLB_AUTO_INSTALL); copy the two Lua files by hand' };
  }
  const stampProblem = stateDirStampProblem(opts.stateDir);
  if (stampProblem) {
    return { ...base, outcome: 'state_dir_unstampable', message: `RLB_STATE_DIR ${stampProblem}; choose another state directory` };
  }
  try {
    const st = await fsp.stat(opts.scriptsDir);
    if (!st.isDirectory()) {
      return { ...base, outcome: 'scripts_dir_missing', message: `${opts.scriptsDir} is not a directory; the server never creates Resolve folders` };
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT' || (err as NodeJS.ErrnoException).code === 'ENOTDIR') {
      return {
        ...base,
        outcome: 'scripts_dir_missing',
        message: `${opts.scriptsDir} does not exist; launch DaVinci Resolve once so it creates its Fusion/Scripts folders, or set RLB_SCRIPTS_DIR (the server never creates Resolve folders)`,
      };
    }
    if (isPermission(err)) return { ...base, outcome: 'permission_denied', message: `cannot read ${opts.scriptsDir}: ${(err as Error).message}` };
    return { ...base, outcome: 'error', message: `cannot stat ${opts.scriptsDir}: ${(err as Error).message}` };
  }

  const files: InstalledFile[] = [];
  for (const f of BRIDGE_FILES) {
    const sourcePath = path.join(opts.bundleDir, f.source);
    const target = path.join(opts.scriptsDir, f.name);
    let source: string;
    try {
      source = await fsp.readFile(sourcePath, 'utf8');
    } catch (err) {
      return { ...base, files, outcome: 'error', message: `bundled ${f.source} is missing (${(err as Error).message}); reinstall the extension` };
    }
    const stamped = stampLua(source, opts.stateDir);
    const version = versionHeader(source);
    const entry: InstalledFile = { name: f.name, path: target, version };
    let installed: string | undefined;
    try {
      installed = await fsp.readFile(target, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        if (isPermission(err)) return { ...base, files, outcome: 'permission_denied', message: `cannot read ${target}: ${(err as Error).message}` };
        return { ...base, files, outcome: 'error', message: `cannot read ${target}: ${(err as Error).message}` };
      }
    }
    if (installed === stamped) {
      entry.action = 'up_to_date';
    } else {
      if (installed === undefined) {
        entry.action = 'installed';
      } else {
        entry.action = 'updated';
        const oldHeader = versionHeader(installed);
        if (oldHeader !== version) entry.reason = `version header was ${JSON.stringify(oldHeader)}`;
        else if (installed.split('\n')[1] !== stamped.split('\n')[1]) entry.reason = 'state directory stamp changed';
        else entry.reason = 'content differed from the bundled file';
      }
      try {
        await writeAtomic(target, stamped);
        log.info(`bridge script ${entry.action}`, { path: target, version, reason: entry.reason });
      } catch (err) {
        if (isPermission(err)) return { ...base, files, outcome: 'permission_denied', message: `cannot write ${target}: ${(err as Error).message}` };
        return { ...base, files, outcome: 'error', message: `cannot write ${target}: ${(err as Error).message}` };
      }
    }
    files.push(entry);
  }
  const actions = new Set(files.map((f) => f.action));
  const outcome: InstallOutcome = actions.has('updated') ? 'updated' : actions.has('installed') ? 'installed' : 'up_to_date';
  const message =
    outcome === 'up_to_date'
      ? `bridge scripts are current in ${opts.scriptsDir}`
      : `bridge scripts ${outcome} in ${opts.scriptsDir}; they appear under Workspace > Scripts in Resolve without a restart`;
  return { ...base, files, outcome, message };
}
