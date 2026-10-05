# Instructions for AI assistants

A user who pastes this repository's link usually wants two things: install the workflow on their PC, then edit a stream recording with it. Follow this guide step by step. Speak the user's language (often Arabic), skip jargon, ask one question at a time, and use real choice controls when the host offers them.

## 0. Check the host

The full workflow needs shell access: **Claude Code** (CLI, IDE or the Code tab of Claude Desktop) or **Codex**. In a normal chat without a shell, say so plainly and ask the user to open the Code tab, then paste the link again. Windows is the supported platform.

## 1. Ask the setup questions

Ask only what you cannot detect:

1. **DaVinci Resolve edition:** Free or Studio. Check whether Resolve is installed. This project does not install or buy Resolve, so if it is missing, send the user to Blackmagic's download page.
2. **Transcription:** whether to install Whisper speech analysis (`--analysis`). It is a large download (PyTorch, several GB) and is recommended for finding moments in long streams.
3. **Data folder:** where downloads, analysis and exports go. Suggest a drive with plenty of free space and an ASCII-only short path, e.g. `D:\VodsEditor`. Show free space per drive.

## 2. Check prerequisites

Check each one and report only what is missing:

```powershell
py -3.12 --version
node --version
git --version
ffmpeg -version
ffprobe -version
```

Requirements are Python 3.11+ (3.12 recommended), Node.js 20+ (Free MCP and the included motion engine), Git, and FFmpeg with ffprobe. For anything missing, tell the user what you will install and roughly how big it is, get a yes, then run the matching command:

```powershell
winget install -e --id Python.Python.3.12
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Git.Git
winget install -e --id Gyan.FFmpeg
```

A newly installed tool is not on PATH in an already open app. Use its full install path for the rest of this session, or ask the user to restart the assistant and paste the link again.

## 3. Clone to a short path

Long Windows paths break the clone, so use a short ASCII folder such as `C:\vods-editor` or `D:\vods-editor`:

```powershell
git -c core.longpaths=true clone https://github.com/ahmedsalman74/vods-editor.git D:\vods-editor
```

If the folder already holds this repository, run `git pull` instead of cloning again. The installed configuration points to this folder, so it must stay in place.

## 4. Run setup

From the repository root, preview first, show the user the target paths, then run it for real:

```powershell
py -3.12 scripts/setup.py --edition free --client claude-code --data-dir D:\VodsEditor --analysis --dry-run
py -3.12 scripts/setup.py --edition free --client claude-code --data-dir D:\VodsEditor --analysis
```

Adjust `--edition` (`free`/`studio`), `--client` (`claude-code`, `codex`, `claude-desktop`, `all`), `--data-dir`, and drop `--analysis` if the user declined it.

If setup stops because a skill or a different `davinci-resolve` MCP entry already exists, explain what would be replaced and ask before re-running with `--replace`. The installer backs up replaced entries in `.local/backups`, but it does not merge customizations.

## 4b. Prepare the included motion engine

The full `video-editor-salman` engine is included and copied by setup. Follow [engine runtime preparation](skills/video-editor-salman/references/engine.md), using Git Bash and the activated repository Python. Check dependencies, then install missing engine packages within the user-authorized setup scope. `--analysis` only covers the VOD helper, not every engine dependency. Remotion setup requires an actual job's caption/theme inputs and installs project-local packages on first use. Never report full renderer readiness from an MCP connection test alone.

## 5. Connect Resolve

**Free:**

1. Run `.\.venv\Scripts\python.exe scripts/doctor.py`. The first run installs the bridge script into Resolve and reports offline. That is expected.
2. Ask the user to open (or restart) Resolve, open a project, and click **Workspace → Scripts → resolve_mcp_bridge**. This click is needed once every Resolve session.
3. Run `doctor.py` again. It should print `PASS`. It is read-only.

**Studio:** follow [docs/studio.md](docs/studio.md). The user clicks **File → Setup AI Assistants** inside Resolve Studio.

Never run `claude_diag` on a real project, because it creates bins and timelines.

## 6. Hand over

The skills and the MCP load when the assistant starts. Tell the user to restart Claude Code (or open a new session), check that `vods-editor` and `davinci-resolve` appear, and then send a recording link. For example:

> استخدم vods-editor مع الفيديو ده: [الرابط]. اعملي هايلايت عمودي قصير ومونتاج يوتيوب لو المادة تسمح. خليني أختار المقاطع وستايل الكابشن والألوان والزوم والهزة والانترو والأوترو. اسألني قبل ما تعدّل أي مشروع موجود في ريزولف.

Finish with a short summary of what was installed, where the data folder is, and the bridge click they must repeat after each Resolve restart.

## 7. When editing

After the restart, load the `vods-editor` skill and follow it. It covers source choice, download, analysis, clip selection, style choices, preview, Resolve assembly and delivery checks. The `video-editor-salman` skill supplies the full caption/motion engine, templates, styles and checks. Load its stream integration reference before applying talking-head defaults to gameplay.

## Limits and safety

- Do not enter passwords, import browser cookies, or download content the user has no right to use.
- Do not install Resolve, buy licenses, or change system settings.
- Ask before changing an existing Resolve project, and never save or switch projects as a connection test.
- The supplied engine formerly named `video-editor-bassam` is included under `video-editor-salman`. Preserve its source/asset notices and do not claim the root MIT license covers it. See its provenance notice. Its inclusion does not install runtimes or prove all rendering paths are validated.
