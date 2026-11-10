#!/usr/bin/env python3
"""Shop photos for the kids' (boys') tee, long sleeve and sweatshirt with a square scene design.

Starts from the shop's existing crown-logo product photos (shop-kids<product>-<colour>-logo.webp: a model on
the left, a chest close-up on the right). In each half the crown logo is found against the shirt colour,
erased by rebuilding the fabric from the shirt around it, and the new design is printed where the shop
prints it: 940 px wide, 150 px from the top of the 1500x1800 youth print area (the crown logo is 1366 px
wide at 100 px), with the fabric's light and shadow kept on the print.

Usage: python3 -I build_kids_design.py <print png> <suffix, e.g. thankful> [scratch dir for checks]
"""
import glob, os, subprocess, sys
import cv2, numpy as np

ART, SUF = sys.argv[1], sys.argv[2]
DBG = sys.argv[3] if len(sys.argv) > 3 else None
M = "public/assets/merch/"
art0 = cv2.imread(ART)

def halves(im):
    return [(0, im[:, :700]), (700, im[:, 700:])]

PAIR = {"kidstee": ("white", "kelly-green"), "kidslongsleeve": ("white", "red"), "kidssweatshirt": ("white", "black")}
_cache = {}
def masks(prod):
    """Shirt and logo masks for each half, shared by every colour of a product (same model and pose).
    Shirt = pixels that change between a white and a dark colour; logo = the holes enclosed by the shirt."""
    if prod in _cache: return _cache[prod]
    a, b = (cv2.imread(f"{M}shop-{prod}-{c}-logo.webp").astype(int) for c in PAIR[prod])
    diff = (np.abs(a - b).sum(axis=2) > 60).astype(np.uint8)
    res = []
    for x0 in (0, 700):
        S = cv2.morphologyEx(diff[:, x0:x0 + 700], cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        inv = (1 - S).astype(np.uint8); h, w = S.shape
        for px, py in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
            if inv[py, px] == 1: cv2.floodFill(inv, None, (px, py), 2)
        holes = (inv == 1).astype(np.uint8)
        n, lab, st, _ = cv2.connectedComponentsWithStats(holes)
        logo = np.zeros((h, w), bool); main = []
        for i in range(1, n):
            x, y, ww, hh, area = st[i]
            if area > 150 and y > 5 and x > 5 and x + ww < w - 5:      # skip the neckline / face opening at the top edge
                logo |= lab == i; main.append((x, y, x + ww, y + hh))
        # small marks next to the logo (the TM sign, specks of the paw): any hole inside the logo's padded box
        X0 = min(r[0] for r in main); Y0 = min(r[1] for r in main); X1 = max(r[2] for r in main); Y1 = max(r[3] for r in main)
        pad = max(6, (X1 - X0) // 12)
        for i in range(1, n):
            x, y, ww, hh, area = st[i]
            if area <= 150 and x >= X0 - pad and x + ww <= X1 + pad and y >= Y0 - pad and y + hh <= Y1 + pad:
                logo |= lab == i
        logo = cv2.dilate(logo.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))) > 0
        ys, xs = np.nonzero(logo)
        res.append((S > 0, logo, (xs.min(), ys.min(), xs.max() - xs.min() + 1, ys.max() - ys.min() + 1)))
    _cache[prod] = res
    return res

def rebuild(h, shirt, mask, box=None):
    imf = h.astype(np.float32) / 255
    grown = cv2.dilate(mask.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))) > 0
    fabric = shirt & ~grown
    w = fabric.astype(np.float32)
    def nconv(sig):
        dd = cv2.GaussianBlur(w, (0, 0), sig)
        return np.stack([cv2.GaussianBlur(imf[..., c] * w, (0, 0), sig) for c in range(3)], -1) / (dd[..., None] + 1e-6), dd
    fine, dfine = nconv(10); coarse, _ = nconv(40)
    trust = np.clip(dfine / 0.35, 0, 1)[..., None]
    est = fine * trust + coarse * (1 - trust)
    grain = np.random.default_rng(5).normal(0, 0.005, imf.shape[:2] + (1,)).astype(np.float32)
    if box is not None:                      # leftover specks (e.g. the TM sign) near the logo
        X0, Y0, X1, Y1 = box
        near = np.zeros(grown.shape, bool); near[Y0:Y1, X0:X1] = True
        speck = near & shirt & (np.abs(imf - est).mean(axis=2) > 0.10)
        grown |= cv2.dilate(speck.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    fm = cv2.GaussianBlur(grown.astype(np.float32), (0, 0), 2.0)[..., None]
    return np.clip(imf * (1 - fm) + np.clip(est + grain, 0, 1) * fm, 0, 1), grown

def place(clean, bbox):
    x, y, w, hh = bbox
    sc = w / 1366.0                       # the wordmark spans the crown logo's full 1366 px print width
    size = int(round(940 * sc))
    cxp, cyp = x + w / 2, y + 0.36 * w - 56 * sc   # visible logo is about 0.72x as tall as wide; its middle sits 56 print px below the design's
    x0 = int(round(cxp - size / 2)); y0 = int(round(cyp - size / 2))
    art = cv2.resize(art0, (size, size), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    H, W = clean.shape[:2]
    ax0, ay0 = max(0, -x0), max(0, -y0); x0c, y0c = max(0, x0), max(0, y0)
    x1c, y1c = min(W, x0 + size), min(H, y0 + size)
    roi = clean[y0c:y1c, x0c:x1c]; a = art[ay0:ay0 + (y1c - y0c), ax0:ax0 + (x1c - x0c)]
    lum = roi.mean(axis=2, keepdims=True); base = cv2.GaussianBlur(lum, (0, 0), 25)
    base = base if base.ndim == 3 else base[..., None]
    tone = np.clip(lum / np.maximum(base, 0.05), 0.85, 1.08)
    clean[y0c:y1c, x0c:x1c] = cv2.GaussianBlur(np.clip(a * tone, 0, 1), (0, 0), 0.5)
    return clean

def webp(png, dst, vf):
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", png, "-vf", vf, "-c:v", "libwebp", "-quality", "84", dst], check=True)

made, report = [], []
for src in sorted(glob.glob(f"{M}shop-kids*-logo.webp")):
    prod_col = os.path.basename(src)[len("shop-"):-len("-logo.webp")]
    if not prod_col.startswith(("kidstee-", "kidslongsleeve-", "kidssweatshirt-")): continue
    im = cv2.imread(src); out = im.astype(np.float32) / 255; ok = True
    prod = prod_col.split("-")[0]
    for (x0, h), (shirt, mask, bbox) in zip(halves(im), masks(prod)):
        x, y, w, hh = bbox; pad = max(10, w // 8)
        clean, grown = rebuild(h, shirt, mask, (max(0, x - pad), max(0, y - pad), x + w + pad, y + hh + pad))
        out[:, x0:x0 + 700] = place(clean, bbox)
        report.append(f"{prod_col} half@{x0}: logo bbox {bbox}")
    if not ok: print("SKIP (no logo found)", src); continue
    png = f"{DBG or '/tmp'}/{prod_col}-{SUF}.png"; cv2.imwrite(png, (out * 255).astype(np.uint8))
    base = f"{M}shop-{prod_col}-{SUF}"
    webp(png, base + ".webp", "scale=1400:700"); webp(png, base + "-720.webp", "scale=720:360")
    made.append(png)
print("\n".join(report)); print(len(made), "products/colours made")
if DBG:
    sheet = [cv2.resize(cv2.imread(p), (700, 350)) for p in made]
    sheet += [np.full((350, 700, 3), 255, np.uint8)] * (len(sheet) % 2)
    cv2.imwrite(f"{DBG}/sheet-{SUF}.jpg", np.vstack([np.hstack(sheet[i:i + 2]) for i in range(0, len(sheet), 2)]))
