# Selectable brief and editorial quality

## Real controls, not typed clip IDs

In Claude Code, use `AskUserQuestion` when exposed in the current session. Its documented form has 1–4 questions, 2–4 options per question, a short header and `multiSelect` for checkboxes. Prefer one focused question at a time for this user. Use the tool's actual current schema; do not make up dropdown, drag-and-drop or rich-preview fields. Ask in the user's language. Other/custom text is for a unique URL, font, hex color, or new request, not routine selections.

In Codex, use an available question tool within its own constraints. If it only supports single choice, ask sequentially; do not pretend it supplies checkboxes. If no question UI is available, explain once and offer a local review form with real controls, or a short ordinary-language choice. Do not show Markdown checkboxes as though the chat can submit them.

For shortlist review, display actual thumbnails/brief previews, descriptive titles and source ranges, then let the user check clips in small groups. Do not put “keep all” in a multi-select group with individual clips; it creates contradictory selections. First ask “recommended set / choose clips / review previews.” For custom order, use successive choices of the next clip or selected clip plus move-earlier/move-later controls. A local review page may offer up/down or drag-and-drop only if those controls are implemented and its saved choices can be read. The assistant owns the EDL; the user need not manually organize video frames.

Save explicit choices per job. “Recommended” or preselected is not submitted consent. “Use your judgment” is a valid choice for creative preferences; record the chosen defaults and proceed. Never turn a timeout into project-edit approval. Skip questions already answered in the brief or current conversation.

## Intake and style choices

Present only relevant groups, staged as needed:

| Decision | Selectable choices / behavior |
|---|---|
| Source platform | Twitch / YouTube / TikTok / Instagram; local-file route separately. Infer a clear supplied URL; otherwise ask. |
| Video identity | For ambiguous/multiple links: show each actual title, duration and platform; download only the selection. Ask whether a supplied style link is reference-only or source if unclear. |
| Download quality | Best available / up to 1080p / up to 720p. Explain estimated size and preserve actual FPS within the chosen quality. |
| Content focus | Game-appropriate choices: funny reactions / scares and suspense / skilled plays / story highlights; optional multi-select. |
| Outputs | Vertical clips / landscape montage / both. Ask output count and duration with realistic presets or custom text, avoiding 2-minute shorts when 30–60 seconds was agreed. |
| Edit character | Clean gameplay / cinematic suspense / energetic gaming / playful comedy. These are briefs, not promises of installed renderer templates. |
| Graphics treatment | Minimal labels / game-inspired callouts / collage or story cards / captions only. Preview an actual treatment before committing. |
| Zoom | Off / subtle / expressive. Confirm whether it applies to facecam, gameplay or both; protected regions stay visible. |
| Screen shake | Off (recommended starting point) / subtle on selected impacts / strong on selected impacts. No continuous shaking and no shake on every event by default. |
| Caption treatment | Readable phrase captions / word-highlight captions / punchline-only / no burned-in captions. Provide SRT as requested. |
| Font | Inspect installed fonts first; offer 2–4 usable faces with rendered Arabic/English samples. Example font candidates: Cairo, Tajawal, IBM Plex Sans Arabic, Noto Kufi Arabic, only if installed/available. |
| Palette | Saved identity / choose a palette / match supplied reference. Then show 2–4 labeled swatches, with separate text, highlight and background colors; accept custom hex. No arbitrary claim that a palette is already the user's preference. |
| Intro | Hook straight into action / hook then short title / hook then natural greeting. A logo animation is optional, not a prerequisite. |
| Outro | Natural payoff / brief closing or CTA / seamless loop. Keep a complete phrase/reaction and adequate visual/audio tail. |
| Audio | Original game and voice / subtle licensed music / user-provided track. Ask only about new processing not already covered by their preferences. |
| Color | Preserve footage / natural facecam correction / match provided reference. Confirm actual footage treatment; graphic colors are separate from grading. |

Offer “same style as last time” or “change style” on later jobs. Preserve existing companion `profile.json`, `voice.md` and restrictions. The new brief can override saved preferences for this job without overwriting them permanently. Profile contradictions that affect the result need a focused choice, not repeated onboarding.

The job brief should hold source URL/platform/identity and role, outputs/count/target durations/aspect/FPS, content focus, selected clip IDs and order, hook source range and concept, intro/outro, visual treatment, motion intensity and target, font/caption style/palette, music/grade choices, target Resolve project, approval scope, and validation state. Unknown choices stay unknown. Do not invent approvals. Use source-to-output timestamps for every EDL segment and retime captions/effects after every trim.

## Hook, intro and outro

Build 2–3 hook options from confirmed footage, not fictional reactions or misleading text. Examples: a tension beat just before a scare, a surprising line with enough context, or a strong play with a question the clip resolves. Let the user choose an actual short preview; recommend the best fit. Start with a meaningful image/action or audible line in the first 1–2 seconds. For suspense, tease without spoiling the entire payoff. Avoid dead air or a long title before the hook; do not use a cropped scream with no understandable context.

For a longer montage, connect the cold open to the introduction using motivated picture/audio continuity or a restrained title cue. Do not chop “hello” into the next scene, repeat the same hook in full accidentally, or crossfade unrelated speech. A clean hard cut can be correct; random transitions and constant dissolves do not fix bad timing.

At the ending, retain the final word, breath/reaction and a natural short hold. Finish sound fades deliberately; do not abruptly truncate music, reverb, a laugh or a sentence. A loop is optional and must be reviewed through the seam. The outro should fit the video's pace rather than pad the runtime.

## Shake and zoom quality

Pay particular attention to shakes and zoom effects. Treat them as accents with intentional start, peak, settle and recovery, not automatic decorations. “Off” means no added shake/zoom, including inside templates. A user's exact preset wins; the ranges below are starting points to preview, not mandatory values.

- Subtle punch-in: roughly 1.03–1.08×; expressive roughly 1.08–1.15× where resolution/crop allows. Prefer a short eased ramp and controlled hold; do not immediately snap back on the next unrelated word. Baked-in small facecam crops need lower magnification.
- Subtle shake: roughly 0.1–0.25% of frame width for 0.10–0.18 seconds; strong up to roughly 0.5% for 0.15–0.25 seconds only on chosen moments. Decay smoothly to zero, avoid clipping edges, and inspect at full speed on a phone-sized view. Reduce/disable if the result feels jittery even when numeric limits pass.
- Choose facecam emphasis OR gameplay emphasis when both moving would be distracting. Keep captions stable and readable, protect hair/chin/eyes, crosshair, objective and kill feed. Do not stack shake, flash, zoom and huge text on every hit.
- Anchor zoom from measured subject position; validate start/peak/end frames and full-speed motion. Frame samples cannot establish smoothness. Preserve source frame rate and use seconds-to-frame conversion at the actual render FPS.
- Event strength should govern emphasis. For horror, preserve quiet anticipation; for comedy, land on the punchline; for competitive action, keep the critical move readable. A genre preset does not authorize fabricating events.

## Meaningful graphics and captions

Counters, gauges, radar/ammo displays must either follow observed facts or be clearly stylized reactions. Do not animate ammo to zero because it looks dramatic when the game says otherwise. A fear gauge can be subjective comedy, but its orientation, labels and timed progression must be coherent at phone size. Prefer omission to misleading precision. Retain no graphics just to meet a density quota.

Correct Egyptian Arabic using audio evidence and reliable context. Do not present guessed words as exact quotations. Flag uncertain phrases in a review choice with replay context; select omission or an explicitly paraphrased title if still uncertain. Do not teach a guessed word to the persistent dialect dictionary. If wording changes token count, regenerate alignment rather than forcing new words into old timestamps. Verify Arabic shaping, direction, punctuation and mixed Latin gaming terms in the final render.

## Delivery checks

Check a short style/hook preview before full rendering, then check the actual finished export:

1. Inspect the first and last 10 seconds at playback speed. Review EVERY edit boundary with roughly 1–2 seconds on each side, including introduced source joins, intro/title joins, end cards and loops. Check sentence/reaction completeness and temporal clarity. Automated black/freeze/silence detection can flag candidates, not decide whether an intentional dark horror scene is a defect.
2. Review full-speed shake/zoom samples and all high-intensity effects for easing, jitter, crop safety, readability and repeated gimmicks. Check caption/effect entrance and exit frames. Fix unexpected jumps or truncations and replay the repaired region.
3. Listen for clipped words, pops, overlapping speech, abrupt music stops and game/voice balance. Loudness meters cannot prove any of these. When audio perception is unavailable, mark auditory review pending and give the user the exact review file/ranges; never say “sound checked” from a transcript or meters alone.
4. Probe duration, resolution, actual FPS, audio streams, sync and color tags. Verify caption timing and platform-safe placement at output size. Judge quality visually, not solely by a fixed bitrate fraction. A 60 fps source must not silently become 30 fps because a template defaults to it.
5. Preserve supported intentional color treatment. Investigate a color-check failure on the relevant region; record whether it is an intended generated background or unintended footage change. A tolerated exception needs concrete evidence, not “looks fine.” Keep automated check results and unresolved observations in a small QC report.
6. Make the exported video and editable Resolve timeline use the same EDL, cuts, transitions, timing and audio choices. Never hand off a hard-cut timeline as equivalent to a crossfaded final export. If a graphic must be prerendered, label it as such, include editable source assets where available, and state that limitation.

Deliver a versioned preview plus SRT/caption text, a concise QC result, and clear choices: accept / adjust motion / fix captions / revise cuts or ending. Do not repeatedly request permission for changes the user has just selected. Keep source media, prior exports and working files intact. This workflow sets expectations and checks; it cannot guarantee artistic quality without reviewing real footage.

Sources for tool/platform mechanics: [Anthropic interactive question guidance](https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/command-development/references/interactive-commands.md), [yt-dlp supported extractors](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md). Availability of a listed extractor does not guarantee every URL is accessible.
