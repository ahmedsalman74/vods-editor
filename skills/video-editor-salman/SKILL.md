---
name: video-editor-salman
description: Design captions, restrained motion graphics, hooks and finishing treatments for approved stream edits, preserving the shared edit timing and source frame rate.
---

This is the original open-source finishing skill in this repository. It is not a redistributed copy of the separately obtained third-party engine previously called video-editor-bassam. It gives the assistant an editing procedure; it does not bundle a motion renderer. Use verified Resolve/Fusion or available FFmpeg capabilities. An optional local engine can be imported separately; read [engine integration](references/engine.md) when one is requested.

Read the current job's edit brief and the adjacent [VOD editing choices and quality guide](../vods-editor/references/choices-quality.md). Read references/local-install.md if present for configured paths. Reuse the selected clip order, source-to-output timing, aspect ratio, source FPS, facecam/gameplay crop and protected HUD/face regions.

Use real choice controls where the host offers them. Offer a small set of caption/font/palette examples and separate off/subtle/strong zoom and shake choices. Keep unknown preferences unknown. Render a representative short preview before expanding an unapproved style. Avoid repetitive prompts after the user has approved a style for the job.

Build the hook from verified footage and preserve the setup/payoff. Keep intros short and motivated; retain complete words, laughs and reactions at every join and at the ending. Use restrained motion with easing and a clean return to neutral. Do not animate captions, facecam and gameplay aggressively at the same time. Do not fabricate ammo counts, scores or other gameplay facts for decorative graphics.

Choose the rendering route from actual available tools. Look up Resolve API signatures before applying effects; Studio-only effects are not available through a Free bridge. If a requested effect is unsupported, offer a supported substitute before the full render. Do not claim an external template exists without checking it. Optional third-party renderers carry their own installation and licensing requirements.

Correct captions against audio evidence; flag uncertain speech rather than treating guesses as exact quotes. Verify Arabic shaping/direction and timing in the exported video. Retiming an edit requires retiming captions, sound effects and graphic cues together. Do not silently reduce 60 fps footage to a renderer's 30 fps default.

Use the same EDL for final video and Resolve timeline. State any prerendered graphics that are not individually editable in Resolve. Inspect actual rendered boundaries, first/last ten seconds and all added motion at playback speed. Distinguish measured audio checks from listening; if audio perception is unavailable, mark it pending. Deliver versioned review files and specific revision choices. Preserve source and previous exports. Do not publish without an explicit request.
