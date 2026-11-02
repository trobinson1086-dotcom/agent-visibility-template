# Squish Man™ YouTube cartoon production

This folder holds the production pipeline and reports for *The Amazing Adventures of Squish Man™*
cartoon series. It is **not** part of the website build: nothing here is served by the Worker.
Videos are not stored in git; they are delivered through the Claude app and Google Drive.

- `reports/01-inventory-and-scene-matching.md`: footage inventory, five-book scene matching, missing
  scenes, duplicates, pilot timeline and limitations.
- `continuity.md`: owner-approved character rules (pink collar, female Pudy, approved Lost Puppy).
- `reports/02-book1-flow-shot-list.md`: ready-to-paste Flow prompts for the 22 missing Book 1 shots.
- `reports/clip-catalog.csv`: every unique Flow clip (C01–C91) with its book, contents, flags,
  Drive file name and ID, and identical copies.
- `scripts/decode.sh`: turns Drive-connector downloads into `raw/<driveId>.mp4`.
- `scripts/render_preview.py`: FFmpeg render of the Book 1 approval preview (1920×1080). It puts the
  9:16 clip over a blurred fill, adds Fredoka book-text captions and interactive pauses, uses
  loudness-normalized audio and the theme song on the open and end cards, and writes an SRT.

Original Flow videos in Drive are never modified, moved or deleted.
