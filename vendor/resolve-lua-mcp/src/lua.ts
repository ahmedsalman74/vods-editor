// Everything that turns tool inputs into Lua source: the one string-escaping helper, the request
// file template, and the Lua snippet behind each purpose-built tool. Tool inputs are untrusted
// even though Claude sends them, so every embedded value passes through luaString()/luaInt().
//
// API calls below use the signatures in DaVinciResolveScript.pyi, Blackmagic's shipped
// reference; lists are iterated with `for i = 1, #list`, dicts are read by
// key, every boolean the API returns is checked, and expected failures are returned as
// `{ ok = false, error = "..." }` so the server can turn them into an isError result.

export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const SESSION_RE = /^(\*|[A-Za-z0-9-]{1,64})$/;

export type RequestOp = 'run' | 'ping' | 'stop';
export const REQUEST_OPS: readonly RequestOp[] = ['run', 'ping', 'stop'];

export const MARKER_COLORS = [
  'Blue', 'Cyan', 'Green', 'Yellow', 'Red', 'Pink', 'Purple', 'Fuchsia',
  'Rose', 'Lavender', 'Sky', 'Mint', 'Lemon', 'Sand', 'Cocoa', 'Cream',
] as const; // DaVinciResolveScript.pyi line 7, MarkerColor
export type MarkerColor = (typeof MARKER_COLORS)[number];

export const TRACK_TYPES = ['video', 'audio', 'subtitle'] as const; // .pyi line 9, TrackType
export type TrackType = (typeof TRACK_TYPES)[number];

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * A double-quoted Lua 5.1 string literal for `s`. Backslash, quote, CR, LF and TAB get their
 * mnemonic escapes; every other C0 control byte and DEL become `\ddd` (three decimal digits, the
 * only numeric escape Lua 5.1 has); non-ASCII passes through and the request file is written as
 * UTF-8. A lone surrogate is replaced by U+FFFD before encoding.
 */
export function luaString(s: string): string {
  let out = '"';
  const clean = s.replace(LONE_SURROGATE, '�');
  for (const ch of clean) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (code < 0x20 || code === 0x7f) out += `\\${code.toString().padStart(3, '0')}`;
    else out += ch;
  }
  return `${out}"`;
}

export function luaInt(n: number): string {
  if (!Number.isInteger(n)) throw new Error(`luaInt: not an integer: ${String(n)}`);
  return n.toString();
}

export function luaBool(b: boolean): string {
  return b ? 'true' : 'false';
}

/** `{ "a", "b" }` for a list of strings (each through luaString). */
export function luaStringList(items: readonly string[]): string {
  return `{ ${items.map(luaString).join(', ')} }`;
}

/** The smallest long-bracket level (>= 2) whose closing sequence does not occur in `code`. */
export function longBracketLevel(code: string): number {
  let level = 2;
  while (code.includes(`]${'='.repeat(level)}]`)) level += 1;
  return level;
}

/**
 * `[==[\n<code>]==]` with a level `code` cannot close. Lua drops the first newline after the
 * opening bracket, so the emitted newline protects a leading newline in the code itself. Lua also
 * normalises CR/LF pairs inside long strings to LF, which never changes the meaning of Lua code.
 */
export function luaLongBracket(code: string): string {
  const eq = '='.repeat(longBracketLevel(code));
  return `[${eq}[\n${code}]${eq}]`;
}

export interface RequestFields {
  id: string;
  session: string;
  op: RequestOp;
  /** Unix seconds when written. */
  ts: number;
  /** Response cap in KB of JSON, 1..192. */
  maxKb: number;
  code?: string | undefined;
}

/** The text of `next.lua` (protocol v1). Throws on a field the bridge would reject. */
export function formatRequest(f: RequestFields): string {
  if (!ID_RE.test(f.id)) throw new Error(`request id must match ${ID_RE}: ${JSON.stringify(f.id)}`);
  if (!SESSION_RE.test(f.session)) throw new Error(`session must match ${SESSION_RE}: ${JSON.stringify(f.session)}`);
  if (!REQUEST_OPS.includes(f.op)) throw new Error(`unknown op ${String(f.op)}`);
  if (!Number.isInteger(f.ts) || f.ts < 0) throw new Error(`ts must be a non-negative integer: ${String(f.ts)}`);
  if (!Number.isInteger(f.maxKb) || f.maxKb < 1 || f.maxKb > 192) throw new Error(`max_kb must be 1..192: ${String(f.maxKb)}`);
  if (f.op === 'run' && typeof f.code !== 'string') throw new Error('op "run" needs code');
  if (f.op !== 'run' && f.code !== undefined) throw new Error(`op ${JSON.stringify(f.op)} takes no code`);
  const lines = [
    'return {',
    '  v = 1,',
    `  id = ${luaString(f.id)},`,
    `  session = ${luaString(f.session)},`,
    `  op = ${luaString(f.op)},`,
    `  ts = ${luaInt(f.ts)},`,
    `  max_kb = ${luaInt(f.maxKb)},`,
  ];
  if (f.op === 'run') lines.push(`  code = ${luaLongBracket(f.code as string)},`);
  lines.push('}', '');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Lua snippets behind the purpose-built tools. Each returns a table with `ok`.

const PRELUDE = `local pm = resolve:GetProjectManager()
if not pm then return { ok = false, error = "GetProjectManager returned nil: Resolve may still be starting" } end
local project = pm:GetCurrentProject()
if not project then return { ok = false, error = "no project is open in Resolve: open one in Resolve or call open_project" } end
local function n(x) return tonumber(x) end
`;

const NEED_TIMELINE = `local tl = project:GetCurrentTimeline()
if not tl then return { ok = false, error = "no current timeline: open one in Resolve or call set_current_timeline" } end
`;

/** resolve_status: product, version, edition, page and project name; no project required. */
export function statusSnippet(): string {
  return `local r = { ok = true, product = resolve:GetProductName(), version = resolve:GetVersionString(),
  is_studio = resolve:IsStudio(), current_page = resolve:GetCurrentPage() }
local pm = resolve:GetProjectManager()
local project = pm and pm:GetCurrentProject()
if project then r.project = project:GetName() end
return r
`;
}

export function projectInfoSnippet(): string {
  return `${PRELUDE}local s = project:GetSettings() or {}
local mp = project:GetMediaPool()
local root = mp and mp:GetRootFolder()
local cur = mp and mp:GetCurrentFolder()
local db = pm:GetCurrentDatabase() or {}
local r = {
  ok = true,
  name = project:GetName(),
  unique_id = project:GetUniqueId(),
  current_page = resolve:GetCurrentPage(),
  database = { DbType = db.DbType, DbName = db.DbName },
  current_folder = cur and cur:GetName() or nil,
  frame_rate = n(s.timelineFrameRate),
  width = n(s.timelineResolutionWidth),
  height = n(s.timelineResolutionHeight),
  timeline_count = project:GetTimelineCount() or 0,
  root_bin = {
    clips = root and #(root:GetClipList() or {}) or 0,
    sub_bins = root and #(root:GetSubFolderList() or {}) or 0,
  },
}
local tl = project:GetCurrentTimeline()
if tl then
  r.current_timeline = { name = tl:GetName(), unique_id = tl:GetUniqueId(), start_timecode = tl:GetStartTimecode(),
    start_frame = tl:GetStartFrame(), end_frame = tl:GetEndFrame() }
end
return r
`;
}

export function listProjectsSnippet(): string {
  return `local pm = resolve:GetProjectManager()
if not pm then return { ok = false, error = "GetProjectManager returned nil: Resolve may still be starting" } end
local names = pm:GetProjectListInCurrentFolder() or {}
local attrs = pm:GetProjectAttributesInCurrentFolder() or {}
local current = pm:GetCurrentProject()
local current_name = current and current:GetName() or nil
local projects = {}
for i = 1, #names do
  local a = attrs[names[i]] or {}
  projects[#projects + 1] = { name = names[i], last_modified = a.lastModifiedDate, created = a.creationDate,
    notes = a.notes, collaboration = a.liveCollaborationMode, is_current = (names[i] == current_name) }
end
return { ok = true, folder = pm:GetCurrentFolder(), current = current_name, projects = projects }
`;
}

export function listTimelinesSnippet(): string {
  return `${PRELUDE}local count = project:GetTimelineCount() or 0
local cur = project:GetCurrentTimeline()
local cur_id = cur and cur:GetUniqueId() or nil
local timelines = {}
for i = 1, count do
  local tl = project:GetTimelineByIndex(i)
  if tl then
    local id = tl:GetUniqueId()
    timelines[#timelines + 1] = { index = i, name = tl:GetName(), unique_id = id,
      start_frame = tl:GetStartFrame(), end_frame = tl:GetEndFrame(),
      video_tracks = tl:GetTrackCount("video"), audio_tracks = tl:GetTrackCount("audio"),
      subtitle_tracks = tl:GetTrackCount("subtitle"), is_current = (id == cur_id) }
  end
end
return { ok = true, current_unique_id = cur_id, timeline_count = count, timelines = timelines }
`;
}

export function listClipsSnippet(segments: readonly string[], offset: number, limit: number): string {
  return `${PRELUDE}local mp = project:GetMediaPool()
local folder = mp and mp:GetRootFolder()
if not folder then return { ok = false, error = "GetRootFolder returned nil" } end
local segments = ${luaStringList(segments)}
local bin_path = ""
for s = 1, #segments do
  local subs = folder:GetSubFolderList() or {}
  local found, names = nil, {}
  for i = 1, #subs do
    local nm = subs[i]:GetName()
    names[#names + 1] = nm
    if nm == segments[s] and not found then found = subs[i] end
  end
  if not found then
    return { ok = false, error = "bin not found: " .. bin_path .. "/" .. segments[s], resolved_path = (bin_path == "" and "/" or bin_path),
      available_bins = names }
  end
  folder = found
  bin_path = bin_path .. "/" .. segments[s]
end
local clips = folder:GetClipList() or {}
local total = #clips
local offset, limit = ${luaInt(offset)}, ${luaInt(limit)}
local out = {}
for i = offset + 1, math.min(total, offset + limit) do
  local c = clips[i]
  local p = c:GetClipProperty() or {}
  out[#out + 1] = { name = p["Clip Name"] or c:GetName(), unique_id = c:GetUniqueId(), file_path = p["File Path"],
    duration = p["Duration"], fps = n(p["FPS"]), resolution = p["Resolution"], type = p["Type"],
    frames = n(p["Frames"]), clip_color = p["Clip Color"] }
end
return { ok = true, bin_path = (bin_path == "" and "/" or bin_path), bin_unique_id = folder:GetUniqueId(),
  total = total, offset = offset, limit = limit, truncated = (offset + #out) < total, clips = out }
`;
}

export function timelineItemsSnippet(trackType: TrackType, index: number, offset: number, limit: number): string {
  return `${PRELUDE}${NEED_TIMELINE}local track_type, index = ${luaString(trackType)}, ${luaInt(index)}
local track_count = tl:GetTrackCount(track_type) or 0
if index > track_count then
  return { ok = false, error = "track " .. track_type .. " " .. index .. " does not exist: the timeline has " .. track_count .. " " .. track_type .. " track(s)",
    track_count = track_count }
end
local items = tl:GetItemListInTrack(track_type, index) or {}
local total = #items
local offset, limit = ${luaInt(offset)}, ${luaInt(limit)}
local out = {}
for i = offset + 1, math.min(total, offset + limit) do
  local it = items[i]
  local rec = { name = it:GetName(), unique_id = it:GetUniqueId(), type = it:GetType(), start = it:GetStart(),
    ["end"] = it:GetEnd(), duration = it:GetDuration(), source_start_frame = it:GetSourceStartFrame(),
    source_end_frame = it:GetSourceEndFrame(), enabled = it:GetClipEnabled() }
  local okm, mpi = pcall(function() return it:GetMediaPoolItem() end)
  if okm and mpi then
    local p = mpi:GetClipProperty() or {}
    rec.file_path = p["File Path"]
    rec.media_pool_item_id = mpi:GetUniqueId()
  end
  out[#out + 1] = rec
end
return { ok = true, timeline = tl:GetName(), timeline_unique_id = tl:GetUniqueId(), track_type = track_type,
  track_index = index, track_name = tl:GetTrackName(track_type, index), track_count = track_count, total = total,
  offset = offset, limit = limit, truncated = (offset + #out) < total, items = out }
`;
}

export function addMarkerSnippet(frame: number, color: MarkerColor, name: string, note: string, duration: number): string {
  return `${PRELUDE}${NEED_TIMELINE}local frame = ${luaInt(frame)}
local ok = tl:AddMarker(frame, ${luaString(color)}, ${luaString(name)}, ${luaString(note)}, ${luaInt(duration)})
if not ok then
  return { ok = false, error = "AddMarker returned false: the frame is occupied by another marker or lies outside the timeline (frames are relative to the timeline start)",
    frame = frame }
end
local markers = tl:GetMarkers() or {}
return { ok = true, timeline = tl:GetName(), timeline_unique_id = tl:GetUniqueId(), frame = frame, marker = markers[frame] }
`;
}

export function deleteMarkersSnippet(color: MarkerColor | 'All'): string {
  return `${PRELUDE}${NEED_TIMELINE}local color = ${luaString(color)}
local function count_markers()
  local t = tl:GetMarkers() or {}
  local total, matching = 0, 0
  for _, m in pairs(t) do
    if type(m) == "table" then
      total = total + 1
      if color == "All" or m.color == color then matching = matching + 1 end
    end
  end
  return total, matching
end
local before_total, matching = count_markers()
local ok = tl:DeleteMarkersByColor(color)
if not ok then return { ok = false, error = "DeleteMarkersByColor returned false", color = color, matching = matching } end
local after_total = count_markers()
return { ok = true, timeline = tl:GetName(), color = color, deleted = before_total - after_total, remaining = after_total }
`;
}

export function setCurrentTimelineSnippet(name: string): string {
  return `${PRELUDE}local name = ${luaString(name)}
local count = project:GetTimelineCount() or 0
local known = {}
for i = 1, count do
  local tl = project:GetTimelineByIndex(i)
  if tl then
    local nm = tl:GetName()
    known[#known + 1] = nm
    if nm == name then
      if not project:SetCurrentTimeline(tl) then return { ok = false, error = "SetCurrentTimeline returned false for " .. nm } end
      return { ok = true, name = nm, unique_id = tl:GetUniqueId(), index = i }
    end
  end
end
return { ok = false, error = "unknown timeline: " .. name, known_timelines = known }
`;
}

export function openProjectSnippet(name: string, saveCurrent: boolean): string {
  return `local pm = resolve:GetProjectManager()
if not pm then return { ok = false, error = "GetProjectManager returned nil: Resolve may still be starting" } end
local name = ${luaString(name)}
local names = pm:GetProjectListInCurrentFolder() or {}
local found = false
for i = 1, #names do if names[i] == name then found = true end end
if not found then return { ok = false, error = "unknown project: " .. name, folder = pm:GetCurrentFolder(), known_projects = names } end
local current = pm:GetCurrentProject()
local previous = current and current:GetName() or nil
if previous == name then
  return { ok = true, name = previous, unique_id = current:GetUniqueId(), already_open = true, saved_previous = false }
end
local saved = false
if current and ${luaBool(saveCurrent)} then
  if not pm:SaveProject() then
    return { ok = false, error = "SaveProject returned false: save the current project in Resolve, or call again with save_current=false" }
  end
  saved = true
end
local p = pm:LoadProject(name)
if not p then return { ok = false, error = "LoadProject returned nil for " .. name, previous = previous, saved_previous = saved } end
return { ok = true, name = p:GetName(), unique_id = p:GetUniqueId(), previous = previous, saved_previous = saved, already_open = false }
`;
}

export function renderSnippet(preset: string | undefined, outputDir: string, filename: string): string {
  const presetBlock = preset === undefined ? '' : `local preset = ${luaString(preset)}
local presets = project:GetRenderPresetList() or {}
local found = false
for i = 1, #presets do if presets[i] == preset then found = true end end
if not found then return { ok = false, error = "unknown render preset: " .. preset, presets = presets } end
if not project:LoadRenderPreset(preset) then return { ok = false, error = "LoadRenderPreset returned false for " .. preset } end
`;
  return `${PRELUDE}${NEED_TIMELINE}${presetBlock}if not project:SetRenderSettings({ TargetDir = ${luaString(outputDir)}, CustomName = ${luaString(filename)} }) then
  return { ok = false, error = "SetRenderSettings returned false: Resolve rejected TargetDir or CustomName" }
end
local job_id = project:AddRenderJob()
if type(job_id) ~= "string" or #job_id == 0 then
  return { ok = false, error = "AddRenderJob returned no job id: check that the Deliver page has a valid render setup for this timeline" }
end
if not project:StartRendering({ job_id }, false) then
  return { ok = false, error = "StartRendering returned false; the job stays queued", job_id = job_id }
end
local jobs = project:GetRenderJobList() or {}
local job = nil
for i = 1, #jobs do if jobs[i].JobId == job_id then job = jobs[i] end end
return { ok = true, timeline = tl:GetName(), job_id = job_id, job = job,
  format_codec = project:GetCurrentRenderFormatAndCodec(), rendering_in_progress = project:IsRenderingInProgress() }
`;
}

export function renderStatusSnippet(jobId: string): string {
  return `${PRELUDE}local job_id = ${luaString(jobId)}
local st = project:GetRenderJobStatus(job_id)
if type(st) ~= "table" or st.JobStatus == nil then
  local jobs = project:GetRenderJobList() or {}
  local ids = {}
  for i = 1, #jobs do ids[#ids + 1] = jobs[i].JobId end
  return { ok = false, error = "unknown render job: " .. job_id, known_job_ids = ids }
end
return { ok = true, job_id = job_id, status = st, rendering_in_progress = project:IsRenderingInProgress() }
`;
}

/** Every snippet with representative arguments, for the syntax-check test. */
export function allSnippetSamples(): Record<string, string> {
  return {
    status: statusSnippet(),
    projectInfo: projectInfoSnippet(),
    listProjects: listProjectsSnippet(),
    listTimelines: listTimelinesSnippet(),
    listClips: listClipsSnippet(['Bin "one"', 'sub]]bin'], 0, 50),
    listClipsRoot: listClipsSnippet([], 10, 5),
    timelineItems: timelineItemsSnippet('video', 1, 0, 100),
    addMarker: addMarkerSnippet(0, 'Blue', 'name "q"\n', 'note\\', 1),
    deleteMarkers: deleteMarkersSnippet('All'),
    deleteMarkersColor: deleteMarkersSnippet('Red'),
    setCurrentTimeline: setCurrentTimelineSnippet('Timeline 1'),
    openProject: openProjectSnippet('My "Project"', true),
    openProjectNoSave: openProjectSnippet('p', false),
    render: renderSnippet('H.264 Master', '/Users/x/out dir', 'file "name"'),
    renderNoPreset: renderSnippet(undefined, '/tmp', 'f'),
    renderStatus: renderStatusSnippet('abc-123'),
  };
}
