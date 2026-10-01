-- resolve_mcp_bridge v0.2.0
-- RLB_STATE_DIR=@@RLB_STATE_DIR@@
-- The in-Resolve half of davinci-resolve-lua-mcp (protocol v1). Launched from
-- Workspace > Scripts, it polls <state_dir>/next.lua, runs the chunk a request carries, and answers
-- through Fusion prefs (Global.ResolveLuaBridge.RLBResp = "<id>:<hex json>", one SavePrefs per
-- request; RLBSession once at start and on stop). The host facts it relies on are measured, not
-- documented by Blackmagic. It never exits the process, never deletes a file, never
-- touches prefs while idle, and has no dependencies. Loaded with the chunk argument
-- "RLB_BRIDGE_TESTING" (tests/lua, under fuscript) it returns its internals instead of looping.

local MODE = ...

local VERSION = "0.2.0"
local BRIDGE = "resolve_mcp_bridge v" .. VERSION
local STATE_DIR_STAMP = [==[@@RLB_STATE_DIR@@]==] -- server-stamped at copy time; long bracket: quotes are safe
local PREFIX = "Global.ResolveLuaBridge."
local TICK = 0.05                              -- seconds between bmd.fileexists polls
local STALE_S = 120                            -- requests older than this get an error response
local MAX_KB_DEFAULT, MAX_KB_CEILING = 64, 192 -- response JSON cap (before hex), per request
local PRINT_MAX_LINES, PRINT_MAX_BYTES, PRINT_LINE_MAX = 200, 16384, 2048
local ERROR_MAX = 4096
local DEPTH_MAX = 16
local SAVE_RETRIES = 5
local BAD_FILE_BACKOFF_S = 1                   -- re-parse an unreadable request at most this often
local DIAG_KEYS = { "RLBDiag", "RLBDiagPrev", "RLBMem", "RLBLoop",
                    "RLBProbeHex", "RLBProbeEsc", "RLBProbe64K", "RLBProbe512K" }

-- Primitives ------------------------------------------------------------------------------------

local function tos(v)
  local ok, s = pcall(tostring, v)
  if ok and type(s) == "string" then return s end
  return "<" .. type(v) .. ">"
end

-- Global read that survives the metatable on _G; the only way `debug` is reached.
local function gread(name)
  local ok, v = pcall(function() return _G[name] end)
  if ok then return v end
end

local function bmd_call(name, ...)
  if type(bmd) == "table" and type(bmd[name]) == "function" then
    local ok, v = pcall(bmd[name], ...)
    if ok then return v end
  end
  return nil
end

local function now()
  local t = bmd_call("gettime")
  if type(t) == "number" then return t end
  return os.clock()
end
local function wall() local ok, t = pcall(os.time); return (ok and type(t) == "number") and t or 0 end
local function wait(s) bmd_call("wait", s) end
local function file_exists(path) return bmd_call("fileexists", path) == true end
local function ms_since(t0) return math.floor((now() - t0) * 1000 + 0.5) end
local function pack(...) return { n = select("#", ...), ... } end

local function clamp(n, lo, hi) if n ~= n or n < lo then return lo elseif n > hi then return hi end return n end

-- obj:method() under pcall; the value only if it is a string (API probes and health checks).
local function call_string(obj, method)
  local ok, v = pcall(function() return obj[method](obj) end)
  if ok and type(v) == "string" then return v end
  return nil
end

-- Encoders: hex and JSON ----------------------------------------------------------------------

local HEX = {}
for i = 0, 255 do HEX[string.char(i)] = string.format("%02x", i) end
local function hex(s) return (s:gsub(".", HEX)) end

local function json_string(s)
  local out = s:gsub('[%c"\\]', function(c)
    if c == '"' then return '\\"'
    elseif c == '\\' then return '\\\\'
    elseif c == '\n' then return '\\n'
    elseif c == '\r' then return '\\r'
    elseif c == '\t' then return '\\t'
    end
    return string.format('\\u%04x', c:byte())
  end)
  return '"' .. out .. '"'
end

local function json_number(n)
  if n ~= n or n == math.huge or n == -math.huge then return "null" end
  if n == 0 then return "0" end
  if n == math.floor(n) and math.abs(n) < 9007199254740992 then return string.format("%.0f", n) end
  local s = string.format("%.14g", n)
  if tonumber(s) ~= n then s = string.format("%.17g", n) end
  return s
end

-- A table is a JSON array only when its keys (ignoring Resolve's __flags) are exactly 1..n.
local function array_shape(t)
  local n, flagged = 0, false
  for k in pairs(t) do
    if k == "__flags" then flagged = true
    elseif type(k) ~= "number" or k ~= math.floor(k) or k < 1 then return false, 0, flagged
    else n = n + 1 end
  end
  for i = 1, n do if t[i] == nil then return false, n, flagged end end
  return true, n, flagged
end

local function key_less(a, b)
  local ta, tb = type(a), type(b)
  if ta ~= tb then return ta < tb end
  if ta == "number" then return a < b end
  return tos(a) < tos(b)
end

local function json_key(k)
  if type(k) == "number" then return json_string(json_number(k)) end
  return json_string(tos(k))
end

local json_value
json_value = function(v, depth, seen)
  local tv = type(v)
  if v == nil then return "null"
  elseif tv == "boolean" then return v and "true" or "false"
  elseif tv == "number" then return json_number(v)
  elseif tv == "string" then return json_string(v)
  elseif tv ~= "table" then return json_string("<" .. tv .. " " .. tos(v) .. ">")
  end
  if getmetatable(v) ~= nil then return json_string("<object " .. tos(v) .. ">") end
  if seen[v] then return json_string("<cycle>") end
  if depth > DEPTH_MAX then return json_string("<depth>") end
  seen[v] = true
  local parts = {}
  local arr, n, flagged = array_shape(v)
  if arr and (n > 0 or flagged) then
    for i = 1, n do parts[i] = json_value(v[i], depth + 1, seen) end
    seen[v] = nil
    return "[" .. table.concat(parts, ",") .. "]"
  end
  local keys = {}
  for k in pairs(v) do if k ~= "__flags" then keys[#keys + 1] = k end end
  table.sort(keys, key_less)
  for i = 1, #keys do
    parts[i] = json_key(keys[i]) .. ":" .. json_value(v[keys[i]], depth + 1, seen)
  end
  seen[v] = nil
  return "{" .. table.concat(parts, ",") .. "}"
end

local function json(v) return json_value(v, 0, {}) end

-- Response envelope and size cap --------------------------------------------------------------

local ENVELOPE_KEYS = { "ms", "truncated", "result_bytes", "prints_dropped", "extra_returns", "error", "prints" }

-- Assembled by hand so the result is encoded once, a nil result still reads "result":null,
-- and the key order is fixed: v, id, session, op, ok, <optional fields>, result, bridge.
local function envelope_json(f, result_json)
  local parts = {
    '"v":1',
    '"id":' .. json_string(tos(f.id)),
    '"session":' .. json_string(tos(f.session or "")),
    '"op":' .. json_string(tos(f.op or "")),
    '"ok":' .. (f.ok and "true" or "false"),
  }
  for i = 1, #ENVELOPE_KEYS do
    local k = ENVELOPE_KEYS[i]
    local v = f[k]
    if v ~= nil then
      if k == "prints" and type(v) == "table" and #v == 0 then
        parts[#parts + 1] = '"prints":[]'
      else
        parts[#parts + 1] = json_string(k) .. ":" .. json(v)
      end
    end
  end
  parts[#parts + 1] = '"result":' .. (result_json or "null")
  parts[#parts + 1] = '"bridge":' .. json_string(BRIDGE)
  return "{" .. table.concat(parts, ",") .. "}"
end

-- Back a cut position off UTF-8 continuation bytes so a preview never splits a character.
local function utf8_cut(s, cut)
  while cut > 0 and cut < #s do
    local b = s:byte(cut + 1)
    if b < 0x80 or b >= 0xC0 then break end
    cut = cut - 1
  end
  return cut
end

-- Returns the envelope JSON, at most max_kb KB. Over the cap the result becomes a string
-- preview of its own JSON (truncated = true, result_bytes = full size); then prints go; then
-- the error text is cut. Escaping only inflates, so the loop converges in a few rounds.
local function fit_response(f, result, max_kb)
  local max = clamp(tonumber(max_kb) or MAX_KB_DEFAULT, 1, MAX_KB_CEILING) * 1024
  local okj, rj = pcall(json, result)
  if not okj then rj = json_string("<encode error: " .. tos(rj) .. ">") end
  local s = envelope_json(f, rj)
  if #s <= max then return s end
  f.truncated = true
  f.result_bytes = #rj
  local overhead = #s - #rj
  local cut = math.min(#rj, math.max(0, max - overhead - 32))
  for _ = 1, 8 do
    if cut <= 0 then break end
    cut = utf8_cut(rj, cut)
    local preview = json_string(rj:sub(1, cut))
    s = envelope_json(f, preview)
    if #s <= max then return s end
    -- Shrink in proportion to the escaped size, so quote-heavy results still fill the budget.
    local budget = max - (#s - #preview) - 16
    local next_cut = math.floor(cut * budget / #preview)
    cut = (next_cut < cut) and next_cut or (cut - 1)
  end
  f.prints_dropped = (f.prints_dropped or 0) + #(f.prints or {})
  f.prints = {}
  s = envelope_json(f, '""')
  if #s <= max then return s end
  if type(f.error) == "string" then f.error = f.error:sub(1, 256) else f.error = nil end
  return envelope_json(f, '""')
end

-- print capture ---------------------------------------------------------------------------------

local function new_capture()
  local st = { prints = {}, dropped = 0, bytes = 0 }
  st.print = function(...)
    local n = select("#", ...)
    local parts = {}
    for i = 1, n do parts[i] = tos((select(i, ...))) end
    local line = table.concat(parts, "\t")
    if #line > PRINT_LINE_MAX then line = line:sub(1, PRINT_LINE_MAX) .. "..." end
    if #st.prints >= PRINT_MAX_LINES or st.bytes + #line > PRINT_MAX_BYTES then
      st.dropped = st.dropped + 1
    else
      st.prints[#st.prints + 1] = line
      st.bytes = st.bytes + #line
    end
  end
  return st
end

-- Acquiring resolve, fusion and the state directory -------------------------------------------

local function is_api_object(obj) return type(obj) == "userdata" or type(obj) == "table" end

local function has_method(obj, name)
  local ok, t = pcall(function() return type(obj[name]) end)
  return ok and t == "function"
end

-- Plain global first (a metatable on _G would hide it from rawget), then Resolve() as the
-- shipped examples do, then bmd.scriptapp. An object counts only if GetProductName answers.
local function acquire_resolve()
  local function accept(obj, source)
    if is_api_object(obj) and call_string(obj, "GetProductName") then return obj, source end
    return nil
  end
  local r, src = accept(gread("resolve"), "global")
  if r then return r, src end
  local Rf = gread("Resolve")
  if type(Rf) == "function" then
    local ok, v = pcall(Rf)
    if ok then r, src = accept(v, "Resolve()") end
    if r then return r, src end
  end
  r, src = accept(bmd_call("scriptapp", "Resolve"), "bmd.scriptapp")
  if r then return r, src end
  return nil, "no resolve object (global, Resolve() and bmd.scriptapp all failed)"
end

-- First of fusion, fu, app with a SetPrefs method (all one object here), else resolve:Fusion().
local function acquire_fusion(resolve)
  local names = { "fusion", "fu", "app" }
  for i = 1, #names do
    local obj = gread(names[i])
    if is_api_object(obj) and has_method(obj, "SetPrefs") then return obj, names[i] end
  end
  if resolve ~= nil then
    local ok, f = pcall(function() return resolve:Fusion() end)
    if ok and is_api_object(f) and has_method(f, "SetPrefs") then return f, "resolve:Fusion()" end
  end
  return nil, "no fusion object with SetPrefs"
end

-- Lua never expands "~": stamp > RLB_STATE_DIR env > HOME > USERPROFILE (Windows; HOME is unset there)
-- > the home prefix of MapPath("Profile:") ("<home>/Library/" on macOS, "<home>[/\]AppData[/\]" on Windows).
local function resolve_state_dir(stamp, getenv, mappath)
  local function strip(p) return (p:gsub("[/\\]+$", "")) end
  if type(stamp) == "string" and #stamp > 0 and stamp:sub(1, 2) ~= "@@" then return strip(stamp), "stamp" end
  local env = getenv and getenv("RLB_STATE_DIR")
  if type(env) == "string" and #env > 0 then return strip(env), "env" end
  local home = getenv and getenv("HOME")
  if type(home) == "string" and #home > 0 then return strip(home) .. "/.davinci-resolve-lua-mcp", "HOME" end
  local prof = getenv and getenv("USERPROFILE")
  if type(prof) == "string" and #prof > 0 then return strip(prof) .. "/.davinci-resolve-lua-mcp", "USERPROFILE" end
  if mappath then
    local ok, profile = pcall(mappath, "Profile:")
    local p = ok and type(profile) == "string" and profile or ""
    local pre = p:match("^(.-)/Library/") or p:match("^(.-)[/\\]AppData[/\\]")
    if pre and #pre > 0 then return pre .. "/.davinci-resolve-lua-mcp", "profile" end
  end
  return nil, "no state directory: RLB_STATE_DIR not stamped; RLB_STATE_DIR, HOME and USERPROFILE unset"
end

-- Requests --------------------------------------------------------------------------------------

-- loadfile + call under pcall, in an empty environment: a request is `return { ... }` and
-- needs no globals, so a tampered file cannot reach _G. Returns the table or nil, error.
local function load_request(path)
  local okl, chunk, lerr = pcall(loadfile, path)
  if not okl then return nil, "loadfile threw: " .. tos(chunk) end
  if type(chunk) ~= "function" then return nil, "loadfile: " .. tos(lerr) end
  if type(setfenv) == "function" then pcall(setfenv, chunk, {}) end
  local okc, req = pcall(chunk)
  if not okc then return nil, "request chunk error: " .. tos(req) end
  if type(req) ~= "table" then return nil, "request did not return a table (" .. type(req) .. ")" end
  return req
end

-- The id is spliced raw into the RLBResp line the server matches with a regex.
local function valid_id(id)
  return type(id) == "string" and #id > 0 and #id <= 64 and id:match("^[%w%-_]+$") ~= nil
end

local OPS = { run = true, ping = true, stop = true }

local function validate_request(req)
  if type(req) ~= "table" then return false, "request is not a table" end
  if not valid_id(req.id) then return false, "invalid request id" end
  if req.v ~= 1 then return false, "unsupported protocol version " .. tos(req.v) end
  if type(req.session) ~= "string" then return false, "missing session" end
  if type(req.op) ~= "string" or not OPS[req.op] then return false, "unknown op " .. tos(req.op) end
  if type(req.ts) ~= "number" then return false, "missing ts" end
  if req.op == "run" and type(req.code) ~= "string" then return false, "run without code" end
  return true
end

local function request_max_kb(req)
  local n = tonumber(req.max_kb)
  if n == nil then return MAX_KB_DEFAULT end
  return clamp(n, 1, MAX_KB_CEILING)
end

-- Running a chunk -------------------------------------------------------------------------------

-- Globals the chunk assigns land in this table; reads fall through to _G.
local function make_env(st, cap)
  return setmetatable({ print = cap, resolve = st.resolve, fusion = st.fusion, fu = st.fusion, app = st.fusion },
                      { __index = _G })
end

local function run_chunk(st, code)
  local r = { ok = false, ms = 0 }
  local cap = new_capture()
  r.prints = cap.prints
  local fn, lerr = loadstring(code, "=request")
  if not fn then
    r.error = "loadstring: " .. tos(lerr)
    return r
  end
  if type(setfenv) == "function" then setfenv(fn, make_env(st, cap.print)) end
  local handler = function(e) if type(e) == "table" then return e end return tos(e) end   -- keep table errors
  local dbg = gread("debug")
  if type(dbg) == "table" and type(dbg.traceback) == "function" then handler = dbg.traceback end
  -- Functions the chunk builds with loadstring inherit _G, so swap _G.print as well (measured).
  local orig_print = rawget(_G, "print")
  rawset(_G, "print", cap.print)
  local t0 = now()
  local res = pack(xpcall(function() return fn() end, handler))
  r.ms = ms_since(t0)
  rawset(_G, "print", orig_print)
  if cap.dropped > 0 then r.prints_dropped = cap.dropped end
  if res[1] then
    r.ok = true
    r.result = res[2]
    if res.n > 2 then r.extra_returns = res.n - 2 end
  else
    r.error = type(res[2]) == "table" and res[2] or tos(res[2]):sub(1, ERROR_MAX)
  end
  return r
end

-- Prefs: the only SetPrefs / SavePrefs call sites ---------------------------------------------

local function set_pref(st, key, value)
  local F = st.fusion
  local ok, err = pcall(function() return F:SetPrefs(PREFIX .. key, value) end)
  if not ok then return false, tos(err) end
  return true
end

-- SavePrefs returns nil on success; a throw or an explicit false is a failure. Resolve may be
-- writing the file itself, so retry a few times.
local function save_prefs(st)
  local F = st.fusion
  local t0 = now()
  local last
  for attempt = 1, SAVE_RETRIES do
    local ok, ret = pcall(function() return F:SavePrefs() end)
    if ok and ret ~= false then return true, attempt, ms_since(t0) end
    last = ok and "returned false" or tos(ret)
    wait(0.05)
  end
  return false, SAVE_RETRIES, ms_since(t0), last
end

local function session_json(st, state, extra)
  local t = {
    v = 1, session = st.session, pid = st.pid, started = st.started, product = st.product,
    version = st.version, profile = st.profile, state = state, bridge = BRIDGE,
    state_dir = st.state_dir, state_dir_source = st.state_dir_source,
  }
  if extra then for k, v in pairs(extra) do t[k] = v end end
  return hex(json(t))
end

-- Sets RLBResp (no save). If SetPrefs throws, try once with a minimal error envelope.
local function set_response(st, id, text)
  local ok, err = set_pref(st, "RLBResp", id .. ":" .. hex(text))
  if ok then return true end
  local minimal = envelope_json({ id = id, session = st.session, ok = false, error = "SetPrefs: " .. tos(err) }, "null")
  ok = set_pref(st, "RLBResp", id .. ":" .. hex(minimal))
  if not ok then return false, "SetPrefs failed twice" end
  return true, "minimal"
end

-- Request handling and the loop ---------------------------------------------------------------

-- Returns the envelope fields and the result value for a validated, fresh request.
local function handle_request(st, req)
  local f = { id = req.id, session = st.session, op = req.op }
  if req.op == "ping" then
    f.ok = true
    return f, { ok = true, product = st.product, version = st.version, pid = st.pid, session = st.session,
                state_dir = st.state_dir, uptime_s = wall() - st.started, bridge = BRIDGE,
                session_saved = st.session_saved, start_save = st.start_save, last_error = st.last_error }
  elseif req.op == "stop" then
    f.ok = true
    return f, { ok = true, session = st.session }
  end
  local r = run_chunk(st, req.code)
  f.ok, f.ms, f.error, f.prints = r.ok, r.ms, r.error, r.prints
  f.prints_dropped, f.extra_returns = r.prints_dropped, r.extra_returns
  return f, r.result
end

-- One new request (id already recorded). Returns "takeover", "stopped", "unreachable" or nil.
local function dispatch(st, req)
  if type(req.session) == "string" and req.session ~= "*" and req.session ~= st.session then
    return "takeover"   -- a newer loop owns the slot; leave without touching prefs
  end
  local ok, err = validate_request(req)
  if ok and req.op == "run" and req.session ~= st.session then
    ok, err = false, 'run needs this bridge\'s session id; "*" is only for ping and stop'
  end
  local f = { id = req.id, session = st.session, op = type(req.op) == "string" and req.op or "" }
  local text
  if not ok then
    f.ok, f.error = false, err
    text = envelope_json(f, "null")
  elseif wall() - req.ts > STALE_S then
    f.ok, f.error = false, "stale request (age " .. tos(wall() - req.ts) .. " s)"
    text = envelope_json(f, "null")
  else
    local result
    f, result = handle_request(st, req)
    text = fit_response(f, result, request_max_kb(req))
  end
  set_response(st, req.id, text)
  if ok and req.op == "stop" then
    -- Only mark the session stopped if RLBSession is still ours (a newer loop may own it).
    local okg, cur = pcall(function() return st.fusion:GetPrefs(PREFIX .. "RLBSession") end)
    if okg and (cur == nil or cur == "" or cur == st.session_hex) then
      set_pref(st, "RLBSession", session_json(st, "stopped", { stopped = wall() }))
    end
    save_prefs(st)
    return "stopped"
  end
  save_prefs(st)
  if ok and req.op == "run" and not f.ok then
    -- Cheap health check only after a failed run: three strikes and the API is gone.
    st.strikes = call_string(st.resolve, "GetVersionString") and 0 or st.strikes + 1
    if st.strikes >= 3 then return "unreachable" end
  elseif ok then
    st.strikes = 0
  end
  return nil
end

-- Acquires the objects, records a pre-existing request so it is never run, and writes the
-- one RLBSession save. opts (tests only): resolve, fusion, state_dir, getenv.
local function start(opts)
  opts = opts or {}
  local st = { started = wall(), bad_until = 0, strikes = 0 }
  st.resolve, st.resolve_source = opts.resolve, "opts"
  if st.resolve == nil then st.resolve, st.resolve_source = acquire_resolve() end
  st.fusion, st.fusion_source = opts.fusion, "opts"
  if st.fusion == nil then st.fusion, st.fusion_source = acquire_fusion(st.resolve) end
  if st.fusion == nil then return nil, st.fusion_source end
  st.pid = tonumber(bmd_call("getpid")) or -1
  local uuid = bmd_call("createuuid")
  if type(uuid) == "string" then uuid = uuid:gsub("[^%w%-]", "") end
  if type(uuid) ~= "string" or #uuid == 0 then uuid = tos(st.started) .. "-" .. tos(st.pid) end
  st.session = uuid
  local getenv = opts.getenv or os.getenv
  local function mappath(p) return st.fusion:MapPath(p) end
  local okp, profile = pcall(mappath, "Profile:")
  if okp and type(profile) == "string" then st.profile = profile end
  if st.resolve ~= nil then
    st.product = call_string(st.resolve, "GetProductName")
    st.version = call_string(st.resolve, "GetVersionString")
  end
  if opts.state_dir then
    st.state_dir, st.state_dir_source = opts.state_dir, "opts"
  else
    st.state_dir, st.state_dir_source = resolve_state_dir(STATE_DIR_STAMP, getenv, mappath)
  end
  local fatal = (st.resolve == nil and st.resolve_source) or (st.state_dir == nil and st.state_dir_source) or nil
  if fatal then
    set_pref(st, "RLBSession", session_json(st, "error", { error = fatal }))
    save_prefs(st)
    return nil, fatal
  end
  st.req_path = st.state_dir .. "/next.lua"
  if file_exists(st.req_path) then
    local req = load_request(st.req_path)
    if type(req) == "table" and valid_id(req.id) then st.last_id = req.id
    else st.bad_until = now() + BAD_FILE_BACKOFF_S end
  end
  st.session_hex = session_json(st, "running")
  set_pref(st, "RLBSession", st.session_hex)
  for i = 1, #DIAG_KEYS do set_pref(st, DIAG_KEYS[i], "") end
  set_pref(st, "RLBResp", "")
  local ok, attempts, ms, err = save_prefs(st)
  st.start_save = { ok = ok, attempts = attempts, ms = ms, error = err }
  st.session_saved = ok   -- when false, run_loop retries the save once a second until it lands
  return st
end

-- Polls until stop, takeover or an unreachable API. max_ticks and tick are for tests.
local function run_loop(st, max_ticks, tick)
  tick = tick or TICK
  local ticks = 0
  while true do
    if max_ticks and ticks >= max_ticks then return "ticks" end
    ticks = ticks + 1
    wait(tick)
    if not st.session_saved and now() >= (st.session_retry_at or 0) then
      -- The start save failed every attempt (Resolve was writing prefs): finish it, once a second.
      st.session_saved = save_prefs(st)
      st.start_save.retries = (st.start_save.retries or 0) + 1
      if not st.session_saved then st.session_retry_at = now() + 1 end
    end
    if file_exists(st.req_path) and now() >= st.bad_until then
      local req, lerr = load_request(st.req_path)
      if req == nil or not valid_id(req.id) then
        if file_exists(st.req_path) then   -- still there: unreadable, not just deleted by the server
          st.bad_until = now() + BAD_FILE_BACKOFF_S
          st.last_error = lerr or "invalid request id"
        end
      elseif req.id ~= st.last_id then
        st.last_id = req.id
        local action = dispatch(st, req)
        if action then return action end
      end
    end
  end
end

local function main()
  local st = start()
  if st then run_loop(st) end
end

local M = {
  VERSION = VERSION, BRIDGE = BRIDGE, PREFIX = PREFIX, STATE_DIR_STAMP = STATE_DIR_STAMP, TICK = TICK,
  STALE_S = STALE_S, MAX_KB_DEFAULT = MAX_KB_DEFAULT, MAX_KB_CEILING = MAX_KB_CEILING,
  PRINT_MAX_LINES = PRINT_MAX_LINES, PRINT_MAX_BYTES = PRINT_MAX_BYTES, PRINT_LINE_MAX = PRINT_LINE_MAX,
  ERROR_MAX = ERROR_MAX, DEPTH_MAX = DEPTH_MAX, SAVE_RETRIES = SAVE_RETRIES,
  BAD_FILE_BACKOFF_S = BAD_FILE_BACKOFF_S, DIAG_KEYS = DIAG_KEYS,
  hex = hex, json = json, array_shape = array_shape, envelope_json = envelope_json, fit_response = fit_response,
  new_capture = new_capture, acquire_resolve = acquire_resolve, acquire_fusion = acquire_fusion,
  resolve_state_dir = resolve_state_dir, load_request = load_request, valid_id = valid_id,
  validate_request = validate_request, request_max_kb = request_max_kb, make_env = make_env,
  run_chunk = run_chunk, set_pref = set_pref, save_prefs = save_prefs, session_json = session_json,
  set_response = set_response, handle_request = handle_request, dispatch = dispatch, start = start,
  run_loop = run_loop, main = main,
}

if MODE == "RLB_BRIDGE_TESTING" then return M end
main()
