import json, sys
# framing per shot: (shot_start, shot_end, [(fraction_of_shot 0..1, cx), ...])
SH = {
 "store":   (449.6, 453.9, [(0, .45), (1, .47)]),
 "counter": (453.9, 457.6, [(0, .38), (.45, .38), (.85, .66), (1, .66)]),
 "rack":    (457.6, 459.6, [(0, .24), (1, .62)]),
 "girls":   (459.6, 461.533, [(0, .27), (1, .68)]),
 "dogs":    (461.533, 463.9, [(0, .38), (.5, .38), (1, .70)]),
 "hoodie":  (463.9, 465.6, [(0, .28), (1, .32)]),
 "reach":   (465.6, 467.533, [(0, .40), (1, .55)]),
 "bottles": (467.533, 469.467, [(0, .40), (1, .55)]),
 "puzzle":  (469.467, 470.8, [(0, .40), (1, .62)]),
 "hoodie2": (470.8, 472.6, [(0, .28), (1, .32)]),
 "kids":    (472.6, 476.033, [(0, .30), (1, .60)]),
 "rainbow": (476.033, 478.8, [(0, .52), (1, .52)]),
 "wave":    (478.8, 486.7, [(0, .44), (.5, .46), (1, .46)]),
 "magic":   (486.7, 489.467, [(0, .30), (1, .55)]),
 "puzzleB": (489.467, 490.8, [(0, .40), (1, .62)]),
 "hoodieB": (490.8, 492.6, [(0, .28), (1, .32)]),
 "kidsB":   (492.6, 496.033, [(0, .30), (1, .60)]),
 "rainbowB":(496.033, 498.8, [(0, .52), (1, .52)]),
 "waveB":   (498.8, 506.8, [(0, .44), (.5, .46), (1, .46)]),
 "magicB":  (506.8, 509.033, [(0, .30), (1, .55)]),
 "holiday": (509.033, 515.0, [(0, .22), (.45, .40), (1, .42)]),
 "title":   (515.0, 517.033, [(0, .21), (1, .21)]),
 "holiday2":(517.033, 520.03, [(0, .35), (1, .76)]),
}
ORDER = sorted(SH.values())
def seg(a, b):
    """Framing keyframes for source range a..b, from every shot it crosses (holds at cuts)."""
    k = []
    for s0, s1, kf in ORDER:
        if s1 <= a or s0 >= b: continue
        for f, c in kf:
            t = s0 + f * (s1 - s0)
            t = min(max(t, s0 + 0.001), s1 - 0.001)
            if a <= t <= b: k.append([round(t, 3), c])
        # make sure the crop is defined right at the segment edges inside this shot
        if s0 < a < s1: k.insert(len(k) - len([1 for f, c in kf if a <= s0 + f*(s1-s0) <= b]), [a, kf[0][1]])
    k = sorted({t: c for t, c in k}.items())
    return [a, b, [[t, c] for t, c in k]]
CAP = [  # episode times, as spoken (lunch boxes are said in the episode; on-screen product text never claims them)
 [449.9, 451.1, "Hey, Squish Squad!"], [451.2, 454.0, "Welcome to the magical world of Squish Man!"],
 [459.4, 462.0, "Colorful shirts, cozy hoodies,"], [462.0, 465.0, "and awesome Squish Squad gear for every adventure!"],
 [465.4, 469.0, "Lunch boxes, water bottles, puzzles, and more!"],
 [470.9, 474.4, "Ask your grown-up to shop at SquishMan.com!"],
 [476.3, 478.4, "Join the Squish Squad!"], [479.2, 481.0, "Want your own Squish Man gear?"],
 [481.3, 486.2, "Ask your grown-up to visit SquishMan.com and shop the Squish Squad Collection!"],
 [490.9, 494.4, "Ask your grown-up to shop at SquishMan.com!"],
 [496.3, 498.4, "Join the Squish Squad!"], [499.2, 501.0, "Want your own Squish Man gear?"],
 [501.3, 506.2, "Ask your grown-up to visit SquishMan.com and shop the Squish Squad Collection!"],
 [510.3, 513.2, "Make the holidays magical with Squish Man!"], [513.3, 516.0, "Shop festive favorites at SquishMan.com!"],
]
def caps(segs):
    return [c for c in CAP if any(a - 0.05 <= c[0] and c[1] <= b + 0.3 for a, b, _ in segs)]
def clip(segs):
    out = []
    for c in caps(segs):
        for a, b, _ in segs:
            if a - 0.05 <= c[0] <= b: out.append([c[0], min(c[1], b - 0.05), c[2]])
    return out
def short(file, title, end, segs, chips=None, **kw):
    segs = [seg(a, b) for a, b in segs]
    d = {"file": file, "title": title, "end": end, "segments": segs, "captions": clip(segs)}
    if chips: d["chips"] = chips
    d.update(kw); return d
SPEC = {
 "1": short("Merch_1_Squish_Squad_Store.mp4", "WELCOME TO THE SQUISH SQUAD STORE!", "Ready to join the Squish Squad? Shop at SquishMan.com!",
            [(449.6, 474.7)], {"start": 3.6, "each": 1.9, "items": ["T-Shirts & Hoodies", "Kids' & Girls' Styles", "Caps & Beanies", "Water Bottles & Mugs", "Puzzles & Backpacks", "Blankets & Pillows", "...and more!"]}, title_end=3.4),
 "2": short("Merch_2_Tees_and_Hoodies.mp4", "SQUISH SQUAD TEES & HOODIES!", "Which tee would you pick? Shop at SquishMan.com!",
            [(457.6, 465.0), (486.7, 497.9), (506.8, 508.2)], {"start": 3.5, "each": 1.6, "items": ["T-Shirts", "Hoodies", "Long Sleeves", "Sweatshirts", "Kids' & Toddler Tees", "Girls' Styles", "Baby One-Piece"]}),
 "3": short("Merch_3_Bottles_Puzzles_and_More.mp4", "WATER BOTTLES, PUZZLES & MORE!", "Ready for your next adventure? Shop at SquishMan.com!",
            [(454.0, 457.5), (465.2, 478.6)], {"start": 3.5, "each": 1.6, "items": ["Water Bottles", "Maple Hollow Puzzles", "Mugs", "Backpacks", "Tote Bags", "Notebooks", "Stickers & Posters"]}),
 "4": short("Merch_4_Shop_with_Squish_Man_and_Pudy.mp4", "SHOP WITH SQUISH MAN & PUDY!", "Want your own Squish Man gear? Ask a grown-up to visit SquishMan.com!",
            [(449.6, 457.5), (476.033, 486.6)], title_end=3.4),
 "5": short("Merch_5_The_Whole_Collection.mp4", "THE WHOLE SQUISH SQUAD COLLECTION!", "Which one is your favorite? Shop at SquishMan.com!",
            [(486.7, 506.6)], {"start": 3.3, "each": 1.05, "items": ["T-Shirts", "Hoodies", "Sweatshirts", "Long Sleeves", "Kids' Styles", "Girls' Styles", "Caps & Beanies", "Water Bottles", "Mugs", "Puzzles", "Backpacks", "Tote Bags", "Blankets", "Pillows", "Socks", "Notebooks"]}, title_end=3.2),
 "6": short("Holiday_Merch_Collection.mp4", "HOLIDAY MERCH COLLECTION!", "Ready for the holidays? Shop at SquishMan.com!",
            [(509.033, 516.2), (498.8, 506.6), (517.033, 520.0)], {"start": 3.4, "each": 1.7, "items": ["Magical Christmas Wishes", "Cookies for Santa", "Santa's Little Helpers", "Thankful Hearts", "Kids' & Girls' Tees", "Long Sleeves & Sweatshirts", "Snow Globe Ornament"]}),
}
json.dump(SPEC, open(sys.argv[1], "w"), indent=1)
for k, v in SPEC.items():
    print(k, v["file"], round(sum(b - a for a, b, _ in v["segments"]), 2), len(v["captions"]), "caps")
