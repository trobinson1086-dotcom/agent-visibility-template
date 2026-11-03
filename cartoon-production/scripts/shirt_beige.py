#!/usr/bin/env python3
"""Recolor (env SHIRT_COLOR=RRGGBB, default beige) a model's (already cleaned) white T-shirt beige, keeping folds and shading,
then put a design on it.

Shirt mask: GrabCut seeded with a box around the shirt, then limited to near-white,
low-saturation pixels (so skin, hair, shorts and background stay untouched).

Usage: python3 -I shirt_beige.py <clean_photo> <design_png> <out_png> <box x,y,w,h>
                                  <design_width> <design_cx> <design_top> [mask_png] [xlo,xhi] [exclude polygon "x,y;x,y;..."]
"""
import sys
import numpy as np, cv2

src, design, out = sys.argv[1], sys.argv[2], sys.argv[3]
bx, by, bw, bh = map(int, sys.argv[4].split(","))
dw, dcx, dtop = int(sys.argv[5]), int(sys.argv[6]), int(sys.argv[7])
mask_cache = sys.argv[8] if len(sys.argv) > 8 else None
import os
_hex = os.environ.get("SHIRT_COLOR", "DEC4A6")  # shirt colour as RGB hex; default soft natural/beige
BEIGE = np.array([int(_hex[4:6], 16), int(_hex[2:4], 16), int(_hex[0:2], 16)], np.float32) / 255  # BGR

im8 = cv2.imread(src)
im = im8.astype(np.float32) / 255
H, W = im.shape[:2]

shirt = None
if mask_cache:
    m = cv2.imread(mask_cache, cv2.IMREAD_GRAYSCALE)
    shirt = None if m is None else m > 127
if shirt is None:
    gc = np.zeros((H, W), np.uint8)
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(im8, gc, (bx, by, bw, bh), bgd, fgd, 6, cv2.GC_INIT_WITH_RECT)
    fg = (gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)
    hsv = cv2.cvtColor(im8, cv2.COLOR_BGR2HSV).astype(np.float32)
    whiteish = (hsv[..., 1] / 255 < 0.16) & (hsv[..., 2] / 255 > 0.5)
    xx_ok = np.ones((H, W), bool)
    if len(sys.argv) > 9:  # optional x range of the shirt, e.g. "195,1060", to keep a white wall out
        lo, hi = map(int, sys.argv[9].split(","))
        xx_ok[:, :lo] = False; xx_ok[:, hi:] = False
    if len(sys.argv) > 10:  # optional polygon to exclude (e.g. wall behind a slanted shoulder)
        poly = np.array([list(map(int, p.split(","))) for p in sys.argv[10].split(";")], np.int32)
        block = np.zeros((H, W), np.uint8); cv2.fillPoly(block, [poly], 1); xx_ok &= block == 0
    shirt = fg & whiteish & xx_ok
    shirt = cv2.morphologyEx(shirt.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    shirt = cv2.morphologyEx(shirt, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)) > 0
    # fill small enclosed white holes (bright fabric GrabCut left out)
    inv = (~shirt).astype(np.uint8)
    hn, hlab, hst, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    for i in range(1, hn):
        x, y, w, h, a = hst[i]
        if a < 6000 and x > 0 and y > 0 and x + w < W and y + h < H:
            hole = hlab == i
            if a < 2500 or whiteish[hole].mean() > 0.6:
                shirt |= hole
    shirt &= xx_ok
    # keep the biggest piece (the shirt), drop stray white bits
    n, lab, stats, _ = cv2.connectedComponentsWithStats(shirt.astype(np.uint8))
    if n > 1:
        big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        shirt = lab == big
    if mask_cache:
        cv2.imwrite(mask_cache, shirt.astype(np.uint8) * 255)

lum = im.mean(axis=2)
ref = np.percentile(lum[shirt], 92)
shade = np.clip(lum / ref, 0, 1.08)[..., None]
beige = np.clip(BEIGE * shade, 0, 1)
soft = cv2.GaussianBlur(shirt.astype(np.float32), (0, 0), 1.2)[..., None]
out_im = im * (1 - soft) + beige * soft

art = cv2.imread(design).astype(np.float32) / 255
art = cv2.resize(art, (dw, int(art.shape[0] * dw / art.shape[1])), interpolation=cv2.INTER_AREA)
ah, aw = art.shape[:2]
x0, y0 = dcx - aw // 2, dtop
roi_shade = shade[y0:y0 + ah, x0:x0 + aw]
tone = np.clip(roi_shade / max(float(roi_shade.mean()), 0.5), 0.75, 1.08)
out_im[y0:y0 + ah, x0:x0 + aw] = cv2.GaussianBlur(np.clip(art * tone, 0, 1), (0, 0), 0.6)
cv2.imwrite(out, (np.clip(out_im, 0, 1) * 255).astype(np.uint8))
