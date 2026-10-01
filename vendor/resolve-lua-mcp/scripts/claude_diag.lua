-- claude_diag v0.2.0 (davinci-resolve-lua-mcp sandbox diagnostic)
-- RLB_STATE_DIR=@@RLB_STATE_DIR@@
--
-- Runs inside DaVinci Resolve's Workspace > Scripts Lua host and measures what that host can do,
-- for the davinci-resolve-lua-mcp project. Output channels, in order:
--   1. Fusion prefs: Global.ResolveLuaBridge.RLBDiag = hex(json(results)), via fusion:SetPrefs + SavePrefs
--   2. Media Pool bins under a "claude_diag" bin in the OPEN project, one sub-bin per finding
--   3. print() and a file write, both expected to be muted/blocked; their outcome is recorded in 1 and 2
-- Every step runs under pcall. The script never exits the process, never deletes a file, and only creates
-- bins and one timeline (which it deletes) in the project that is open. Run it ONLY in a scratch
-- project. It reads <state dir>/next.lua, a request file the terminal side pre-creates.

local STATE_DIR_STAMP = [==[@@RLB_STATE_DIR@@]==]   -- substituted at copy time (long bracket: a quote or backslash is safe); unreplaced or "" means: build from HOME/USERPROFILE
local CLEANUP = false                          -- true: delete the claude_diag bin at the end (DeleteFolders)
local PREFIX = "Global.ResolveLuaBridge."
local SCRIPT = "claude_diag v0.2.0"

local R = { script = SCRIPT, bins = {}, saves = {}, errors = {} }
local resolve_obj, fusion_obj, pm, project, mediaPool, rootBin, diagBin
local run = 0
local stateDir, REQ
local gscale = 1            -- bmd.gettime() delta * gscale = seconds (step 12 may set 0.001)
local LOOP_SECONDS = 30
local gStart

-- ---------------------------------------------------------------- helpers

local function tos(v)
  local ok, s = pcall(tostring, v)
  if ok then return s end
  return "<tostring error: " .. tostring(s) .. ">"
end

local function now()
  if type(bmd) == "table" and type(bmd.gettime) == "function" then
    local ok, v = pcall(bmd.gettime)
    if ok and type(v) == "number" then return v end
  end
  return os.clock()
end

local function wall()
  local ok, t = pcall(function() return os.time() end)
  if ok and type(t) == "number" then return t end
  return -1
end

local function wait(s)
  if type(bmd) == "table" and type(bmd.wait) == "function" then pcall(bmd.wait, s) end
end

local tick_wait = function() wait(0.05) end

local function note_error(where, err)
  R.errors[#R.errors + 1] = { where = tos(where), error = tos(err) }
end

-- run fn under pcall and store the outcome in tbl[key]
local function rec(tbl, key, fn)
  local ok, v = pcall(fn)
  if ok then
    if v == nil then tbl[key] = "<nil>" else tbl[key] = v end
  else
    tbl[key] = { error = tos(v) }
    note_error(key, v)
  end
  return ok, v
end

local function safe(fn)
  local ok, v = pcall(fn)
  if ok then
    if v == nil then return "<nil>" end
    return v
  end
  return "error: " .. tos(v)
end

local function genv()
  if type(getfenv) == "function" then
    local ok, e = pcall(getfenv, 1)
    if ok and type(e) == "table" then return e end
  end
  return _G
end

local function gread(nm)
  local env = genv()
  if type(env) ~= "table" then return nil end
  local ok, v = pcall(function() return env[nm] end)
  if ok then return v end
  return nil
end

local HEX = {}
for i = 0, 255 do HEX[string.char(i)] = string.format("%02x", i) end
local function hex(s) return (s:gsub(".", HEX)) end

local function json_string(s)
  s = s:gsub('[%c"\\]', function(c)
    if c == '"' then return '\\"'
    elseif c == '\\' then return '\\\\'
    elseif c == '\n' then return '\\n'
    elseif c == '\r' then return '\\r'
    elseif c == '\t' then return '\\t'
    else return string.format('\\u%04x', c:byte()) end
  end)
  return '"' .. s .. '"'
end

local function json_number(n)
  if n ~= n then return "null" end
  if n == math.huge or n == -math.huge then return "null" end
  if n == math.floor(n) and math.abs(n) < 9007199254740992 then
    if n == 0 then return "0" end
    return string.format("%.0f", n)
  end
  return string.format("%.17g", n)
end

local function is_array(t)
  local n = 0
  for k in pairs(t) do
    if type(k) ~= "number" or k ~= math.floor(k) or k < 1 then return false end
    n = n + 1
  end
  for i = 1, n do if t[i] == nil then return false end end
  return true, n
end

local function key_less(a, b)
  return (type(a) .. tos(a)) < (type(b) .. tos(b))
end

local function json_value(v, depth, seen)
  local tv = type(v)
  if v == nil then return "null"
  elseif tv == "boolean" then return v and "true" or "false"
  elseif tv == "number" then return json_number(v)
  elseif tv == "string" then return json_string(v)
  elseif tv == "table" then
    if getmetatable(v) ~= nil then return json_string("<object " .. tos(v) .. ">") end
    if seen[v] then return json_string("<cycle>") end
    if depth > 12 then return json_string("<depth>") end
    seen[v] = true
    local parts = {}
    local arr, n = is_array(v)
    if arr and n > 0 then
      for i = 1, n do parts[i] = json_value(v[i], depth + 1, seen) end
      seen[v] = nil
      return "[" .. table.concat(parts, ",") .. "]"
    end
    local keys = {}
    for k in pairs(v) do if k ~= "__flags" then keys[#keys + 1] = k end end
    table.sort(keys, key_less)
    for i = 1, #keys do
      local k = keys[i]
      parts[#parts + 1] = json_string(tos(k)) .. ":" .. json_value(v[k], depth + 1, seen)
    end
    seen[v] = nil
    return "{" .. table.concat(parts, ",") .. "}"
  else
    return json_string("<" .. tv .. " " .. tos(v) .. ">")
  end
end

local function json(v) return json_value(v, 0, {}) end

-- raw pairs() dump of an API list or dict: key/value types, #t, metatable, __flags
local function dump_list(t, cap)
  cap = cap or 20
  if type(t) ~= "table" then return { type = type(t), tostring = tos(t) } end
  local d = { type = "table", count = 0, has_meta = getmetatable(t) ~= nil, entries = {} }
  local okn, n = pcall(function() return #t end)
  d.n = okn and n or ("error: " .. tos(n))
  local okf, flags = pcall(rawget, t, "__flags")
  if okf then d.flags = (flags == nil) and "<nil>" or tos(flags) else d.flags = "error: " .. tos(flags) end
  local ok, err = pcall(function()
    for k, v in pairs(t) do
      d.count = d.count + 1
      if d.count <= cap then
        local e = { k = tos(k), kt = type(k), vt = type(v) }
        if type(v) == "table" and getmetatable(v) == nil then e.v = v
        elseif type(v) == "table" or type(v) == "userdata" or type(v) == "function" then e.v = tos(v)
        else e.v = v end
        d.entries[#d.entries + 1] = e
      end
    end
  end)
  if not ok then d.pairs_error = tos(err) end
  return d
end

-- pairs() over an API object (may throw, may iterate method proxies)
local function pairs_probe(obj, cap)
  local d = { type = type(obj), count = 0, keys = {} }
  local okm, mt = pcall(getmetatable, obj)
  d.has_meta = okm and (mt ~= nil) or ("error: " .. tos(mt))
  local ok, err = pcall(function()
    for k, v in pairs(obj) do
      d.count = d.count + 1
      if d.count <= cap then d.keys[#d.keys + 1] = tos(k) .. ":" .. type(v) end
      if d.count >= 500 then d.stopped = true; break end
    end
  end)
  if not ok then d.pairs_error = tos(err) end
  local okl, n = pcall(function() return #obj end)
  d.len = okl and n or ("error: " .. tos(n))
  return d
end

local function save_prefs(tag)
  local s = { tag = tag, attempts = 0, t = wall(), g = now(), ok = false }
  local g0 = now()
  for attempt = 1, 5 do
    s.attempts = attempt
    local ok, ret = pcall(function() return fusion_obj:SavePrefs() end)
    s.ret = tos(ret)
    if ok and ret ~= false then s.ok = true; break end
    s.last_error = ok and "returned false" or tos(ret)
    wait(0.05)
  end
  s.dg = now() - g0
  s.ms = math.floor(s.dg * gscale * 1000 + 0.5)
  R.saves[#R.saves + 1] = s
  return s
end

local function setp(key, value)
  local ok, err = pcall(function() return fusion_obj:SetPrefs(PREFIX .. key, value) end)
  if not ok then note_error("SetPrefs " .. key, err) end
  return ok, err
end

local function getp(key)
  local ok, v = pcall(function() return fusion_obj:GetPrefs(PREFIX .. key) end)
  if ok then return v, nil end
  return nil, v
end

local function encode_results()
  local ok, s = pcall(json, R)
  if ok then return s end
  note_error("encode", s)
  local ok2, s2 = pcall(json, { script = SCRIPT, run = run, fatal = "encode: " .. tos(s), bins = R.bins, errors = R.errors })
  if ok2 then return s2 end
  return '{"script":"' .. SCRIPT .. '","fatal":"encode failed twice"}'
end

local function checkpoint(tag)
  R.checkpoint = tag
  local s = encode_results()
  R.last_encoded_bytes = #s
  setp("RLBDiag", hex(s))
  return save_prefs(tag)
end

local function bin(name)
  local full = name .. "_r" .. tos(run)
  local ok, res = pcall(function() return mediaPool:AddSubFolder(diagBin, full) end)
  R.bins[#R.bins + 1] = { name = full, ok = (ok and res ~= nil and res ~= false) or false, result = ok and tos(res) or ("error: " .. tos(res)) }
  if ok then return res end
  return nil
end

local function capture()
  local prints = {}
  local function cap(...)
    local n = select("#", ...)
    local parts = {}
    for i = 1, n do parts[i] = tos((select(i, ...))) end
    prints[#prints + 1] = table.concat(parts, "\t")
  end
  return prints, cap
end

local function count_keys(t)
  local c = 0
  for _ in pairs(t) do c = c + 1 end
  return c
end

-- ---------------------------------------------------------------- steps

local function step_acquire()
  local A = {}; R.acquire = A
  A.type_resolve_global = type(gread("resolve"))
  A.type_Resolve = type(gread("Resolve"))
  A.type_fusion_global = type(gread("fusion"))
  A.type_fu = type(gread("fu"))
  A.type_app = type(gread("app"))
  A.type_arg = type(gread("arg"))
  A.type_bmd = type(bmd)
  A.type_bmd_scriptapp = (type(bmd) == "table") and type(bmd.scriptapp) or "<no bmd>"
  A.type_G = type(_G)
  if type(_G) == "table" then
    A.rawget_G_resolve = rawget(_G, "resolve") ~= nil
    A.G_has_meta = getmetatable(_G) ~= nil
  end
  if type(getfenv) == "function" then
    local ok, e = pcall(getfenv, 1)
    A.getfenv1_is_G = ok and (e == _G) or ("error: " .. tos(e))
  else
    A.getfenv1_is_G = "<no getfenv>"
  end
  local r = gread("resolve")
  if type(r) == "table" or type(r) == "userdata" then resolve_obj = r; A.source = "global resolve" end
  local Rf = gread("Resolve")
  if resolve_obj == nil and type(Rf) == "function" then
    local ok, v = pcall(Rf)
    A.Resolve_call = ok and type(v) or ("error: " .. tos(v))
    if ok and (type(v) == "table" or type(v) == "userdata") then resolve_obj = v; A.source = "Resolve()" end
  end
  if resolve_obj == nil and type(bmd) == "table" and type(bmd.scriptapp) == "function" then
    local ok, v = pcall(bmd.scriptapp, "Resolve")
    A.scriptapp_call = ok and type(v) or ("error: " .. tos(v))
    if ok and (type(v) == "table" or type(v) == "userdata") then resolve_obj = v; A.source = "bmd.scriptapp" end
  end
  A.type_resolve_obj = type(resolve_obj)
  if resolve_obj == nil then A.source = "none" end
end

local function step_bins()
  local B = {}; R.bins_setup = B
  local ok
  ok, pm = pcall(function() return resolve_obj:GetProjectManager() end)
  B.pm = ok and type(pm) or ("error: " .. tos(pm)); if not ok then pm = nil end
  ok, project = pcall(function() return pm:GetCurrentProject() end)
  B.project = ok and type(project) or ("error: " .. tos(project)); if not ok then project = nil end
  ok, mediaPool = pcall(function() return project:GetMediaPool() end)
  B.mediaPool = ok and type(mediaPool) or ("error: " .. tos(mediaPool)); if not ok then mediaPool = nil end
  ok, rootBin = pcall(function() return mediaPool:GetRootFolder() end)
  B.rootBin = ok and type(rootBin) or ("error: " .. tos(rootBin)); if not ok then rootBin = nil end
  rec(B, "root_name", function() return rootBin:GetName() end)
  rec(B, "current_folder_before", function() return mediaPool:GetCurrentFolder():GetName() end)

  local existing
  local oks, subs = pcall(function() return rootBin:GetSubFolderList() end)
  if oks and type(subs) == "table" then
    B.root_subfolders = safe(function() return #subs end)
    for i = 1, #subs do
      local okn, nm = pcall(function() return subs[i]:GetName() end)
      if okn and nm == "claude_diag" then existing = subs[i]; break end
    end
  else
    B.root_subfolders = "error: " .. tos(subs)
  end
  if existing then
    diagBin = existing; B.diag_bin = "found"
  else
    local okc, created = pcall(function() return mediaPool:AddSubFolder(rootBin, "claude_diag") end)
    if okc and created then diagBin = created; B.diag_bin = "created" else B.diag_bin = "create failed: " .. tos(created) end
  end
  rec(B, "diag_bin_id", function() return diagBin:GetUniqueId() end)

  run = 1
  local okd, dsubs = pcall(function() return diagBin:GetSubFolderList() end)
  if okd and type(dsubs) == "table" then
    local starts = 0
    for i = 1, #dsubs do
      local okn, nm = pcall(function() return dsubs[i]:GetName() end)
      if okn and type(nm) == "string" and nm:sub(1, 14) == "RLB_DIAG_START" then starts = starts + 1 end
    end
    run = starts + 1
    B.existing_subbins = #dsubs
  else
    B.existing_subbins = "error: " .. tos(dsubs)
  end
  R.run = run
  bin("RLB_DIAG_START")

  local dupName = "RLB_dup_r" .. tos(run)
  local ok1, d1 = pcall(function() return mediaPool:AddSubFolder(diagBin, dupName) end)
  local ok2, d2 = pcall(function() return mediaPool:AddSubFolder(diagBin, dupName) end)
  B.dup_first = ok1 and (type(d1) .. " " .. tos(d1)) or ("error: " .. tos(d1))
  B.dup_second = ok2 and (type(d2) .. " " .. tos(d2)) or ("error: " .. tos(d2))
  if ok1 and d1 then rec(B, "dup_first_name", function() return d1:GetName() end) end
  if ok2 and d2 then rec(B, "dup_second_name", function() return d2:GetName() end) end
  B.dup_same_object = safe(function() return ok1 and ok2 and (d1 == d2) end)
  rec(B, "diag_subbins_after_dup", function() return #diagBin:GetSubFolderList() end)
  rec(B, "current_folder_after_bins", function() return mediaPool:GetCurrentFolder():GetName() end)
  rec(B, "set_current_folder_diag", function() return mediaPool:SetCurrentFolder(diagBin) end)
  rec(B, "current_folder_now", function() return mediaPool:GetCurrentFolder():GetName() end)
end

local function step_fusion()
  local F = {}; R.fusion = F
  local function has_setprefs(obj)
    local ok, t = pcall(function() return type(obj.SetPrefs) end)
    return ok and t == "function"
  end
  local cands = { "fusion", "fu", "app" }
  for i = 1, #cands do
    local name = cands[i]
    local obj = gread(name)
    F["type_" .. name] = type(obj)
    if obj ~= nil then F["tostring_" .. name] = tos(obj) end
    if fusion_obj == nil and (type(obj) == "table" or type(obj) == "userdata") and has_setprefs(obj) then
      fusion_obj = obj; F.source = name
    end
  end
  if fusion_obj == nil then
    local ok, f = pcall(function() return resolve_obj:Fusion() end)
    F.resolve_Fusion = ok and type(f) or ("error: " .. tos(f))
    if ok and (type(f) == "table" or type(f) == "userdata") and has_setprefs(f) then fusion_obj = f; F.source = "resolve:Fusion()" end
  end
  if fusion_obj == nil then F.source = "none" end
  F.fusion_eq_fu = safe(function() return gread("fusion") == gread("fu") end)
  F.fusion_eq_app = safe(function() return gread("fusion") == gread("app") end)

  -- in-memory sharing: read before any SetPrefs of this run
  local Me = {}; R.mem = Me
  local v, err = getp("RLBMem")
  Me.RLBMem_before = (v == nil) and "<nil>" or tos(v)
  if err then Me.error = tos(err) end
  Me.shared = (type(v) == "string" and #v > 0)
  bin("RLB_shared_" .. (Me.shared and "y" or "n"))
  local prev = getp("RLBDiag")
  if type(prev) == "string" and #prev > 0 then
    Me.prev_diag_hex_len = #prev
    setp("RLBDiagPrev", prev)
  else
    Me.prev_diag_hex_len = 0
  end
  checkpoint("cp0")
end

local function step_env()
  local E = {}; R.env = E
  E._VERSION = tos(_VERSION)
  local j = gread("jit")
  E.jit_version = (type(j) == "table") and tos(j.version) or "<no jit>"
  E.types = {}
  local names = { "io", "os", "require", "package", "ffi", "bit", "debug", "setfenv", "getfenv", "loadstring",
    "loadfile", "dofile", "xpcall", "pcall", "coroutine", "lpeg", "string", "table", "math", "print",
    "arg", "fu", "app", "fusion", "resolve", "Resolve", "bmd", "UIManager", "ui", "comp", "composition",
    "module", "load", "collectgarbage", "newproxy", "unpack", "select", "rawget", "rawset" }
  for i = 1, #names do E.types[names[i]] = type(gread(names[i])) end
  local io_ = gread("io")
  E.types.io_open = (type(io_) == "table") and type(io_.open) or "<no io>"
  local dbg = gread("debug")
  E.types.debug_traceback = (type(dbg) == "table") and type(dbg.traceback) or "<no debug>"
  local os_ = gread("os")
  if type(os_) == "table" then
    local ks = {}
    for k, v in pairs(os_) do ks[#ks + 1] = tos(k) .. ":" .. type(v) end
    table.sort(ks)
    E.os_keys = ks
  end
  if type(bmd) == "table" then
    local ks = {}
    for k, v in pairs(bmd) do ks[#ks + 1] = tos(k) .. ":" .. type(v) end
    table.sort(ks)
    E.bmd_keys = ks
    E.bmd_VERSION = tos(bmd._VERSION)
    rec(E, "pid", function() return bmd.getpid() end)
    rec(E, "cwd", function() return bmd.getcurrentdir() end)
    rec(E, "uuid_sample", function() return bmd.createuuid() end)
  end
  rec(E, "HOME", function() return os.getenv("HOME") end)
  rec(E, "USER", function() return os.getenv("USER") end)
  -- Windows: HOME is unset there; these three are what the bridge and the server derive paths from.
  rec(E, "USERPROFILE", function() return os.getenv("USERPROFILE") end)
  rec(E, "APPDATA", function() return os.getenv("APPDATA") end)
  rec(E, "PROGRAMDATA", function() return os.getenv("PROGRAMDATA") end)
  rec(E, "PATH_len", function() local p = os.getenv("PATH"); return p and #p or "<nil>" end)
  rec(E, "loop_seconds_env", function() return os.getenv("RLB_DIAG_LOOP_SECONDS") end)
end

local function step_identity()
  local I = {}; R.resolve = I
  rec(I, "product", function() return resolve_obj:GetProductName() end)
  rec(I, "version_string", function() return resolve_obj:GetVersionString() end)
  rec(I, "version_list", function() return dump_list(resolve_obj:GetVersion(), 10) end)
  rec(I, "is_studio", function() return resolve_obj:IsStudio() end)
  rec(I, "current_page", function() return resolve_obj:GetCurrentPage() end)
  rec(I, "project_name", function() return project:GetName() end)
  rec(I, "project_id", function() return project:GetUniqueId() end)
  rec(I, "timeline_count", function() return project:GetTimelineCount() end)
end

local function step_fusion_api()
  local F = R.fusion
  F.methods = {}
  local ms = { "GetPrefs", "SetPrefs", "SavePrefs", "Execute", "RunScript", "MapPath", "GetCurrentComp", "NewComp", "LoadComp", "GetAttrs" }
  for i = 1, #ms do
    local m = ms[i]
    F.methods[m] = safe(function() return type(fusion_obj[m]) end)
  end
  rec(F, "profile", function() return fusion_obj:MapPath("Profile:") end)
  rec(F, "profiles", function() return fusion_obj:MapPath("Profiles:") end)
  rec(F, "scripts_utility", function() return fusion_obj:MapPath("Scripts:/Utility") end)
  rec(F, "scripts_root", function() return fusion_obj:MapPath("Scripts:") end)
  if type(F.profile) == "string" then
    local p = F.profile
    if not p:match("[/\\]$") then p = p .. "/" end   -- a Windows MapPath may end in a backslash
    local prefsPath = p .. "Fusion.prefs"
    F.prefs_path = prefsPath
    rec(F, "prefs_exists", function() return bmd.fileexists(prefsPath) end)
    rec(F, "prefs_loadfile", function()
      local f, e = loadfile(prefsPath)
      return { fn = type(f), err = e and tos(e) or "<nil>" }
    end)
  end
  rec(F, "allow_automatic_scripts", function() return fusion_obj:GetPrefs("Global.Script.AllowAutomaticScripts") end)
  rec(F, "script_prefs", function() return dump_list(fusion_obj:GetPrefs("Global.Script"), 30) end)
end

local function step_state_dir()
  local S = {}; R.state_dir = S
  local cands = {}
  local home = (R.env and type(R.env.HOME) == "string") and R.env.HOME or nil
  if home and #home > 0 then cands[#cands + 1] = { "HOME", home .. "/.davinci-resolve-lua-mcp" } end
  local prof = (R.env and type(R.env.USERPROFILE) == "string") and R.env.USERPROFILE or nil   -- Windows: HOME is unset
  if prof and #prof > 0 then cands[#cands + 1] = { "USERPROFILE", (prof:gsub("[/\\]+$", "")) .. "/.davinci-resolve-lua-mcp" } end
  if type(STATE_DIR_STAMP) == "string" and #STATE_DIR_STAMP > 0 and STATE_DIR_STAMP:sub(1, 2) ~= "@@" then
    cands[#cands + 1] = { "stamp", STATE_DIR_STAMP }
  end
  local profile = R.fusion and R.fusion.profile
  if type(profile) == "string" then
    local pre = profile:match("^(.-)/Library/") or profile:match("^(.-)[/\\]AppData[/\\]")   -- macOS, then Windows
    if pre and #pre > 0 then cands[#cands + 1] = { "profile", pre .. "/.davinci-resolve-lua-mcp" } end
  end
  S.candidates = {}
  for i = 1, #cands do
    local c = cands[i]
    local okx, ex = pcall(function() return bmd.fileexists(c[2] .. "/next.lua") end)
    S.candidates[#S.candidates + 1] = { source = c[1], dir = c[2], next_exists = okx and ((ex == nil) and "<nil>" or ex) or ("error: " .. tos(ex)) }
    if stateDir == nil and okx and ex == true then stateDir = c[2]; S.chosen = c[1] end
  end
  if stateDir == nil then
    if #cands > 0 then stateDir = cands[1][2]; S.chosen = cands[1][1] .. " (next.lua not found there)" else S.chosen = "none" end
  end
  S.dir = stateDir or "<nil>"
  REQ = (stateDir or "/nonexistent") .. "/next.lua"
  S.request_path = REQ
end

local function step_muted()
  local M = {}; R.muted = M
  rec(M, "print", function() print("claude_diag ran r" .. tos(run)); return "called" end)
  rec(M, "io_open", function()
    local path = (stateDir or "/nonexistent") .. "/diag.txt"
    local f, e = io.open(path, "w")
    if f then
      f:write("claude_diag r" .. tos(run) .. " " .. tos(wall()) .. "\n")
      f:close()
      return "wrote " .. path
    end
    return { err = tos(e) }
  end)
end

local function step_request()
  local Q = {}; R.request = Q
  Q.path = REQ
  rec(Q, "exists", function() return bmd.fileexists(REQ) end)
  local chunk, lerr
  local okl, a, b = pcall(loadfile, REQ)
  if okl then
    chunk, lerr = a, b
    Q.loadfile = { fn = type(chunk), err = lerr and tos(lerr) or "<nil>" }
  else
    Q.loadfile = { error = tos(a) }
  end
  local req
  if type(chunk) == "function" then
    local okc, r = pcall(chunk)
    if okc then req = r; Q.chunk_call = type(r) else Q.chunk_call = "error: " .. tos(r) end
  else
    local okd, r = pcall(dofile, REQ)
    Q.dofile = okd and type(r) or ("error: " .. tos(r))
    if okd and type(r) == "table" then req = r end
  end
  local su = R.fusion and R.fusion.scripts_utility
  if type(su) == "string" then
    local p = su
    if not p:match("[/\\]$") then p = p .. "/" end   -- a Windows MapPath may end in a backslash
    rec(Q, "control_loadfile_self", function()
      local f, e = loadfile(p .. "claude_diag.lua")
      return { path = p .. "claude_diag.lua", fn = type(f), err = e and tos(e) or "<nil>" }
    end)
    -- Windows: the server stamps the state dir with forward slashes; this proves loadfile accepts them.
    rec(Q, "control_loadfile_self_slashes", function()
      local sp = (p .. "claude_diag.lua"):gsub("\\", "/")
      local f, e = loadfile(sp)
      return { path = sp, fn = type(f), err = e and tos(e) or "<nil>" }
    end)
  end
  if type(req) == "table" then
    Q.req = {
      v = req.v, id = req.id, op = req.op, session = req.session, ts = req.ts,
      age_s = (type(req.ts) == "number") and (wall() - req.ts) or "<no ts>",
      code_len = (type(req.code) == "string") and #req.code or "<no code>",
      fn_type = type(req.fn),
    }
    bin("RLB_loadfile_y")
  else
    Q.req = "<none>"
    bin("RLB_loadfile_n")
  end

  local handler = tostring
  local dbg = gread("debug")
  if type(dbg) == "table" and type(dbg.traceback) == "function" then handler = dbg.traceback end
  local xp = gread("xpcall")
  if type(xp) ~= "function" then
    xp = function(f, h)
      local ok, e = pcall(f)
      if not ok then return false, h(e) end
      return ok, e
    end
    Q.xpcall = "shim"
  else
    Q.xpcall = "native"
  end

  local function run_path(name, getfn, mode)
    local P = {}; Q[name] = P
    local okg, fn = pcall(getfn)
    if not okg or type(fn) ~= "function" then P.error = "no function: " .. tos(fn); return end
    local prints, cap = capture()
    local restore = {}
    local sf = gread("setfenv")
    local gf = gread("getfenv")
    if mode == "setfenv" then
      if type(sf) ~= "function" then P.error = "setfenv absent"; return end
      local base = genv()
      local env = setmetatable({ print = cap }, { __index = base })
      local oks, e = pcall(sf, fn, env)
      if not oks then P.error = "setfenv failed: " .. tos(e); return end
      P.env_base_is_G = (base == _G)
    else
      local envs = {}
      if type(gf) == "function" then
        local okc, cenv = pcall(gf, fn)
        if okc and type(cenv) == "table" then envs[#envs + 1] = cenv end
      end
      if type(_G) == "table" then envs[#envs + 1] = _G end
      local own = genv()
      if type(own) == "table" then envs[#envs + 1] = own end
      local n = 0
      for i = 1, #envs do
        local e = envs[i]
        if restore[e] == nil then
          restore[e] = { had = e.print }
          e.print = cap
          n = n + 1
        end
      end
      P.swapped_envs = n
      P.chunk_env_is_G = (#envs > 0 and type(gf) == "function") and (envs[1] == _G) or "<unknown>"
    end
    local g0 = now()
    local ok, res = xp(function() return fn() end, handler)
    P.dg = now() - g0
    for e, r in pairs(restore) do e.print = r.had end
    P.ok = ok
    if ok then
      if res == nil then P.result = "<nil>" else P.result = res end
      P.result_matches = (type(res) == "table" and res.a == 1 and type(res.b) == "table" and res.b[1] == 2 and res.b[2] == 3) or false
    else
      P.error = tos(res)
      P.result_matches = false
    end
    P.prints = prints
    P.captured_hi = (prints[1] == "hi")
  end

  local ls = gread("loadstring")
  local code = (type(req) == "table" and type(req.code) == "string") and req.code or nil
  run_path("fn_setfenv", function() return req.fn end, "setfenv")
  run_path("fn_swap", function() return req.fn end, "swap")
  run_path("code_setfenv", function()
    if code == nil then error("no code") end
    local f, e = ls(code, "=request")
    if not f then error("loadstring: " .. tos(e)) end
    return f
  end, "setfenv")
  run_path("code_swap", function()
    if code == nil then error("no code") end
    local f, e = ls(code, "=request")
    if not f then error("loadstring: " .. tos(e)) end
    return f
  end, "swap")
  local cs = Q.code_setfenv
  local setfenv_ok = type(cs) == "table" and cs.captured_hi == true and cs.result_matches == true
  bin("RLB_setfenv_" .. (setfenv_ok and "y" or "n"))
end

local function step_prefs()
  local P = {}; R.prefs = P
  local esc = "plus+slash/eq= dq\" sq' bs\\ nl\n tab\t brackets]] dashes-- utf8 \195\169 \230\151\165\230\156\172 end"
  P.esc_len = #esc
  rec(P, "writestring_esc", function() return bmd.writestring({ s = esc }) end)
  local hexProbe = "diag:" .. hex(tos(safe(function() return bmd.createuuid() end)))
  P.hex_probe = hexProbe
  local oks, se = setp("RLBProbeHex", hexProbe)
  P.hex_setprefs = oks and "ok" or ("error: " .. tos(se))
  P.hex_save = save_prefs("hex")
  local rb = getp("RLBProbeHex")
  P.hex_readback_type = type(rb)
  P.hex_readback_equal = (rb == hexProbe)
  bin("RLB_save_" .. tos(P.hex_save.ms))

  local skip = false
  local ws = P.writestring_esc
  if type(ws) == "string" and ws:find('dq" sq', 1, true) then skip = true end
  if skip then
    P.esc_skipped = "bmd.writestring left a double quote unescaped; not risking the prefs file"
  else
    local oke, ee = setp("RLBProbeEsc", esc)
    P.esc_setprefs = oke and "ok" or ("error: " .. tos(ee))
    P.esc_save = save_prefs("esc")
    local rb2 = getp("RLBProbeEsc")
    P.esc_readback_type = type(rb2)
    P.esc_readback_equal = (rb2 == esc)
    if rb2 ~= esc then P.esc_readback = tos(rb2) end
  end
  checkpoint("cp1")
end

local function step_shape()
  local Sh = {}; R.shape = Sh
  Sh.resolve_type = type(resolve_obj)
  Sh.resolve_tostring = tos(resolve_obj)
  Sh.resolve = pairs_probe(resolve_obj, 40)
  Sh.project = pairs_probe(project, 40)
  Sh.mediaPool_tostring = tos(mediaPool)
  Sh.resolve_Fusion_eq_fusion = safe(function() return resolve_obj:Fusion() == fusion_obj end)
  Sh.resolve_eq_Resolve_call = safe(function()
    local Rf = gread("Resolve")
    if type(Rf) ~= "function" then return "<Resolve not a function>" end
    return Rf() == resolve_obj
  end)
  Sh.project_eq_second_get = safe(function() return pm:GetCurrentProject() == project end)
end

local function step_numbers()
  local N = {}; R.numbers = N
  N.nan = tostring(0 / 0)
  N.inf = tostring(1 / 0)
  N.neginf = tostring(-1 / 0)
  N.big_17g = string.format("%.17g", 2 ^ 53 + 1)
  N.fmt_d_3_5 = safe(function() return string.format("%d", 3.5) end)
  N.fmt_0f_2p52 = string.format("%.0f", 2 ^ 52)
  N.json_sample = json({ 1, 2.5, "s", true, { a = { 1, 2 }, b = "x" }, n = 0 / 0 })

  local T = {}; R.timing = T
  T.gettime_type = safe(function() return type(bmd.gettime()) end)
  T.gettime_sample = safe(function() return bmd.gettime() end)
  local c0 = os.clock()
  local g0 = now()
  wait(0.25)
  local dg = now() - g0
  T.wait_0_25_gettime_delta = dg
  T.wait_0_25_clock_delta = os.clock() - c0
  if dg > 0.1 and dg < 2 then
    T.gettime_unit = "seconds"; gscale = 1
  elseif dg >= 100 and dg < 2000 then
    T.gettime_unit = "milliseconds"; gscale = 0.001
  else
    T.gettime_unit = "unknown"
    local g1 = now()
    wait(50)
    local dg50 = now() - g1
    T.wait_50_gettime_delta = dg50
    if dg50 > 0.02 and dg50 < 0.5 then
      T.wait_semantics = "milliseconds"
      tick_wait = function() wait(50) end
    elseif dg50 >= 20 and dg50 < 500 then
      T.wait_semantics = "milliseconds, gettime in ms"; gscale = 0.001
      tick_wait = function() wait(50) end
    else
      T.wait_semantics = "broken"
    end
  end
  T.gscale = gscale

  local fe = (type(bmd) == "table" and type(bmd.fileexists) == "function") and bmd.fileexists or nil
  if fe then
    local g2 = now()
    local deadline = wall() + 5
    local n = 0
    while n < 1000 do
      fe(REQ)
      n = n + 1
      if n % 100 == 0 and wall() > deadline then break end
    end
    T.fileexists_calls = n
    T.fileexists_delta_s = (now() - g2) * gscale
  else
    T.fileexists_calls = "<no bmd.fileexists>"
  end
end

local function step_lists()
  local L = {}; R.lists = L
  rec(L, "root_clips", function() return dump_list(rootBin:GetClipList(), 10) end)
  rec(L, "render_presets", function() return dump_list(project:GetRenderPresetList(), 10) end)
  rec(L, "project_list", function() return dump_list(pm:GetProjectListInCurrentFolder(), 10) end)
  rec(L, "diag_subbins", function() return dump_list(diagBin:GetSubFolderList(), 5) end)
  local Ap = {}; R.api = Ap
  rec(Ap, "render_format_codec", function() return dump_list(project:GetCurrentRenderFormatAndCodec(), 10) end)
  rec(Ap, "render_jobs_count", function() return #project:GetRenderJobList() end)
  rec(Ap, "database", function() return dump_list(pm:GetCurrentDatabase(), 10) end)
  rec(Ap, "project_attributes_count", function() return count_keys(pm:GetProjectAttributesInCurrentFolder()) end)
  rec(Ap, "current_folder_now", function() return mediaPool:GetCurrentFolder():GetName() end)
  local St = {}; R.settings = St
  rec(St, "project", function()
    local s = project:GetSettings()
    return {
      count = count_keys(s), has_meta = getmetatable(s) ~= nil,
      fps_type = type(s.timelineFrameRate), fps = s.timelineFrameRate,
      width_type = type(s.timelineResolutionWidth), width = s.timelineResolutionWidth,
      height_type = type(s.timelineResolutionHeight), height = s.timelineResolutionHeight,
      use_custom = s.useCustomSettings,
    }
  end)
end

local tl, tlName, prevTl

local function step_timeline()
  local Tl = {}; R.timeline = Tl
  rec(Tl, "prev_current", function()
    prevTl = project:GetCurrentTimeline()
    if prevTl then return prevTl:GetName() end
    return "<nil>"
  end)
  tlName = "claude_diag_scratch_r" .. tos(run)
  Tl.name = tlName
  rec(Tl, "create", function()
    tl = mediaPool:CreateEmptyTimeline(tlName)
    return type(tl)
  end)
  if not tl then Tl.skipped = "no timeline"; return end
  rec(Tl, "id", function() return tl:GetUniqueId() end)
  rec(Tl, "current_after_create", function()
    local c = project:GetCurrentTimeline()
    if c then return c:GetName() end
    return "<nil>"
  end)
  if Tl.current_after_create ~= tlName then
    rec(Tl, "set_current", function() return project:SetCurrentTimeline(tl) end)
  end
  rec(Tl, "start_frame", function() return tl:GetStartFrame() end)
  rec(Tl, "end_frame", function() return tl:GetEndFrame() end)
  rec(Tl, "start_timecode", function() return tl:GetStartTimecode() end)
  rec(Tl, "video_tracks", function() return tl:GetTrackCount("video") end)
  local isCurrent = false
  rec(Tl, "is_current", function()
    local c = project:GetCurrentTimeline()
    isCurrent = (c ~= nil) and (c:GetUniqueId() == tl:GetUniqueId())
    return isCurrent
  end)
  if isCurrent then
    rec(Tl, "append", function()
      local clips = rootBin:GetClipList()
      for i = 1, #clips do
        local t = clips[i]:GetClipProperty("Type")
        if t ~= "Timeline" then
          local items = mediaPool:AppendToTimeline({ { mediaPoolItem = clips[i] } })
          return { clip = safe(function() return clips[i]:GetName() end), clip_type = t, result_type = type(items),
            n = (type(items) == "table") and safe(function() return #items end) or "<n/a>" }
        end
      end
      return "no eligible clip in the root bin"
    end)
  else
    Tl.append = "skipped: scratch timeline is not the current timeline"
  end
  rec(Tl, "end_frame_after", function() return tl:GetEndFrame() end)
  rec(Tl, "items_v1", function()
    local items = tl:GetItemListInTrack("video", 1)
    local d = dump_list(items, 10)
    d.items = {}
    for i = 1, #items do
      local it = items[i]
      d.items[i] = {
        name = safe(function() return it:GetName() end),
        type = safe(function() return it:GetType() end),
        start = safe(function() return it:GetStart() end),
        ["end"] = safe(function() return it:GetEnd() end),
        duration = safe(function() return it:GetDuration() end),
        id = safe(function() return it:GetUniqueId() end),
      }
    end
    return d
  end)
  rec(Tl, "settings", function()
    local s = tl:GetSettings()
    return { count = count_keys(s), has_meta = getmetatable(s) ~= nil, use_custom = s.useCustomSettings,
      fps_type = type(s.timelineFrameRate), fps = s.timelineFrameRate }
  end)

  local Mk = {}; R.markers = Mk
  rec(Mk, "range", function() return tl:GetEndFrame() - tl:GetStartFrame() end)
  local okm, added = pcall(function() return tl:AddMarker(1, "Blue", "diag", "", 1) end)
  Mk.add_at_1 = okm and tos(added) or ("error: " .. tos(added))
  local markerFrame = (okm and added == true) and 1 or nil
  if markerFrame == nil then
    local sf = Tl.start_frame
    if type(sf) == "number" then
      local ok2, a2 = pcall(function() return tl:AddMarker(sf + 1, "Blue", "diag", "", 1) end)
      Mk.add_at_start_plus_1 = ok2 and tos(a2) or ("error: " .. tos(a2))
      if ok2 and a2 == true then markerFrame = sf + 1 end
    end
  end
  Mk.frame_used = markerFrame or "<none>"
  rec(Mk, "markers", function() return dump_list(tl:GetMarkers(), 10) end)
  if markerFrame then
    rec(Mk, "delete", function() return tl:DeleteMarkerAtFrame(markerFrame) end)
    rec(Mk, "markers_after_delete", function() return dump_list(tl:GetMarkers(), 10) end)
  end
end

local function step_loop()
  local Lp = {}; R.loop = Lp
  Lp.seconds_planned = LOOP_SECONDS
  bin("RLB_LOOP_START")
  local fe = (type(bmd) == "table" and type(bmd.fileexists) == "function") and bmd.fileexists or function() return nil end
  local g0 = now()
  local t0 = wall()
  local last = g0
  local ticks, maxgap, sumgap = 0, 0, 0
  local saved = false
  local halfway = LOOP_SECONDS / 2
  local found = 0
  while true do
    local elapsed = (now() - g0) * gscale
    if elapsed >= LOOP_SECONDS then Lp.exit = "time"; break end
    if (wall() - t0) >= LOOP_SECONDS + 5 then Lp.exit = "wall clock guard"; break end
    if ticks >= 20000 then Lp.exit = "tick cap"; break end
    tick_wait()
    if fe(REQ) then found = found + 1 end
    local n2 = now()
    local gap = (n2 - last) * gscale
    last = n2
    ticks = ticks + 1
    sumgap = sumgap + gap
    if gap > maxgap then maxgap = gap; Lp.max_gap_tick = ticks end
    if not saved and elapsed >= halfway then
      saved = true
      setp("RLBLoop", "half r" .. tos(run))
      Lp.half_save = save_prefs("loop")
      Lp.half_save_tick = ticks
    end
  end
  Lp.ticks = ticks
  Lp.request_seen_ticks = found
  Lp.max_gap_s = maxgap
  Lp.mean_gap_s = (ticks > 0) and (sumgap / ticks) or "<no ticks>"
  Lp.elapsed_s = (now() - g0) * gscale
  Lp.wall_s = wall() - t0
  bin("RLB_LOOP_END")
  checkpoint("cp2")
end

local function step_big()
  local Bg = {}; R.big = Bg
  local specs = { { "RLBProbe64K", 64 * 1024, "64k" }, { "RLBProbe512K", 512 * 1024, "512k" } }
  for i = 1, #specs do
    local key, size, tag = specs[i][1], specs[i][2], specs[i][3]
    local s = string.rep("0123456789abcdef", size / 16)
    local e = {}; Bg[tag] = e
    e.len = #s
    local oks, se = setp(key, s)
    e.set = oks and "ok" or ("error: " .. tos(se))
    e.save = save_prefs(tag)
    local rb = getp(key)
    e.readback_len = (type(rb) == "string") and #rb or ("<" .. type(rb) .. ">")
    e.readback_equal = (rb == s)
    setp(key, "")
    e.reset_save = save_prefs(tag .. "-reset")
    e.after_reset = safe(function() local v = getp(key); return type(v) .. ":" .. tos(v) end)
  end
end

local function step_cleanup()
  local C = {}; R.cleanup = C
  if tl then
    if prevTl then
      rec(C, "restore_prev_timeline", function()
        if prevTl:GetUniqueId() ~= tl:GetUniqueId() then return project:SetCurrentTimeline(prevTl) end
        return "prev is the scratch timeline"
      end)
    end
    rec(C, "delete_timeline", function() return mediaPool:DeleteTimelines({ tl }) end)
    if C.delete_timeline ~= true then C.manual_delete = tlName end
    rec(C, "timeline_count_after", function() return project:GetTimelineCount() end)
  end
  rec(C, "restore_root_folder", function() return mediaPool:SetCurrentFolder(rootBin) end)
  if CLEANUP then
    rec(C, "delete_bins", function() return mediaPool:DeleteFolders({ diagBin }) end)
  else
    C.bins_left = "claude_diag bin kept in the project (CLEANUP=false)"
  end
end

local function step_final()
  R.elapsed_s = (now() - gStart) * gscale
  R.elapsed_wall_s = wall() - (R.started and R.started.t or wall())
  R.save_count_before_final = #R.saves
  checkpoint("final")
  bin("RLB_DIAG_DONE")
  local pid = (R.env and R.env.pid) or "?"
  setp("RLBMem", "r" .. tos(run) .. ":pid" .. tos(pid) .. ":" .. tos(safe(function() return bmd.createuuid() end)))
end

-- ---------------------------------------------------------------- main

local function main()
  gStart = now()
  R.started = { t = wall(), g = gStart }
  pcall(function() R.started.iso = os.date("!%Y-%m-%dT%H:%M:%SZ") end)
  pcall(function()
    local v = os.getenv("RLB_DIAG_LOOP_SECONDS")
    if v and tonumber(v) then LOOP_SECONDS = tonumber(v) end
  end)
  local steps = {
    { "acquire", step_acquire },
    { "bins", step_bins },
    { "fusion", step_fusion },
    { "env", step_env },
    { "identity", step_identity },
    { "fusion_api", step_fusion_api },
    { "state_dir", step_state_dir },
    { "muted", step_muted },
    { "request", step_request },
    { "prefs", step_prefs },
    { "shape", step_shape },
    { "numbers", step_numbers },
    { "lists", step_lists },
    { "timeline", step_timeline },
    { "loop", step_loop },
    { "big", step_big },
    { "cleanup", step_cleanup },
    { "final", step_final },
  }
  R.steps = {}
  for i = 1, #steps do
    local name, fn = steps[i][1], steps[i][2]
    local g0 = now()
    local ok, err = pcall(fn)
    R.steps[#R.steps + 1] = { name = name, ok = ok, dg = now() - g0, error = (not ok) and tos(err) or nil }
    if not ok then note_error("step " .. name, err) end
  end
end

local ok, err = pcall(main)
if not ok then
  pcall(function() R.fatal = tos(err); note_error("main", err) end)
  pcall(function() mediaPool:AddSubFolder(diagBin, "RLB_FATAL_r" .. tos(run)) end)
  pcall(function()
    fusion_obj:SetPrefs(PREFIX .. "RLBDiag", hex(encode_results()))
    fusion_obj:SavePrefs()
  end)
end
pcall(function()
  if os.getenv("RLB_DIAG_DEBUG") == "1" then print("RLB_DIAG_DEBUG " .. encode_results()) end
end)
