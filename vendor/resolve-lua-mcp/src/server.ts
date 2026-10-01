// createServer(): the McpServer with its instructions and the 15 tools. Registration and result
// shaping live here; the Lua behind each tool lives in lua.ts; talking to the bridge lives in
// protocol.ts. Handlers never throw: every failure is an isError result that names the next step.
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { Config } from './config.js';
import { expandHome, isAsciiPath, TIMEOUT_MAX_S, TIMEOUT_MIN_S } from './config.js';
import type { InstallResult } from './bridgeInstall.js';
import type { DocsIndex } from './docsSearch.js';
import type { Logger } from './log.js';
import {
  addMarkerSnippet,
  deleteMarkersSnippet,
  listClipsSnippet,
  listProjectsSnippet,
  listTimelinesSnippet,
  MARKER_COLORS,
  openProjectSnippet,
  projectInfoSnippet,
  renderSnippet,
  renderStatusSnippet,
  setCurrentTimelineSnippet,
  statusSnippet,
  timelineItemsSnippet,
  TRACK_TYPES,
} from './lua.js';
import type { Envelope } from './prefs.js';
import { BridgeError, START_INSTRUCTION, type Bridge } from './protocol.js';

export const SERVER_NAME = 'davinci-resolve-lua-mcp';
export const SERVER_VERSION = '0.2.0';

export const TOOL_NAMES = [
  'resolve_status',
  'run_lua',
  'get_project_info',
  'list_projects',
  'list_timelines',
  'list_media_pool_clips',
  'get_timeline_items',
  'add_marker',
  'delete_markers',
  'set_current_timeline',
  'open_project',
  'render_current_timeline',
  'get_render_status',
  'stop_bridge',
  'scripting_api_docs',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const INSTRUCTIONS = `These tools control DaVinci Resolve 21.1 (free edition) on this computer through a Lua script that runs inside Resolve (the "bridge"). The bridge must be running: when a tool answers "bridge not running", the user has to open a project in Resolve and click Workspace > Scripts > resolve_mcp_bridge (Resolve's Console shows nothing; that is expected), then the call can be retried. resolve_status reports whether the bridge is alive and why not.

Prefer the purpose-built tools; use run_lua for anything they do not cover. Before writing Lua, look the method up with scripting_api_docs, and avoid the deprecated forms Blackmagic's shipped examples still use (GetSetting/SetSetting, GetItemsInTrack, index-based render-job calls, single-argument GetClipProperty).

Lua in run_lua runs inside Resolve with the live \`resolve\` global (\`fusion\` too): call methods with a colon (project:GetName()), read constants with a dot (resolve.EXPORT_AAF), treat API lists as 1-based tables (#list, for i = 1, #list) and dicts as keyed tables (GetMarkers() is keyed by frame number), use lowercase page names for OpenPage, and \`return\` a value to get it back as JSON. print output is invisible in Resolve but is captured in the result's prints.

Long synchronous API calls (RenderWithQuickExport, TranscribeAudio, Export, ArchiveProject, LoadProject on an unsaved project) block the bridge until they finish, and the bridge cannot answer Resolve's modal dialogs: start renders with render_current_timeline and poll get_render_status instead of waiting inside run_lua.

Destructive tools (delete_markers) require confirm=true; pass it only after the user has agreed. Results are capped (64 KB of JSON by default); list tools paginate with offset and limit, and a truncated run_lua result says so.`;

export type ToolResult = CallToolResult;

/** The text of a result's first text block (every result here has exactly one). */
export function firstText(result: ToolResult): string {
  const first = result.content[0];
  return first && first.type === 'text' ? first.text : '';
}

export interface ServerDeps {
  config: Config;
  bridge: Bridge;
  docs: DocsIndex;
  /** Returns the latest self-install outcome (re-running the check when it can change). */
  install: () => Promise<InstallResult>;
  logger: Logger;
  /** Absolute path of the server log, for resolve_status. */
  logFile?: string | undefined;
  /**
   * Extension point for a private instrumented build: called with the BridgeError and the tool
   * name wherever a thrown BridgeError becomes an isError result (never on success, never for a
   * Lua-side failure, never from resolve_status). A throw inside the hook is logged and ignored.
   */
  onToolFailure?: ((error: BridgeError, tool: ToolName) => void) | undefined;
  /**
   * The same extension point for everything else a tool body throws (a defect, not a bridge
   * state): called with the thrown value and the tool name where guard() logs it as a bug and
   * turns it into an isError result. Never for a BridgeError. A throw inside is logged and ignored.
   */
  onToolError?: ((error: unknown, tool: ToolName) => void) | undefined;
}

// ---- result helpers -------------------------------------------------------------------------

function ok(obj: Record<string, unknown>, note?: string): ToolResult {
  const json = JSON.stringify(obj, null, 2);
  return { content: [{ type: 'text', text: note ? `${note}\n${json}` : json }], structuredContent: obj };
}

function fail(text: string, extra: Record<string, unknown> = {}): ToolResult {
  return { content: [{ type: 'text', text }], structuredContent: { ok: false, error: text, ...extra }, isError: true };
}

function errorText(err: unknown): string {
  if (err instanceof BridgeError) return err.text;
  if (err instanceof Error) return `internal error: ${err.message}`;
  return `internal error: ${String(err)}`;
}

function failFrom(err: unknown): ToolResult {
  if (err instanceof BridgeError) return fail(err.text, { kind: err.kind, ...err.details });
  return fail(errorText(err));
}

/** Resolve "lists" arrive as JSON arrays, or as `{}` when empty and unflagged (CLAUDE.md). */
export function asList<T = unknown>(x: unknown): T[] {
  return Array.isArray(x) ? (x as T[]) : [];
}

function chunkError(env: Envelope): string {
  if (typeof env.error === 'string') return env.error;
  if (env.error === undefined || env.error === null) return 'unknown error';
  try {
    return JSON.stringify(env.error);
  } catch {
    return String(env.error);
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

// ---- schemas ----------------------------------------------------------------------------------

const offsetSchema = z.int().min(0).max(1_000_000).default(0).describe('Index of the first entry to return (0-based).');

const anyRecord = z.record(z.string(), z.unknown());

// ---- server -----------------------------------------------------------------------------------

export function createServer(deps: ServerDeps): McpServer {
  const { config, bridge, docs, logger } = deps;
  const defaultTimeoutMs = config.defaultTimeoutS * 1000;

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS });

  /** Run a purpose-built snippet and hand back its table, or the isError result to return. */
  async function runSnippet(
    code: string,
    timeoutMs = defaultTimeoutMs,
  ): Promise<{ data: Record<string, unknown>; env: Envelope } | { result: ToolResult }> {
    const env = await bridge.request('run', { code, timeoutMs });
    if (!env.ok) {
      return { result: fail(`Lua error inside Resolve: ${chunkError(env)}`, { error: env.error ?? null, prints: env.prints ?? [] }) };
    }
    if (env.truncated) {
      return {
        result: fail(
          `the result was too large for the response channel (${env.result_bytes ?? '?'} bytes of JSON, cap ${config.maxResponseKb} KB); use a smaller limit or offset`,
          { truncated: true, result_bytes: env.result_bytes ?? null },
        ),
      };
    }
    if (!isRecord(env.result)) {
      return { result: fail(`the Lua snippet returned ${JSON.stringify(env.result)} instead of a table; this is a server bug`, { prints: env.prints ?? [] }) };
    }
    const data = env.result;
    if (data['ok'] === false) {
      const { ok: _ok, error, ...rest } = data;
      return { result: fail(typeof error === 'string' ? error : 'the Lua snippet reported a failure without a message', rest) };
    }
    const { ok: _ok, ...rest } = data;
    return { data: rest, env };
  }

  /** Every tool body runs under guard: a thrown BridgeError becomes an isError result (and reaches onToolFailure); anything else is logged as a bug (and reaches onToolError). */
  function guard(tool: ToolName, fn: () => Promise<ToolResult>): Promise<ToolResult> {
    return fn().catch((err: unknown) => {
      if (err instanceof BridgeError) {
        try {
          deps.onToolFailure?.(err, tool);
        } catch (hookErr) {
          logger.error('onToolFailure hook threw', hookErr);
        }
      } else {
        logger.error('tool failed', err);
        try {
          deps.onToolError?.(err, tool);
        } catch (hookErr) {
          logger.error('onToolError hook threw', hookErr);
        }
      }
      return failFrom(err);
    });
  }

  // 1. resolve_status ---------------------------------------------------------------------------
  server.registerTool(
    'resolve_status',
    {
      title: 'Bridge status',
      description:
        'Reports whether the in-Resolve Lua bridge is running and reachable, with the reason when it is not (never started, stopped, Resolve gone, no reply, lock held), the bridge session (pid, start time, state directory), the platform, the self-install outcome of the two Lua scripts, configuration problems, and, when alive, the Resolve product, version, edition (Studio or free), current page and open project. Read-only; it does not start the bridge (only a click in Resolve can).',
      inputSchema: z.object({}),
      outputSchema: z.looseObject({
        alive: z.boolean(),
        reason: z.string().optional(),
        start_instruction: z.string().optional(),
        state_dir: z.string(),
        platform: z.string(),
        config_problems: z.array(z.string()),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const status = await bridge.status();
      let install: InstallResult | { outcome: string; message: string };
      try {
        install = await deps.install();
      } catch (err) {
        install = { outcome: 'error', message: errorText(err) };
      }
      const out: Record<string, unknown> = {
        alive: status.alive,
        ...(status.reason ? { reason: status.reason, detail: status.detail } : {}),
        ...(status.alive ? {} : { start_instruction: START_INSTRUCTION }),
        prefs_file: status.prefs_file ?? null,
        prefs_mtime: status.prefs_mtime ?? null,
        session: status.session ?? null,
        pid_alive: status.pid_alive ?? null,
        ping: status.ping ?? null,
        ping_ms: status.ping_ms ?? null,
        lock: status.lock,
        state_dir: status.state_dir,
        // win32: LuaJIT opens files through the ANSI C library, so a non-ASCII state dir may be unreachable from Lua.
        state_dir_ascii: isAsciiPath(config.stateDir),
        platform: config.platform,
        state_dir_match: status.state_dir_match ?? null,
        bridge_script: install,
        config: {
          scripts_dir: config.scriptsDir,
          auto_install: config.autoInstall,
          default_timeout_s: config.defaultTimeoutS,
          max_response_kb: config.maxResponseKb,
          prefs_dir: config.prefsDir,
          docs_dir: config.docsDir,
          log_file: deps.logFile ?? null,
        },
        config_problems: config.problems,
        server: { name: SERVER_NAME, version: SERVER_VERSION, pid: process.pid, node: process.version },
      };
      if (status.alive) {
        try {
          const r = await runSnippet(statusSnippet(), 5000);
          if ('data' in r) Object.assign(out, r.data);
          else out['status_error'] = firstText(r.result) || 'unknown';
        } catch (err) {
          out['status_error'] = errorText(err);
        }
      }
      return ok(out);
    },
  );

  // 2. run_lua ----------------------------------------------------------------------------------
  server.registerTool(
    'run_lua',
    {
      title: 'Run Lua inside Resolve',
      description:
        'Runs a Lua 5.1 chunk inside DaVinci Resolve with the live `resolve` object and returns its first return value as JSON together with captured print output, the execution time and any error. The chunk can call any scripting-API method and change the project, so it counts as destructive. Synchronous long API calls (RenderWithQuickExport, TranscribeAudio, Export, ArchiveProject) block the bridge until they finish; use render_current_timeline and get_render_status for renders. Results over the response cap come back truncated with a preview.',
      inputSchema: z.object({
        code: z.string().min(1).max(200_000).describe('Lua 5.1 source. `resolve` is the Resolve object; `return` a value to receive it as JSON (tables become objects or arrays, userdata become placeholders).'),
        timeout_s: z
          .int()
          .min(TIMEOUT_MIN_S)
          .max(TIMEOUT_MAX_S)
          .default(config.defaultTimeoutS)
          .describe(`Seconds to wait for the bridge, ${TIMEOUT_MIN_S}..${TIMEOUT_MAX_S}. Claude Desktop has its own undocumented tool timeout, so keep chunks short.`),
      }),
      outputSchema: z.looseObject({
        ok: z.boolean(),
        result: z.unknown().optional(),
        prints: z.array(z.string()),
        ms: z.number().optional(),
        truncated: z.boolean().optional(),
        result_bytes: z.number().optional(),
        result_preview: z.string().optional(),
        error: z.unknown().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ code, timeout_s }) =>
      guard('run_lua', async () => {
        const env = await bridge.request('run', { code, timeoutMs: timeout_s * 1000 });
        const base: Record<string, unknown> = {
          ok: env.ok,
          ms: env.ms ?? null,
          prints: env.prints ?? [],
          ...(env.prints_dropped !== undefined ? { prints_dropped: env.prints_dropped } : {}),
          ...(env.extra_returns !== undefined ? { extra_returns: env.extra_returns } : {}),
          bridge: env.bridge,
        };
        if (!env.ok) {
          return fail(`Lua error inside Resolve: ${chunkError(env)}`, { ...base, error: env.error ?? null, result: null });
        }
        if (env.truncated) {
          const bytes = env.result_bytes ?? 0;
          return ok(
            {
              ...base,
              result: null,
              truncated: true,
              result_bytes: bytes,
              result_preview: typeof env.result === 'string' ? env.result : '',
            },
            `result JSON is ${bytes} bytes, the cap is ${config.maxResponseKb} KB (RLB_MAX_RESPONSE_KB); a prefix follows in result_preview. Return less from the chunk or paginate.`,
          );
        }
        return ok({ ...base, result: env.result ?? null, truncated: false });
      }),
  );

  // 3. get_project_info -------------------------------------------------------------------------
  server.registerTool(
    'get_project_info',
    {
      title: 'Project overview',
      description:
        'Returns an overview of the open project: name and unique id, current page, database (type and name), current Media Pool folder, frame rate and resolution, timeline count, root-bin clip and sub-bin counts, and the current timeline (name, unique id, start timecode, start and end frame) when one is open. Read-only. Use list_timelines or list_media_pool_clips for the full lists.',
      inputSchema: z.object({}),
      outputSchema: z.looseObject({ name: z.string(), unique_id: z.string().optional(), timeline_count: z.number() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () =>
      guard('get_project_info', async () => {
        const r = await runSnippet(projectInfoSnippet());
        return 'result' in r ? r.result : ok(r.data);
      }),
  );

  // 4. list_projects ----------------------------------------------------------------------------
  server.registerTool(
    'list_projects',
    {
      title: 'List projects',
      description:
        'Lists the projects in the current project-manager folder of the current database, with last-modified and creation dates and notes where Resolve provides them, and marks the open one. Read-only. It does not switch projects; use open_project for that.',
      inputSchema: z.object({}),
      outputSchema: z.looseObject({ projects: z.array(anyRecord), current: z.string().nullable().optional() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () =>
      guard('list_projects', async () => {
        const r = await runSnippet(listProjectsSnippet());
        if ('result' in r) return r.result;
        return ok({ ...r.data, projects: asList(r.data['projects']) });
      }),
  );

  // 5. list_timelines ---------------------------------------------------------------------------
  server.registerTool(
    'list_timelines',
    {
      title: 'List timelines',
      description:
        'Lists every timeline of the open project: index, name, unique id, start and end frame, and video, audio and subtitle track counts, with the current one marked. Read-only. Use set_current_timeline to switch and get_timeline_items to read clips.',
      inputSchema: z.object({}),
      outputSchema: z.looseObject({ timelines: z.array(anyRecord), timeline_count: z.number() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () =>
      guard('list_timelines', async () => {
        const r = await runSnippet(listTimelinesSnippet());
        if ('result' in r) return r.result;
        return ok({ ...r.data, timelines: asList(r.data['timelines']) });
      }),
  );

  // 6. list_media_pool_clips --------------------------------------------------------------------
  server.registerTool(
    'list_media_pool_clips',
    {
      title: 'List Media Pool clips',
      description:
        'Lists the clips in one Media Pool bin (default the root bin) with name, unique id, file path, duration, fps, resolution, type, frame count and clip colour, paginated with offset and limit. Read-only. An unknown bin path answers with the bins available at the last level that resolved. It does not list sub-bins recursively.',
      inputSchema: z.object({
        bin_path: z.string().max(2000).default('/').describe('Bin path from the root, segments separated by "/", e.g. "/" or "/Footage/Day 1". Bin names are matched exactly.'),
        offset: offsetSchema,
        limit: z.int().min(1).max(200).default(50).describe('Maximum clips to return, 1..200.'),
      }),
      outputSchema: z.looseObject({
        bin_path: z.string(),
        total: z.number(),
        offset: z.number(),
        limit: z.number(),
        truncated: z.boolean(),
        clips: z.array(anyRecord),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ bin_path, offset, limit }) =>
      guard('list_media_pool_clips', async () => {
        const trimmed = bin_path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
        const segments = trimmed === '' ? [] : trimmed.split('/');
        if (segments.some((s) => s === '')) return fail(`bin_path ${JSON.stringify(bin_path)} has an empty segment; use "/" between bin names, e.g. "/Footage/Day 1"`);
        const r = await runSnippet(listClipsSnippet(segments, offset, limit));
        if ('result' in r) return r.result;
        return ok({ ...r.data, clips: asList(r.data['clips']) });
      }),
  );

  // 7. get_timeline_items -----------------------------------------------------------------------
  server.registerTool(
    'get_timeline_items',
    {
      title: 'List timeline items',
      description:
        'Lists the items on one track of the current timeline: name, unique id, type (video, audio, generator, transition), start, end and duration in frames (fractional when Resolve reports subframes), source start and end frames, enabled state, and the source file path when the item has a Media Pool clip. Paginated with offset and limit. Read-only. Use list_timelines for track counts.',
      inputSchema: z.object({
        track_type: z.enum(TRACK_TYPES).describe('Track type: video, audio or subtitle.'),
        track_index: z.int().min(1).max(500).describe('1-based track number, e.g. 1 for V1.'),
        offset: offsetSchema,
        limit: z.int().min(1).max(500).default(100).describe('Maximum items to return, 1..500.'),
      }),
      outputSchema: z.looseObject({
        timeline: z.string(),
        track_type: z.string(),
        track_index: z.number(),
        total: z.number(),
        offset: z.number(),
        limit: z.number(),
        truncated: z.boolean(),
        items: z.array(anyRecord),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ track_type, track_index, offset, limit }) =>
      guard('get_timeline_items', async () => {
        const r = await runSnippet(timelineItemsSnippet(track_type, track_index, offset, limit));
        if ('result' in r) return r.result;
        return ok({ ...r.data, items: asList(r.data['items']) });
      }),
  );

  // 8. add_marker -------------------------------------------------------------------------------
  server.registerTool(
    'add_marker',
    {
      title: 'Add timeline marker',
      description:
        'Adds a marker to the current timeline at a frame counted from the timeline start (frame 0 is the first frame, whatever the start timecode) and returns the marker Resolve stored. Fails when the frame already holds a marker or lies outside the timeline. Writes to the project; it does not save it. Use delete_markers to remove markers.',
      inputSchema: z.object({
        frame: z.int().min(0).max(1_000_000_000).describe('Frame relative to the timeline start (0-based).'),
        color: z.enum(MARKER_COLORS).describe('One of the 16 Resolve marker colours.'),
        name: z.string().max(1000).describe('Marker name.'),
        note: z.string().max(4000).default('').describe('Marker note text.'),
        duration: z.int().min(1).max(1_000_000_000).default(1).describe('Marker duration in frames, at least 1.'),
      }),
      outputSchema: z.looseObject({ frame: z.number(), marker: anyRecord.nullable().optional(), timeline: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ frame, color, name, note, duration }) =>
      guard('add_marker', async () => {
        const r = await runSnippet(addMarkerSnippet(frame, color, name, note, duration));
        if ('result' in r) return r.result;
        return ok({ ...r.data, marker: r.data['marker'] ?? null });
      }),
  );

  // 9. delete_markers ---------------------------------------------------------------------------
  server.registerTool(
    'delete_markers',
    {
      title: 'Delete timeline markers',
      description:
        'Deletes every marker of one colour, or all markers when no colour is given, from the current timeline, and returns how many were removed and how many remain. Destructive and not undoable through this server: it refuses unless confirm is true. It does not delete markers on clips or in the Media Pool.',
      inputSchema: z.object({
        color: z.enum(MARKER_COLORS).optional().describe('Marker colour to delete; omit to delete all markers.'),
        confirm: z.boolean().default(false).describe('Must be true; set it only after the user has agreed to the deletion.'),
      }),
      outputSchema: z.looseObject({ color: z.string(), deleted: z.number(), remaining: z.number() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ color, confirm }) =>
      guard('delete_markers', async () => {
        const target = color ?? 'All';
        if (!confirm) {
          return fail(`refused: deleting ${target === 'All' ? 'all markers' : `${target} markers`} needs confirm=true; ask the user, then call again with confirm=true`, { color: target });
        }
        const r = await runSnippet(deleteMarkersSnippet(target));
        return 'result' in r ? r.result : ok(r.data);
      }),
  );

  // 10. set_current_timeline --------------------------------------------------------------------
  server.registerTool(
    'set_current_timeline',
    {
      title: 'Switch timeline',
      description:
        'Makes the timeline with the given name the current timeline of the open project and returns its name, unique id and index. An unknown name answers with the known timeline names. It does not create timelines.',
      inputSchema: z.object({ name: z.string().min(1).max(500).describe('Exact timeline name as shown in the Media Pool.') }),
      outputSchema: z.looseObject({ name: z.string(), unique_id: z.string().optional(), index: z.number().optional() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ name }) =>
      guard('set_current_timeline', async () => {
        const r = await runSnippet(setCurrentTimelineSnippet(name));
        return 'result' in r ? r.result : ok(r.data);
      }),
  );

  // 11. open_project ----------------------------------------------------------------------------
  server.registerTool(
    'open_project',
    {
      title: 'Open project',
      description:
        'Loads the named project from the current project-manager folder, saving the open project first by default (LoadProject on an unsaved project can raise a dialog the bridge cannot answer). Returns the loaded project, the previous one and whether it was saved. The switch is not undoable through this server. An unknown name answers with the known project names (see list_projects).',
      inputSchema: z.object({
        name: z.string().min(1).max(500).describe('Exact project name as listed by list_projects.'),
        save_current: z.boolean().default(true).describe('Save the open project before switching (default true). false risks a modal dialog in Resolve that blocks the bridge.'),
      }),
      outputSchema: z.looseObject({ name: z.string(), unique_id: z.string().optional(), saved_previous: z.boolean().optional() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ name, save_current }) =>
      guard('open_project', async () => {
        const r = await runSnippet(openProjectSnippet(name, save_current));
        return 'result' in r ? r.result : ok(r.data);
      }),
  );

  // 12. render_current_timeline -----------------------------------------------------------------
  server.registerTool(
    'render_current_timeline',
    {
      title: 'Queue and start a render',
      description:
        'Queues a render of the current timeline into an existing output directory with the given file name, optionally after loading a named render preset, starts it without the interactive dialog, and returns the job id plus the queued job entry and the current format and codec. It returns as soon as rendering starts; poll get_render_status for progress. It does not wait for completion and does not overwrite existing files on its own. Resolve moves to the Deliver page when it renders; the tool does not switch back.',
      inputSchema: z.object({
        preset: z.string().max(200).optional().describe('Render preset name from the Deliver page; validated against the preset list. Omit to keep the current render settings.'),
        output_dir: z.string().min(1).max(4000).describe('Absolute path of an existing directory to render into ("~" is expanded).'),
        filename: z.string().min(1).max(255).describe('File name for the render (no directory separators); Resolve adds the extension.'),
      }),
      outputSchema: z.looseObject({ job_id: z.string(), job: anyRecord.nullable().optional() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ preset, output_dir, filename }) =>
      guard('render_current_timeline', async () => {
        const dir = expandHome(output_dir.trim(), config.home, config.platform);
        if (!path.isAbsolute(dir)) return fail(`output_dir must be an absolute path, got ${JSON.stringify(output_dir)}`);
        try {
          const st = await fsp.stat(dir);
          if (!st.isDirectory()) return fail(`output_dir ${dir} is not a directory`);
        } catch {
          return fail(`output_dir ${dir} does not exist; create it first (the server never creates directories)`);
        }
        if (/[/\\]/.test(filename) || filename === '.' || filename === '..') return fail(`filename must be a bare file name without directory separators, got ${JSON.stringify(filename)}`);
        const r = await runSnippet(renderSnippet(preset, dir, filename), Math.max(defaultTimeoutMs, 60_000));
        if ('result' in r) return r.result;
        return ok({ ...r.data, job: r.data['job'] ?? null });
      }),
  );

  // 13. get_render_status -----------------------------------------------------------------------
  server.registerTool(
    'get_render_status',
    {
      title: 'Render job status',
      description:
        "Returns one render job's status (JobStatus such as Ready, Rendering, Complete, Cancelled or Failed; completion percentage; error text; time taken or remaining) and whether Resolve is rendering at all. Read-only. An unknown job id answers with the known job ids.",
      inputSchema: z.object({ job_id: z.string().min(1).max(200).describe('Job id returned by render_current_timeline.') }),
      outputSchema: z.looseObject({ job_id: z.string(), status: anyRecord, rendering_in_progress: z.boolean().optional() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ job_id }) =>
      guard('get_render_status', async () => {
        const r = await runSnippet(renderStatusSnippet(job_id));
        return 'result' in r ? r.result : ok(r.data);
      }),
  );

  // 14. stop_bridge -----------------------------------------------------------------------------
  server.registerTool(
    'stop_bridge',
    {
      title: 'Stop the bridge',
      description:
        'Asks the in-Resolve bridge loop to exit cleanly (it marks its session stopped and ends the script). Afterwards every Resolve tool reports "bridge not running" until the user relaunches the script from Workspace > Scripts. It does not quit Resolve and does not touch the project.',
      inputSchema: z.object({}),
      outputSchema: z.looseObject({ stopped: z.boolean(), session: z.string().optional() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () =>
      guard('stop_bridge', async () => {
        const env = await bridge.request('stop', { timeoutMs: 5000 });
        if (!env.ok) return fail(`the bridge refused to stop: ${chunkError(env)}`);
        const result = isRecord(env.result) ? env.result : {};
        return ok({ stopped: true, session: typeof result['session'] === 'string' ? result['session'] : env.session, bridge: env.bridge });
      }),
  );

  // 15. scripting_api_docs ----------------------------------------------------------------------
  server.registerTool(
    'scripting_api_docs',
    {
      title: 'Search Resolve API docs',
      description:
        "Searches Blackmagic's shipped scripting reference for DaVinci Resolve 21.1 (DaVinciResolveScript.pyi method signatures and docstrings tagged with their class and line, TypedDict shapes, the README's sections including the lists of deprecated and unsupported calls, and the CHANGELOG) and returns the best matches with file and line. Read-only and local; it does not search the web. Hits tagged deprecated or unsupported are forms to avoid.",
      inputSchema: z.object({
        query: z.string().min(1).max(200).describe('Method name, class name or words from a docstring, e.g. "AddMarker", "Timeline markers", "render job status".'),
        limit: z.int().min(1).max(10).default(5).describe('Maximum hits to return, 1..10.'),
      }),
      outputSchema: z.looseObject({ query: z.string(), total_matches: z.number(), results: z.array(anyRecord) }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, limit }) =>
      guard('scripting_api_docs', async () => {
        const r = await docs.search(query, limit);
        if (!r.ok) return fail(r.error, { docs_dir: r.docs_dir });
        const { ok: _ok, ...rest } = r;
        return ok(rest);
      }),
  );

  return server;
}
