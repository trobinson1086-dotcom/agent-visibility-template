# Episode 1 promo Shorts

Five 9:16 (1080×1920) YouTube Shorts cut from the original Episode 1 master
(`episode 1 edited.mp4`, Drive folder "Squish full screen 1"). Videos are not stored in git.

- `shorts.json`: the edit list. For each Short: source segments (episode seconds), framing
  keyframes (horizontal centre of the 9:16 window, as a share of the frame width), captions
  (episode times, as spoken), title and ending text.
- `render_shorts.py`: cuts and reframes each segment (eased pans, no bars or blur), adds Fredoka
  captions/title/ending, exports H.264 High + AAC with a −1 dBTP peak limiter.
  `python3 -I render_shorts.py <scratch> [1 2 3 4 5]` with `<scratch>/src/episode1.mp4` and
  `<scratch>/assets/Fredoka.ttf` (decoded from `src/fulfillment/poster-font.ts`).
- `qa_sheet.sh`: one-frame-per-second contact sheet for checking framing.
- `stt_out.py`: local Whisper (sherpa-onnx) transcript in 2 s windows, used to line captions up with speech.
- `episode1-promo-shorts-youtube-info.txt`: titles, descriptions, hashtags and original timestamps.

The original master is only read, never modified.

## Merch and holiday Shorts

Five merch Shorts and one holiday Short from the episode's merch section (7:29–8:40).
`merch_spec.py` builds `merch.json` (per-shot framing, captions, rotating product names);
render with `SHORTS_SPEC=<scratch>/scripts/merch.json SHORTS_OUT=<folder> python3 -I render_shorts.py <scratch>`.
On-screen product names list only products sold in the shop (`src/fulfillment/merch.ts`).

Subtitles (owner, 11 Nov 2026): smaller (60 px), one short line at a time, bottom edge at 80% of the height (over the legs, clear of faces and chests) above
YouTube's controls; every Short ends with a question-style call to action
("What happens next? Watch Episode 1 on YouTube!").
