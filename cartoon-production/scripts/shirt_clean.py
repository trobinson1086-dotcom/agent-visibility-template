#!/usr/bin/env python3
"""Remove an existing print from a white shirt in a model photo (generic version of the
beach-girl cleaner). Hair that falls over the print is kept when it connects to hair
outside the print box; everything else in the box that is not plain fabric is rebuilt
from the surrounding shirt.

Usage: python3 -I shirt_clean.py <photo> <out_clean_png> <print box x0,y0,x1,y1>
                                 <fabric sample box x0,y0,x1,y1> <hair seed x-max>
"""
import sys
import numpy as np, cv2

photo, out = sys.argv[1], sys.argv[2]
px0, py0, px1, py1 = map(int, sys.argv[3].split(","))
fx0, fy0, fx1, fy1 = map(int, sys.argv[4].split(","))
hair_x = int(sys.argv[5])
im = cv2.imread(photo).astype(np.float32) / 255
H, W, _ = im.shape
hsv = cv2.cvtColor((im * 255).astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float32)
hue, sat, val = hsv[..., 0], hsv[..., 1] / 255, hsv[..., 2] / 255
yy, xx = np.mgrid[0:H, 0:W]
rect = (xx >= px0) & (xx <= px1) & (yy >= py0) & (yy <= py1)

hairish = ((hue >= 6) & (hue <= 30) & (sat > 0.07) & (val > 0.25) & (val < 0.985) & (xx < px0 + 140)).astype(np.uint8)
hairish = cv2.morphologyEx(hairish, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
n, lab = cv2.connectedComponents(hairish, connectivity=4)
seed = (hairish > 0) & ((xx < hair_x) | (yy < py0 - 5)) & (yy > py0 - 300)
keep = np.unique(lab[seed]); keep = keep[keep > 0]
hair = np.isin(lab, keep)

ink = rect & ~hair & ((sat > 0.13) | (val < 0.55))
mask = cv2.dilate(ink.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))) > 0
mask &= rect & ~hair
grown = cv2.dilate(mask.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))) > 0

shirt = (sat < 0.10) & (val > 0.68) & (xx > fx0) & (xx < fx1) & (yy > fy0) & (yy < fy1) & ~grown
w = shirt.astype(np.float32)
def nconv(sig):
    d = cv2.GaussianBlur(w, (0, 0), sig)
    return np.stack([cv2.GaussianBlur(im[..., c] * w, (0, 0), sig) for c in range(3)], -1) / (d[..., None] + 1e-6), d
fine, dfine = nconv(40)
coarse, _ = nconv(140)
trust = np.clip(dfine / 0.3, 0, 1)[..., None]
est = fine * trust + coarse * (1 - trust)
grain = np.random.default_rng(3).normal(0, 0.006, (H, W, 1)).astype(np.float32)
fabric = (sat < 0.16) & (val > 0.6)
grown &= ~hair & (mask | fabric) & (xx >= px0 - 30) & (xx <= px1 + 30) & (yy >= py0 - 30) & (yy <= py1 + 30)
fm = np.maximum(mask.astype(np.float32), cv2.GaussianBlur(grown.astype(np.float32), (0, 0), 7))[..., None]
clean = im * (1 - fm) + np.clip(est + grain, 0, 1) * fm
cv2.imwrite(out, (np.clip(clean, 0, 1) * 255).astype(np.uint8))
