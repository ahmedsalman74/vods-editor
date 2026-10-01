# Resolve Free: Lua bridge

The vendored [saadk408/davinci-resolve-lua-mcp](https://github.com/saadk408/davinci-resolve-lua-mcp) server exchanges requests with a Lua script running **inside** Resolve. Python is used by our helpers, not as an external Resolve API connection.

## First connection

1. Finish the README setup with `--edition free`.
2. Run `scripts/doctor.py` with the repository virtual-environment Python. Starting the server installs its bridge script; the first offline result is expected until you start that script.
3. Open/restart Resolve and open the project you intend to inspect. Run **Workspace → Scripts → resolve_mcp_bridge** once.
4. Run doctor again. It initializes MCP, lists tools and calls only `resolve_status`, `get_project_info`, and `list_timelines`. It does not open another project, modify a timeline or save anything. The server's initial script installation is a filesystem setup action.
5. Restart the selected client and check its MCP list. Ask for a read-only current-project check before editing.

The installer preserves other client settings and backs up entries before replacement. Free connection configuration is also written to `.local/mcp-free.json`; it contains local paths, stays ignored by Git and can be passed to `doctor.py --config`.

## Common fixes

| Symptom | Check |
|---|---|
| `python` opens the Store | Use `py -3.12`; reopen apps after installing Python. |
| Node/npm or FFmpeg missing | Reopen the shell; check `node --version`, `ffmpeg -version`, `ffprobe -version`. Set `FFMPEG_DIR` to FFmpeg's **bin folder** if needed. |
| Script missing from Workspace | Start doctor once to install it, then restart Resolve. Check Resolve's scripts directory permissions and MCP stderr. Do not run an unrelated Python installer. |
| MCP listed but Resolve offline | Start the Lua bridge inside Resolve; client registration alone does not start it. All clients and the bridge must use the same state directory. |
| Two bridges respond or timeout | Use one active bridge session for the state directory; restart Resolve and start it once. |
| Existing configuration conflict | Inspect the named server; use `--replace` only for an intentional switch. Backups are under `.local/backups`. |
| Store Claude Desktop configuration not found | Pass `--desktop-config` with the real `claude_desktop_config.json` path; regular and Store installations differ. |
| Studio-only tool fails | Free does not gain paid effects through MCP. Use a supported substitute. |
| Twitch/other video unavailable | Check metadata with `--info-only`. Deleted/private/expired/restricted content may require a local source. The helper never imports cookies automatically. |
| Analysis out of GPU memory | Use the small model, close other GPU work if appropriate, or run with `$env:CUDA_VISIBLE_DEVICES='-1'` for CPU. |

The upstream `claude_diag` script changes project content and is not used by our doctor. Do not run it on an existing real project for a connection check.

## Client limits

Normal Claude Desktop chat can call the MCP, but this project's shell download/analysis workflow needs Claude Code (including Desktop Code mode) or Codex. Native selection controls also depend on the host. The skills must use available controls or explain the fallback honestly.

## Updates

Pull this repository, review the changes, and rerun setup deliberately using `--replace` when updating installed skills/server registration. Save your skill customizations first; backups do not automatically merge them. Vendored MCP source is pinned; updating it requires upstream review, license preservation, build/tests and a fresh read-only Resolve check. Dependency and platform changes can require further validation.
