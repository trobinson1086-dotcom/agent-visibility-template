#!/usr/bin/env python3
"""Write the YouTube title/description/hashtags/timestamps file for the Episode 1 merch + holiday Shorts."""
import json, subprocess, sys

S = sys.argv[1]
OUT = f"{S}/Squish_Man_Episode_1_Merch_Shorts"
j = json.load(open(f"{S}/scripts/merch.json"))
EP = "https://youtu.be/3G5FevbM0RI"
SHOP = "Shop at squishman.com (ask a grown-up!)"

def ts(x):
    m = int(x // 60)
    return f"{m}:{x - 60 * m:05.2f}"

META = {
 "1": ("Welcome to the Squish Squad Store! 🛍️ Squish Man Merch #Shorts",
       "Hey, Squish Squad! 👑 Step inside the Squish Squad Store with Squish Man and Pudy: colorful tees, cozy hoodies, caps, water bottles, puzzles and more Maple Hollow fun.",
       "#Shorts #SquishMan #SquishSquad #KidsMerch #KidsCartoon #MapleHollow #KidsFashion #FamilyFun"),
 "2": ("Squish Squad Tees & Hoodies! 👕 Which One Would You Pick? #Shorts",
       "Colorful shirts and cozy hoodies for every adventure! 💙💗 Squish Squad tees, hoodies, long sleeves and sweatshirts in kids', girls', toddler and grown-up sizes.",
       "#Shorts #SquishMan #SquishSquad #KidsTees #Hoodies #KidsFashion #KidsCartoon #MapleHollow"),
 "3": ("Water Bottles, Puzzles & More! 🧩 Squish Squad Gear #Shorts",
       "Ready for your next adventure? 🎒 Squish Squad water bottles, Maple Hollow puzzles, mugs, backpacks, tote bags, notebooks, stickers and posters.",
       "#Shorts #SquishMan #SquishSquad #KidsGifts #Puzzles #BackToSchool #KidsCartoon #MapleHollow"),
 "4": ("Shop with Squish Man & Pudy! 🐾 Join the Squish Squad #Shorts",
       "Squish Man and Pudy welcome you to the magical world of Squish Man! 🎉 Want your own Squish Man gear? Join the Squish Squad!",
       "#Shorts #SquishMan #Pudy #SquishSquad #KidsCartoon #KidsMerch #MapleHollow #FamilyFun"),
 "5": ("The Whole Squish Squad Collection! ✨ Which Is Your Favorite? #Shorts",
       "Tees, hoodies, sweatshirts, caps, beanies, water bottles, mugs, puzzles, backpacks, totes, blankets, pillows, socks, notebooks and more, all with Squish Man and Pudy! 🌈",
       "#Shorts #SquishMan #SquishSquad #KidsMerch #GiftIdeas #KidsCartoon #MapleHollow #FamilyFun"),
 "6": ("Holiday Merch Collection! 🎄 Make the Holidays Magical with Squish Man #Shorts",
       "Make the holidays magical with Squish Man! 🎅❄️ Holiday designs (Magical Christmas Wishes, Cookies for Santa, Santa's Little Helpers and Thankful Hearts) on kids' and girls' tees, long sleeves and sweatshirts, plus the Squish Squad Snow Globe Ornament.",
       "#Shorts #SquishMan #HolidayGifts #ChristmasGifts #KidsChristmas #SquishSquad #KidsCartoon #MapleHollow"),
}

L = ["SQUISH MAN — EPISODE 1 MERCH & HOLIDAY SHORTS",
     "From The Amazing Adventures of Squish Man™ · Squish Man & Pudy's Big Parade Adventure — Episode 1",
     f"Full episode: {EP}",
     "Source: original 13:00 master \"episode 1 edited.mp4\" (Drive folder \"Squish full screen 1\"). The original was only read, never altered.",
     "All six: 1080×1920 (9:16), H.264 High, 30 fps, AAC stereo 48 kHz, 15–30 s. Only the episode's own voices, music and sound effects.",
     "On-screen product names list only products sold in the Squish Squad Shop. (The episode's narration mentions lunch boxes and its store scenes show plush toys; neither is sold today, so no on-screen text or description claims them.)",
     "Footage note: the episode's merch section has about 40 seconds of unique store footage, so some shots appear in more than one Short.",
     "Upload tip: set each Short as \"Made for kids\" in YouTube Studio and use the \"Related video\" field to link the full episode.", ""]
for k in sorted(j):
    sp = j[k]; t, d, h = META[k]
    f = f"{OUT}/{sp['file']}"
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f],
                               capture_output=True, text=True).stdout)
    L += ["=" * 72, f"SHORT {k} — {sp['title']}", f"File: {sp['file']}  ({dur:.1f} s)", "",
          f"YOUTUBE TITLE:\n{t}", "",
          f"DESCRIPTION:\n{d}\n\n🛒 {SHOP}\n▶ Watch the full cartoon, Squish Man & Pudy's Big Parade Adventure — Episode 1: {EP}\n\n{h}", "",
          f"HASHTAGS:\n{h}", "", "ORIGINAL TIMESTAMPS USED (in order):"]
    o = 0.0
    for i, (a, b, _) in enumerate(sp["segments"], 1):
        L.append(f"  {i}. {ts(a)} – {ts(b)}  ({b - a:.1f} s)  → Short {ts(o)} – {ts(o + b - a)}"); o += b - a
    L.append(f"\nON-SCREEN TEXT: title \"{sp['title']}\"; ending \"{sp['end']}\"")
    if sp.get("chips"):
        L.append("PRODUCT NAMES SHOWN: " + " · ".join(sp["chips"]["items"]))
    L.append("CAPTIONS (dialogue as spoken):")
    L += [f"  • {c[2]}" for c in sp["captions"]]
    L.append("")
open(f"{OUT}/Squish_Man_Episode_1_Merch_Shorts_YouTube_Info.txt", "w").write("\n".join(L))
print("ok")
