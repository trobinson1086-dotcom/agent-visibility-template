#!/usr/bin/env python3
"""Put a square girl design on the beach-girl photo (owner upload, 3 Nov 2026).

Her shirt already has a large print (x 300-810, y 595-1195). It is replaced with plain
fabric rebuilt from the surrounding white shirt (keeping the hair that falls over the left
edge), then the new design is multiplied onto the fabric, chest-sized and centered.

Usage: python3 -I shirt_swap_beach.py <photo> <design_png> <out_png> [width_px]
"""
import sys
import numpy as np, cv2

photo, design, out = sys.argv[1], sys.argv[2], sys.argv[3]
WIDTH = int(sys.argv[4]) if len(sys.argv) > 4 else 360
im = cv2.imread(photo).astype(np.float32) / 255
H, W, _ = im.shape
hsv = cv2.cvtColor((im * 255).astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float32)
hue, sat, val = hsv[..., 0], hsv[..., 1] / 255, hsv[..., 2] / 255
yy, xx = np.mgrid[0:H, 0:W]

rect = (xx >= 285) & (xx <= 825) & (yy >= 580) & (yy <= 1205)
# hair: hair-coloured pixels connected to the hair outside the print box
hairish = ((hue >= 8) & (hue <= 28) & (sat > 0.18) & (sat < 0.8) & (val > 0.3)).astype(np.uint8)
n, lab = cv2.connectedComponents(hairish)
outside_ids = np.unique(lab[(~rect) & (hairish > 0) & (xx < 300) & (yy > 500)])
hair = np.isin(lab, outside_ids[outside_ids > 0]) & (xx < 330)
# old print: anything not plain white fabric inside the box, grown to cover anti-aliasing
ink = rect & ~hair & ((sat > 0.13) | (val < 0.55))
mask = cv2.dilate(ink.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))) > 0
mask &= rect & ~hair

shirt = (sat < 0.10) & (val > 0.68) & (yy > 470) & (yy < 1420) & (xx > 140) & (xx < 940) & ~mask
w = shirt.astype(np.float32)
def nconv(sig):
    d = cv2.GaussianBlur(w, (0, 0), sig)
    return np.stack([cv2.GaussianBlur(im[..., c] * w, (0, 0), sig) for c in range(3)], -1) / (d[..., None] + 1e-6), d
fine, dfine = nconv(40)
coarse, _ = nconv(140)
trust = np.clip(dfine / 0.3, 0, 1)[..., None]
est = fine * trust + coarse * (1 - trust)
grain = np.random.default_rng(3).normal(0, 0.006, (H, W, 1)).astype(np.float32)
fm = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 3)[..., None]
clean = im * (1 - fm) + np.clip(est + grain, 0, 1) * fm

art = cv2.imread(design).astype(np.float32) / 255
art = cv2.resize(art, (WIDTH, int(art.shape[0] * WIDTH / art.shape[1])), interpolation=cv2.INTER_AREA)
ah, aw = art.shape[:2]
x0, y0 = 555 - aw // 2, 660
roi = clean[y0:y0 + ah, x0:x0 + aw]
tone = roi / np.clip(cv2.GaussianBlur(roi, (0, 0), 40).mean(axis=(0, 1)), 0.5, 1)
printed = cv2.GaussianBlur(np.clip(art * np.clip(tone, 0.6, 1.08), 0, 1), (0, 0), 0.6)
clean[y0:y0 + ah, x0:x0 + aw] = printed
cv2.imwrite(out, (np.clip(clean, 0, 1) * 255).astype(np.uint8))
