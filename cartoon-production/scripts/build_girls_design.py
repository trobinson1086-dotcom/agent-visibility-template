#!/usr/bin/env python3
"""Shop photos for one girls' design on the girls' tee, long sleeve and sweatshirt, made the same way as
the first seven designs (3-5 Nov 2026): the younger girl and the beach girl wear the design, centred and
small on the left chest ("pocket"), in every shirt colour the shop sells.

Inputs are the prepared model photos and shirt masks in the scratch folder (girl/source.jpg,
teen/source.png, beige/*, ls/*, kid2/*). Outputs go to public/assets/merch/ with the shop's names.

Usage: python3 -I build_girls_design.py <scratch> <print file name, e.g. girls-thankful-hearts> <suffix, e.g. thankful> [outdir]
"""
import os, subprocess, sys
import cv2, numpy as np

S, NAME, SUF = sys.argv[1], sys.argv[2], sys.argv[3]
M = sys.argv[4] if len(sys.argv) > 4 else "public/assets/merch/"
HERE = os.path.dirname(os.path.abspath(__file__))
ART = f"public/assets/merch/print/girls/{NAME}.png"
W = f"{S}/girlsbuild/{SUF}"; os.makedirs(W, exist_ok=True)

def py(script, *args, env=None):
    subprocess.run(["python3", "-I", f"{HERE}/{script}", *args], check=True, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def webp(src, dst, vf=None):
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", src, *(["-vf", vf] if vf else []), "-c:v", "libwebp", "-quality", "84", dst], check=True)
def sq(im, crop):
    y0, y1, x0, x1 = crop
    return cv2.resize(im[y0:y1, x0:x1], (700, 700), interpolation=cv2.INTER_AREA)
def card(left, right, base):
    p = f"{W}/{os.path.basename(base)}.png"; cv2.imwrite(p, np.hstack([left, right]))
    webp(p, base + ".webp", "scale=1400:700"); webp(p, base + "-720.webp", "scale=720:360")
    return p
def art_panel(size=700, fit=600):
    a = cv2.imread(ART); h, w = a.shape[:2]; s = fit / max(h, w)
    a = cv2.resize(a, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    out = np.full((size, size, 3), 255, np.uint8); y = (size - a.shape[0]) // 2; x = (size - a.shape[1]) // 2
    out[y:y + a.shape[0], x:x + a.shape[1]] = a
    return out
made = []

# ---- Girls' tee, white: younger girl (shirt_swap) + beach girl (shirt_swap_beach) ----
for ps, kargs, targs in (("", ("300", "615"), ("300",)), ("-pocket", ("110", "640", "750"), ("125", "690", "690"))):
    k = f"{W}/kid-white{ps}"; t = f"{W}/teen-white{ps}.png"
    py("shirt_swap.py", f"{S}/girl/source.jpg", ART, k, *kargs)
    py("shirt_swap_beach.py", f"{S}/teen/source.png", ART, t, *targs)
    kk, tt = cv2.imread(k + ".png"), cv2.imread(t)
    made.append(card(sq(kk, (40, 1239, 0, 1199)), sq(tt, (20, 1099, 0, 1079)), f"{M}shop-girlstee-white-{SUF}{ps}"))
    webp(t, f"{M}shop-girlstee-beach-{SUF}{ps}.webp", "crop=1079:1612:0:0,scale=900:-2")
# artwork close-up slide (1400x700 board, art up to 640 px)
a = cv2.imread(ART); h, w = a.shape[:2]; s = 640 / max(h, w); a = cv2.resize(a, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
board = np.full((700, 1400, 3), 255, np.uint8); y = (700 - a.shape[0]) // 2; x = (1400 - a.shape[1]) // 2; board[y:y + a.shape[0], x:x + a.shape[1]] = a
bp = f"{W}/art.png"; cv2.imwrite(bp, board)
for ps in ("", "-pocket"):
    webp(bp, f"{M}shop-girlstee-art-{SUF}{ps}.webp"); webp(bp, f"{M}shop-girlstee-art-{SUF}{ps}-720.webp", "scale=720:360")

# ---- Girls' tee, beige / light pink / light blue: both girls recoloured (shirt_beige) ----
PL = {"": (("280", "646", "630"), ("280", "535", "745")), "-pocket": (("110", "750", "640"), ("125", "690", "690"))}
for col, hx in {"beige": "E5D9C9", "light-pink": "FFCCCF", "light-blue": "D4EBFF"}.items():
    env = dict(os.environ, SHIRT_COLOR=hx)
    for ps, (kp, tp) in PL.items():
        k, t = f"{W}/k-{col}{ps}.png", f"{W}/t-{col}{ps}.png"
        py("shirt_beige.py", f"{S}/beige/kid_clean.png", ART, k, "110,400,960,900", *kp, f"{S}/beige/kid_mask.png", env=env)
        py("shirt_beige.py", f"{S}/beige/teen_clean.png", ART, t, "60,440,980,1000", *tp, f"{S}/beige/teen_mask.png", env=env)
        made.append(card(sq(cv2.imread(k), (40, 1239, 0, 1199)), sq(cv2.imread(t), (20, 1099, 0, 1079)), f"{M}shop-girlstee-{col}-{SUF}{ps}"))

# ---- Girls' long sleeve and sweatshirt: younger girl + (beach girl | artwork) ----
KPL = {"": ("270", "570", "570"), "-pocket": ("110", "700", "560")}
LSPL = {"": ("270", "515", "690"), "-pocket": ("115", "650", "650")}
for job, prod, cols, box in (("ls", "girlslongsleeve", {"white": "FFFFFF", "athletic-heather": "B5B5B7"}, "40,345,940,860"),
                             ("sweat", "girlssweatshirt", {"white": "FFFFFF", "sport-grey": "CACACD"}, "30,345,950,860")):
    poly = open(f"{S}/kid2/{job}_poly.txt").read().strip()
    for col, hx in cols.items():
        env = dict(os.environ, SHIRT_COLOR=hx)
        for ps, pl in KPL.items():
            o = f"{W}/{job}-{col}{ps}.png"
            py("shirt_beige.py", f"{S}/kid2/{job}.png", ART, o, box, *pl, f"{S}/kid2/{job}_mask.png", "0,1155", poly, env=env)
            left = sq(cv2.imread(o), (40, 1195, 0, 1155))
            if job == "ls":
                b = f"{W}/lsbeach-{col}{ps}.png"
                py("shirt_beige.py", f"{S}/ls/clean.png", ART, b, "40,420,950,960", *LSPL[ps], f"{S}/ls/mask.png", env=env)
                right = sq(cv2.imread(b), (30, 1054, 0, 1024))
                webp(b, f"{M}shop-{prod}-full-{col}-{SUF}{ps}.webp", "scale=900:-2")
            else:
                right = art_panel()
                webp(o, f"{M}shop-{prod}-full-{col}-{SUF}{ps}.webp", "scale=900:-2")
            made.append(card(left, right, f"{M}shop-{prod}-{col}-{SUF}{ps}"))

sheet = [cv2.resize(cv2.imread(p), (700, 350)) for p in made]
sheet += [np.full((350, 700, 3), 255, np.uint8)] * (len(sheet) % 2)
cv2.imwrite(f"{W}/sheet.jpg", np.vstack([np.hstack(sheet[i:i + 2]) for i in range(0, len(sheet), 2)]))
print(len(made), "cards ->", f"{W}/sheet.jpg")
