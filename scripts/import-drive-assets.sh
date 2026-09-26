#!/usr/bin/env bash
# Copy the images + video from the "Squish live website" Google Drive folder
# into public/assets/ with the paths the site expects.
#
# Usage:
#   1. In Google Drive, right-click "Squish live website" → Download, unzip.
#   2. ./scripts/import-drive-assets.sh ~/Downloads/"Squish live website"
#
# Drive flattened the site's folders, so the Look Inside preview pages
# (page-01.jpg … page-07.jpg, one set per book) can't be sorted automatically.
# The script lists them; move each book's pages into
# public/assets/previews/book1 … book5 by hand (Book 1 uses page-03 … page-07,
# Books 2–5 use page-01 … page-05).
set -euo pipefail

src="${1:?usage: $0 <path to unzipped 'Squish live website' folder>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
assets="$root/public/assets"
mkdir -p "$assets/covers/drive_master" "$assets/media" \
	"$assets/previews/book1" "$assets/previews/book2" "$assets/previews/book3" \
	"$assets/previews/book4" "$assets/previews/book5"

copy() { cp -v "$1" "$2"; }

shopt -s nullglob nocaseglob
for f in "$src"/*; do
	name="$(basename "$f")"
	case "$name" in
		squishman-logo.png) copy "$f" "$assets/squishman-logo.png" ;;
		*.mp4) copy "$f" "$assets/media/$name" ;;
		"Squish Man "*.png | "Squish Man "*.jpg) copy "$f" "$assets/covers/drive_master/$name" ;;
		[0-9]*.png | [0-9]*.jpg) copy "$f" "$assets/covers/$name" ;;
		page-*.jpg) echo "PREVIEW (sort by hand into public/assets/previews/bookN/): $name" ;;
		*.html | *.css | *.js | *.xml | *.txt) ;; # already in public/
		*) echo "skipped: $name" ;;
	esac
done

# Every cover app.js references must exist, or the storefront shows broken images.
missing=0
while IFS= read -r cover; do
	[ -f "$assets/covers/$cover" ] || { echo "MISSING cover: assets/covers/$cover"; missing=1; }
done < <(grep -o "\['[^']*\.\(png\|jpg\)'" "$root/public/app.js" | sed "s/^\['//; s/'$//")
[ -f "$assets/squishman-logo.png" ] || { echo "MISSING: assets/squishman-logo.png"; missing=1; }
[ -f "$assets/media/Squish_Man_Final_Website_Video.mp4" ] || { echo "MISSING: assets/media/Squish_Man_Final_Website_Video.mp4"; missing=1; }
[ "$missing" -eq 0 ] && echo "All covers, logo and video are in place."
