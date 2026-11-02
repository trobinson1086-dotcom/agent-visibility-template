# Squish Man™ cartoon production — Report 1: footage inventory & five-book scene matching

Date: 2 November 2026 · Source folder: Google Drive "Squish Videos" (`1FE6RFzd40B3q-jF_isyc6rr2OGXwMWuR`)

Full per-clip table: [`clip-catalog.csv`](clip-catalog.csv). Clip codes run **C01–C91** in the order they were generated in Flow.

## What I actually opened

| Group | Files | Opened & reviewed? |
|---|---|---|
| Raw Flow clips (numeric names + `Unsorted_Clip_*`) | 145 files = **89 unique generations** + 56 identical copies | **Yes, all 89 unique**: every one downloaded, probed with FFprobe, 4 frames each on a contact sheet |
| `squish video.mp4` | 1 | Yes (C01) |
| `Squish_Man_Theme_Song_YouTube.mp4` | 1 | Yes (C02): 54.8 s, 1920×1080, static art of Squish Man + Pudy |
| Six `SquishMan_WebsiteCartoon_Scene01–06` files (31–40 MB) | 6 | **No**: over the Drive connector's 10 MB limit |
| `Squish_Man_Final_Website_Video*` (3 × 211.7 MB + 2 × 22.4 MB) | 5 | **No**: too large |
| `Final_TikTok_9x16*` (3 × 336 MB), `Squish_Man_9454_Vertical` (14.5 MB) | 4 | **No**: too large |
| `Squish_Man_Theme_Song_With_Logo` (10.6 MB) | 1 | **No**: just over the limit |
| `screen-2026…` recordings (4), `lv_0_…` CapCut export (351 MB) | 5 | **No**: too large |

**Total: 168 files (matches your count). I reviewed 147 of them (91 unique videos). The 21 large/named files are not reviewed yet.** See "Limitations" for how to unlock them.

### Technical facts about the raw footage
- **Every raw Flow clip is vertical 9:16 (720×1280), 24 fps, 8 s** (two are 10 s; one is 1280×2274). There is no 16:9 raw footage.
- All of them have Flow-generated audio (mean −16 to −37 dB, so levels vary a lot). The pipeline loudness-normalizes everything.
- Unique footage: about **12 minutes** in total across all books.
- Quality defects found in the frames:
  - **Flow multi-panel "grid" first frames** (about 2 s) in C14, C20–C24, C26, C39. These must always be trimmed.
  - **Video-player UI bars burned in** (screen captures) in C54 and C57.
  - **Burned-in subtitles** in C26.
  - **Hard mid-clip scene cuts** in C16 (at 4 s) and C33 (at 2 s).
  - **A stray creature** in C13 (small yellow chick near Squish Man).
  - **AI text misspellings** in the promo clips: C36 "HIDADEN", C38 "BIG DREAAM ADVENTURE" and "GRAN TORNEO … YOUR'Y PUFY". Do not use these.
- **C09 is not Squish Man footage.** It's a live-action construction site captioned "Darien, Connecticut". Exclude it, or tell me if it was filed here by mistake.

## 1. Which clips belong to each book

| Book | Clips (unique) | Coverage |
|---|---|---|
| **1: The Missing Puppy Parade** | C01, C03–C08, C10–C34, C40 (32) | Opening, parade, empty leash, paw-print tracking, Mrs. Whiskers, rose garden, walk home |
| **2: Big Dream Adventure** | C46–C91 (46) | Night window and wishing star, then the dream: flight with a star friend, rainbow road, golden path (bluebird and ladybug), crystal stairs, sky castle, wishing fountain, golden heart |
| **3: Magical Garden** | **none** | The garden in C75–C78 is Book 2's dream garden, not Book 3's ivy wall with the tiny door, Ruby and Pip |
| **4: Saves the Snow Day** | **none** | — |
| **5: Great Maple Hollow Derby** | **none** | — |
| Promo / book ads | C35–C39 | Usable for the trailer and end cards only after a spelling check (C36 and C38 fail) |
| Squish Squad / club | C41–C45 | Autumn reading event with kids; C41 ends on a "Continue the adventure, www.squishman.com" card |

Books 3–5 may be in the 21 unreviewed large files (for example the six website-cartoon scenes). I'll re-check once I can open them.

## 2. Missing scenes for Book 1 (against the Book 1 text)

| Spread | Beat | Footage |
|---|---|---|
| 1 | Cozy town intro | ✅ C01 / C40 (fountain, then cover) |
| 2 | Hero portrait of Squish Man | ⚠️ partial: close-ups in C16/C07, but C07 has a Pudy-like dog |
| 3 | Puppy Parade town square | ✅ C08 (animated book page 3), C06 |
| 4 | Practising his trot and bow in the mirror | ❌ missing |
| 5 | Best-friend puppy: "This is my FIRST parade!" | ⚠️ C03/C04 show a **golden** puppy (old "Peanut" look). The published Lost Puppy is brown-and-white with a blue collar (C33/C34 match that) |
| 6 | Parade bell DING DING DING, empty leash | ✅ leash in C16 / C19 · ❌ bell-tower shot missing |
| 7 | Dogs whisper, Squish steps forward bravely | ❌ missing |
| 8–9 | Sniffs the paw print, follows the trail | ✅ C12, C16 (from 4 s), C17, C18, C21, C22 |
| 10 | Mrs. Whiskers on the fence: "toward the roses" | ✅ C23 (trim the first 2 s), C24 |
| 11–12 | Squirrel distraction, shakes head, back to the trail | ❌ missing |
| 13 | Ivy-covered gate, frightened eyes peeking | ❌ missing |
| 14 | Puppy stuck between fence posts (chased a butterfly) | ❌ missing (C27 has a butterfly but no "stuck" moment) |
| 15–17 | Squish squeezes in, count of three, POP, tumble in the leaves | ❌ missing: **this is the climax** |
| 18 | "You found me" / "I wasn't going anywhere without my friend" | ✅ C33, C34 |
| 19 | Race back past Mrs. Whiskers, who winks | ⚠️ C28–C32: the cat walks *with* them and the puppy design is dark brown |
| 20–22 | Town cheers, THANK YOU SQUISH MAN signs, sunset parade | ❌ missing |
| 23–24 | Bedtime with the bow on its hook, dream bubble | ❌ missing |

**Bottom line for Book 1:** the usable story footage is about 2.5–3 minutes after trimming. The climax (rescue at the gate) and the ending (parade, bedtime) are not in the reviewed clips. **About 22 new 8-second Flow shots** are needed for a 6–8 minute episode; the shot list is below. I haven't invented or faked any of these.

### Proposed Flow shots to generate (Book 1), 16:9 if possible
1. Hero portrait: Squish Man bouncing in sunlight, crown and cape. 2. Mirror trot practice. 3–4. Best-friend puppy (approved brown-and-white Lost Puppy design, blue collar) bouncing: "my FIRST parade!" 5. Bell tower ringing, confetti. 6. Worried dogs whispering; Squish steps forward. 7–8. Squirrel zips by, then the comic freeze and head shake. 9. Ivy gate with eyes peeking. 10. Puppy wedged between fence posts. 11. Squish squeezing through the gap. 12. Count of three, wiggle together. 13. POP! Tumble in the leaves. 14. Race back; Mrs. Whiskers winks from her fence post. 15–16. Town cheers; puppies hold up THANK YOU SQUISH MAN signs (check the spelling). 17–18. Sunset parade, the two trotting together. 19. Bedtime, bow on the hook. 20. Dream bubble (paw prints, gate, puppy's happy face). 21–22. Spare coverage of Squish's face reacting (worried, then determined).

## 3. Duplicates and alternate takes
- **Identical duplicates (same Flow generation ID and byte-for-byte the same size): 56 files across 46 groups.** For example C16 has 4 copies and C14, C15, C17, C32, C74, C75, C78 and C88 have 3 each. Every group is in the `identical_copies_in_folder` column of the CSV. I downloaded one of each. They are safe to ignore; nothing was deleted.
- `Squish_Man_Final_Website_Video` ×3 (211.7 MB) and ×2 (22.4 MB), and `Final_TikTok_9x16` ×3 (336.3 MB), have identical names and sizes, so they are almost certainly copies (not opened).
- **Alternate takes (same prompt, different generation):** C03/C04/C05; C10/C11; C12/C17/C18; C28–C32; C01/C40; C48/C49; C50/C51; C52/C54–C65 (14 takes of the night-window scene); C66/C86/C87; C69/C70; C72/C73/C88/C91; C75/C89; C77/C78; C83/C84.

## 4. Footage suitable for the Book 1 pilot

**Best takes:** C01 (open), C08 (parade), C16 (leash, then tracking), C12 (paw-print clue), C17/C18/C21/C22 (tracking, trim the grids), C23 (Mrs. Whiskers, from 2 s), C24 (roses, from 2 s), C33 and C34 (reunion, from 2 s).

**Hold for review (continuity):**
- **C05, C07, C10, C11, C15, C25–C32** show a **dark-brown Pudy-like dog** in Book 1, and you said Pudy must not appear in Book 1. If that dog is meant to be the Lost Puppy, it clashes with the published brown-and-white design.
- **C03/C04** show the golden "Peanut" puppy, who the Master Blueprint says "does not return".
- **C13** has the stray creature.

## 5. Proposed Episode 1 timeline (about 7 min once the missing shots exist)

| Time | Segment | Source |
|---|---|---|
| 0:00–0:08 | Cold-open hook: empty leash, "Where's the puppy?" | C16 |
| 0:08–0:30 | Opening: logo, theme song, Maple Hollow, royal entrance, episode title | theme song, C01, logo |
| 0:30–1:20 | Maple Hollow and the Puppy Parade, the hero, mirror practice | C08, C06, NEW 1–2 |
| 1:20–2:00 | Best friend: "my FIRST parade!" | NEW 3–4 |
| 2:00–2:40 | Bell rings, puppy missing, whispers, Squish decides to help | NEW 5–6, C16 |
| 2:40–3:30 | **Interactive pause: "Can you spot the clue?"** Following the paw prints | C12, C16, C17, C18 |
| 3:30–4:00 | Mrs. Whiskers: "toward the roses" | C23, C24 |
| 4:00–4:30 | Squirrel distraction; **"What should Squish Man do next?"** | NEW 7–8 |
| 4:30–5:40 | Ivy gate, stuck puppy, squeeze, count of three, POP! | NEW 9–13 |
| 5:40–6:10 | "I wasn't going anywhere without my friend." | C33, C34 |
| 6:10–6:50 | Race back, cheers, THANK YOU signs, sunset parade | NEW 14–18 |
| 6:50–7:20 | Bedtime and the lesson: "You don't have to be big to do something big." | NEW 19–20 |
| 7:20–7:40 | End card: "Ask a grown-up to visit SquishMan.com!" and credits | logo, theme song |

## 6. Permissions, software and cloud limitations

1. **Large Drive files are blocked (21 files unreviewed).** The Drive connector refuses downloads over 10 MB, and this environment's network policy denied the direct-download host `drive.usercontent.google.com`. To fix it, either:
   - (a) allow that host in the environment's Network access settings (title bar → environment → Edit → Allowed domains) and set those 21 files to "Anyone with the link", or
   - (b) re-export them under 10 MB.
2. **Uploading video to Drive.** The Drive connector can create folders and documents but can't take a multi-MB video in one call. Until (1a) is in place, finished MP4s are delivered to you directly in the Claude app (they open in the iPad Files app and CapCut). Reports, captions and catalogs go to Drive.
3. **Dialogue transcription.** The speech-to-text model download is blocked by the network policy, so **I haven't verified what Flow's generated voices say** in each clip. The preview uses on-screen book text and keeps Flow's audio low. ElevenLabs is connected and can transcribe (uses your credits).
4. **Narration and character voices.** ElevenLabs is connected. Narration needs your approval of a voice (it uses credits and covers licensing under your plan). Nothing has been generated yet.
5. **Aspect ratio.** All footage is 9:16. 16:9 episodes currently use the vertical clip centred over a blurred fill of itself. Generating new shots in 16:9 in Flow would look much better on YouTube.
6. **Book interiors.** The published Book 1–5 PDFs are 18–54 MB (over the limit). I used the Book 1 final text, `Squish_Man_Book1(Final).pdf` (Aug), with Peanut → "the little puppy". I also used the published preview pages on squishman.com and the Master Blueprint. For Books 2–5 I need the full text (a docx or text version of each book is enough).
7. **CapCut.** CapCut for iPad has no importable project format, so delivery is numbered MP4 scenes, separate audio stems, SRT captions and an assembly guide, imported through the Files app.

## Continuity decisions (answered 2 Nov 2026)
- Pudy's collar is **pink**, and Pudy is **female**. Every existing Pudy clip (C47, C50–C65, C86, C90) has a blue collar, so those clips are off-model.
- The Book 1 Lost Puppy is the **brown-and-white design (C33/C34), approved**. C03–C05, C07, C10, C11, C15 and C25–C32 are off-model for Book 1.
- Still open: the Lost Puppy's name, and what to do with C09. See [`../continuity.md`](../continuity.md) and the Flow shot list in [`02-book1-flow-shot-list.md`](02-book1-flow-shot-list.md).
