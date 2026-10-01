---
name: vods-editor
description: Edit the creator’s gaming and other stream recordings from Twitch, YouTube, TikTok, Instagram or local files into highlights, vertical clips and YouTube montages, with selectable styles and DaVinci Resolve editing.
---

This workflow supports gaming and other stream recordings, not only Valorant. Identify the actual game/content from the user's brief and source. For horror, look for suspense, scares and reactions; for competitive games, plays and clutches; for chatting, complete stories and funny exchanges. Do not reuse event labels or layouts from an unrelated game.

## Interactive brief

Read [choices and editorial quality](references/choices-quality.md) before intake, selection or editing. Use real choice controls, preferably Claude Code's `AskUserQuestion`, instead of asking the user to type clip numbers or keep/drop IDs. Use the available host's equivalent only where supported; never claim plain Markdown is a clickable form. Collect only missing choices, remember explicit preferences, and offer “use my saved style” to avoid repeating onboarding.

Ask the user to select source platform when unspecified, then the source video, output types/lengths, visual style, text/font/palette, zoom and shake intensity, and intro/outro approach. If a clear URL or choice is already supplied, use it. Check metadata before downloading; if pasted link text and target contain different video IDs, present both titles/links with selection controls rather than guessing. A reference video is not automatically an editing source.

Save the actual choices and their scope in a per-job `edit-brief.json` under `<data-dir>/analysis`. Reuse existing creator identity preferences when applicable; store lasting stream preferences separately at `<data-dir>/preferences.json` only when the user chooses to remember them. Do not overwrite either profile with invented choices.

## Tools and setup

Read [the local workflow guide](references/workflow.md) for runtime paths, download/analysis commands and Resolve startup. The helper accepts individual finished recordings/clips from Twitch, YouTube, TikTok and Instagram. It does not capture an ongoing livestream. Platform availability/authentication still depends on the actual URL.

Use the configured connection mode: Studio native MCP, or the `davinci-resolve` Lua MCP for Free, tested on Windows Free 21.1.0.17. Discover the Studio tool names from the actual server; do not assume the Lua server schema applies to the native server. Begin with connection and current-project read-only queries; in the Free bridge these are `resolve_status` and `get_project_info`. For the Free route only, if stopped run **Workspace > Scripts > resolve_mcp_bridge** once per Resolve session. Do not run `claude_diag` on a real project; it changes bins/timelines.

Prefer purpose-built MCP tools. For `run_lua`, first look up methods with `scripting_api_docs`; use colon calls, 1-based arrays, short batches and read-back checks. Studio-only features remain unavailable. Never invent a color or editing API.

## From recording to edit

1. Resolve the selected source and download quality; inspect duration, identity, frame rate, audio, color tags and free space. Reuse an existing verified download. Keep sources unchanged and use the configured data directory with short paths. User-supplied edit links authorize download/analysis; links embedded only in past conversations do not start a new download.
2. Inspect the real webcam/game layout. A baked-in webcam is not a separate camera source. Check transcript plus audio/visual evidence, review lead-in and payoff, and sample outside loudness peaks. A loud menu effect is not a jump scare. Do not label an unverified event as a kill, clutch, or character encounter.
3. Show titled thumbnail/preview candidates with timestamps and an evidence note. Let the user select clips through controls; offer editor-recommended, chronological or custom ordering. Use human-readable titles instead of requiring IDs. Keep internal IDs stable. Record decisions in the edit brief.
4. Build a supported hook and preview the first 5–10 seconds plus a representative motion/caption segment before rendering the full new style. Offer select-to-approve or revise. Once that style is approved for this job, do not ask again for every similar cut. Finishing a sentence or reaction matters more than arbitrary timestamps.
5. Confirm changes to an **existing Resolve project/timeline** only where the session has not already authorized them. Present a concrete target and edit plan first. Never save or switch away from an unsaved project as a connection check; `open_project` can save by default. Authorization for a new edit does not cover unrelated projects. A setup or skill-update request is not an editing request.
6. Use one edit decision list for captions, graphics, sound and Resolve assembly. Preserve source FPS unless the user accepts a specific conversion. If a renderer is fixed to 30 fps while source is 60, adapt its timing/render setup or offer a compatible route; do not silently halve the frame rate. Do not stretch short footage into a 5–10 minute montage.
7. Apply the [delivery checks](references/choices-quality.md#delivery-checks) to the actual render, especially cut boundaries, hook, intro/outro and effect motion. Report measured checks, perceptual review and anything unreviewed separately. Never claim to have listened if audio playback/perception was unavailable. Provide versioned review files; publishing requires an explicit request.

## Using video-editor-salman

When the user wants its motion/caption treatment, load the adjacent [video-editor-salman skill](../video-editor-salman/SKILL.md). Pass the same edit brief, confirmed captions, source-to-output timing, FPS, protected face/HUD regions and style choices. For gameplay, preserve suspense and game audio instead of applying talking-head silence removal or an arbitrary scene-every-15-seconds rule. Keep the companion's validation checks; investigate failures rather than disabling them to finish a render. Never apply its talking-head crop to the entire gameplay frame.

Explain progress in the user's language. Read references/local-install.md when installed. If setup is missing, follow the repository README; do not replace an existing working MCP connection during routine editing.
