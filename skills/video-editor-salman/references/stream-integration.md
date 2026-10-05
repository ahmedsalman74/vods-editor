# Stream editing integration — Salman's update, 2026-10-01

This supplement applies when editing gameplay, livestream excerpts or work handed off from `vods-editor`. It implements the user's updated preferences; retain the normal talking-head workflow for unrelated talking-head requests.

## Shared brief and choices

Read the active `edit-brief.json` and the adjacent skill's [selectable brief and quality reference](../../vods-editor/references/choices-quality.md). Treat this as the stream-specific override where generic talking-head defaults conflict. Do not repeat onboarding choices already made. Use `AskUserQuestion` for available real choices: style, palette, font, caption treatment, clips to retain, ordering, motion intensity and previews. Never require typing clip IDs for ordinary keep/drop operations. No claim that Markdown checkboxes or fictional dropdowns are interactive.

Offer the actual renderer styles separately from editing character: clean/energetic/suspense/comedy are creative briefs; `simple`, `collage`, `documentary`, `board` require verifying their installed assets and support. Render Arabic/font/color examples and a short motion sample. Use approved profile preferences, then per-job overrides. Do not alter saved identity preferences unless asked to remember the selection.

## Timeline and media contract

- Work from the approved source ranges and source-to-output EDL. Receive selected duration/aspect/FPS, facecam/gameplay crop, protected regions, confirmed captions and style selections before building graphics.
- Preserve game suspense, reactions, music/game cues and continuity. Do not blindly apply `01_cut_plan.py` speech-silence removal to gameplay; silence can be the essential setup. No mandatory one-scene-per-15-seconds density for gameplay. Use meaningful, selectively placed overlays while preserving actual validation requirements.
- Do not overwrite the gameplay composition with the standard full-screen talking-head crop. Baked-in webcam enlargement has a real resolution ceiling. Protect face, crosshair, HUD and important action.
- Honor the selected FPS. Read the renderer's composition FPS and time conversions; do not assume 30. If 60 fps cannot be supported without an unapproved tradeoff, present compatible alternatives before final production. Do not merely relabel 30 fps frames as 60.
- Retiming any cut requires retiming word captions, graphic cues, SFX and the Resolve assembly together. Keep the final export and Resolve timeline equivalent, or explain clearly which elements are intentionally prerendered.

## Screen shake and zoom correction

The user's complaint is about shakes and zoom effects. Honor separate off/subtle/strong selections and the motion target (facecam/gameplay). Default new shake proposals to off; do not silently override a previously approved preference. Avoid shake on every hit, erratic continuous jitter, extreme webcam magnification, black edges, abrupt reset, or simultaneous movement of gameplay, webcam and captions. Apply easing and decay, then review full-speed playback and start/peak/end frames. A still frame cannot prove smoothness. Use the shared reference's preview ranges as starting points, adjusted to actual footage. Never invent gameplay facts for decorative ammo counters or gauges.

## Hook and boundaries

Build the hook from confirmed footage. Preview the opening and one representative effect before expanding a new style across the edit. Join hook-to-intro and all source segments with complete words, reactions and motivated audio continuity. Review first/last 10 seconds and every cut with handles. Fix clipped greetings, abrupt outro endings, pops, truncated laughs and random crossfades. Strong suspense can need less motion, not more.

## QA and delivery

Keep the existing preflight, face, scene, color, audio and flash checks that apply to the composition. Do not disable checks or ignore an exit code to make a render pass. If a talking-head checker does not support a game split layout, adapt/parameterize it and document the limitation; perform the equivalent visual check. Do not label an unrun check as passed.

Review the rendered file, including effect motion at playback speed, Arabic text shaping, word timing, cropped facecam, important HUD, actual FPS and A/V sync. Distinguish measured loudness from listening. If audio perception is unavailable, say auditory review is pending and provide precise ranges for review. Avoid inventing uncertain dialect words or adding guesses to `dialect.json`. No final-quality promise from a few thumbnails. Keep versioned review exports and working files for revisions.
