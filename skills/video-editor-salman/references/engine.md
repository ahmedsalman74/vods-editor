# Included motion and caption engine

The full engine is included in this skill: silence planning, word-timed transcription, captions, Remotion templates, browser-frame fallback, simple/collage/documentary/board style resources, face protection, sound/color/cut/flash checks, and stream integration. No separate ZIP is needed.

## Runtime preparation on Windows

The repository installer copies this complete directory into the selected client's skills folder. Its `--analysis` option installs the VOD helper's Whisper stack; the engine additionally uses faster-whisper, MediaPipe/OpenCV, Git Bash and Node. Do not confuse copying the skill with installing every renderer dependency.

Run from the repository root in **Git Bash**, with the repository virtual environment active:

```bash
source .venv/Scripts/activate
export PYTHONUTF8=1
# Route the engine's python3 calls to the activated Python on Windows.
python3() { python "$@"; }
export -f python3
cd skills/video-editor-salman
bash scripts/00_setup.sh
```

The dependency check exits 10 when something is missing. After the user's installation authorization, run `bash scripts/00_setup.sh --install` in the same shell and inspect the result. On Windows, use Git's Bash rather than a separate WSL Python environment. Reopen shells after system package installation. The script may also create a python3 shim when necessary.

For Remotion, first create the job's captions, theme and other inputs following SKILL.md, then run `bash scripts/04b_remotion.sh <job-folder> setup`. It installs project-local npm dependencies. This command is not a bare-machine health check and will fail without the job files. Use a job folder outside the repository; do not commit recordings or render artifacts.

For the browser-frame fallback and browser-based checks, follow `light-engine.md` to install `puppeteer-core` under the engine data folder's `tools` directory. Install a compatible browser or set `CHROME_PATH` to one already available. The standard Remotion route and fallback have different dependencies; install what the selected route needs.

## Stream-specific behavior

Read `stream-integration.md` and the adjacent `vods-editor` skill. Gameplay must not inherit automatic talking-head silence removal or crops. The shipped Remotion template starts with a vertical 1080x1920 composition and a default frame rate: inspect/adapt its dimensions, FPS and second-to-frame calculations for the actual output before rendering. Do not label an unchanged template as 60 fps or landscape support.

Use real previews, verify Arabic shaping and clip boundaries, and run applicable checks against the render. The repository's automated tests do not prove a complete render works on every fresh PC. Model weights and project data are downloaded/generated on demand.

## Data and attribution

`VES_HOME` selects the engine's data directory; legacy `VEB_HOME` is also accepted. Existing legacy data directories are reused. Fresh users default to `~/Documents/video-editor-salman`. The VOD helper's selected data directory is separate; set `VES_HOME` to its `engine` subfolder if you want everything on the same drive.

Read [provenance](../PROVENANCE.md) for the imported engine's license scope. The old ZIP importer remains a legacy local utility; it is no longer required for the included engine.
