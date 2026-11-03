#!/usr/bin/env python3
"""Replace the print on a model's white T-shirt with the Squish Man & Pudy banner.

1. Find the old print (coloured or dark pixels inside the chest box, skipping the hand).
2. Rebuild plain fabric there from the surrounding white shirt (normalized blur keeps the shading).
3. Multiply the banner onto the fabric so it takes on the folds and lighting, then soften slightly.

Usage: python3 -I shirt_swap.py <photo> <art_png> <out_prefix> [width_px]
(a mug-wrap file uses its left half; other art is placed whole, e.g. square scene designs)
"""
import sys
import numpy as np, cv2

photo, banner_png, out = sys.argv[1], sys.argv[2], sys.argv[3]
TARGET_W = int(sys.argv[4]) if len(sys.argv) > 4 else 420
im = cv2.imread(photo).astype(np.float32) / 255  # BGR
H, W, _ = im.shape
hsv = cv2.cvtColor((im * 255).astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float32)
sat, val = hsv[..., 1] / 255, hsv[..., 2] / 255
yy, xx = np.mgrid[0:H, 0:W]

# 1. old print mask
region = (xx >= 410) & (xx <= 885) & (yy >= 540) & (yy <= 1185)
hue = hsv[..., 0]
skin = (hue >= 4) & (hue <= 25) & (sat > 0.22) & (sat < 0.75) & (val > 0.40)
hand = cv2.dilate((skin & (xx < 560) & (yy > 900)).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
ink = region & ~hand & ((sat > 0.10) | (val < 0.80))
mask = cv2.dilate(ink.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31))) > 0
mask &= region & ~hand

# 2. fabric estimate from clean shirt pixels
shirt = (sat < 0.08) & (val > 0.72) & (yy > 430) & (yy < 1180) & (xx > 200) & (xx < 1000) & ~mask
w = shirt.astype(np.float32)
def nconv(sig):
    d = cv2.GaussianBlur(w, (0, 0), sig)
    return np.stack([cv2.GaussianBlur(im[..., c] * w, (0, 0), sig) for c in range(3)], -1) / (d[..., None] + 1e-6), d
fine, dfine = nconv(28)
coarse, _ = nconv(110)
trust = np.clip(dfine / 0.35, 0, 1)[..., None]   # use the fine estimate only where enough clean fabric is nearby
est = fine * trust + coarse * (1 - trust)
rng = np.random.default_rng(7)
grain = rng.normal(0, 0.007, (H, W, 1)).astype(np.float32)
fill = np.clip(est + grain, 0, 1)
fm = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 2.5)[..., None]
clean = im * (1 - fm) + fill * fm
cv2.imwrite(f"{out}_clean.png", (clean * 255).astype(np.uint8))

# 3. banner (left half of the mug wrap = the shirt front art)
art = cv2.imread(banner_png, cv2.IMREAD_UNCHANGED)
if art.shape[2] == 3:
    art = np.dstack([art, np.full(art.shape[:2], 255, np.uint8)])
if "mug-wrap" in banner_png:
    art = art[:, : art.shape[1] // 2]
ys, xs = np.where(art[..., 3] > 8)
art = art[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
target_w = TARGET_W
scale = target_w / art.shape[1]
art = cv2.resize(art, (target_w, int(art.shape[0] * scale)), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
ah, aw = art.shape[:2]
cx, top = 646, 600                     # chest centre / top of print on this photo
x0, y0 = cx - aw // 2, top
rgb, a = art[..., :3], art[..., 3:4]
on_white = rgb * a + (1 - a)            # art as printed on a white shirt
roi = clean[y0:y0 + ah, x0:x0 + aw]
fabric_tone = roi / np.clip(cv2.GaussianBlur(roi, (0, 0), 40).mean(axis=(0, 1)), 0.5, 1)  # relative shading
printed = np.clip(on_white * np.clip(fabric_tone, 0.6, 1.08), 0, 1)
printed = cv2.GaussianBlur(printed, (0, 0), 0.6)
result = clean.copy()
result[y0:y0 + ah, x0:x0 + aw] = roi * (1 - a) + printed * a
cv2.imwrite(f"{out}.png", (np.clip(result, 0, 1) * 255).astype(np.uint8))
print("print mask px", int(mask.sum()), "banner", aw, "x", ah, "at", x0, y0)
