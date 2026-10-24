"""
Effect-presets in code (geen AI-video): PNG-frames in → PNG-frames uit.
Personenmasker per frame met rembg (u2net_human_seg, lokaal), de rest is samenstellen met PIL/numpy.

python effects.py <effect> <in_dir> <out_dir>
effect: papercut | pixelated | clones | incline
"""
import glob
import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from rembg import new_session, remove

EFFECTS = ("papercut", "pixelated", "clones", "incline")


def frames(d):
    fs = sorted(glob.glob(os.path.join(d, "*.png")))
    if not fs:
        raise SystemExit(f"geen frames in {d}")
    return fs


def masks(fs, cache):
    """Zacht personenmasker per frame, gecachet als L-PNG naast de frames."""
    os.makedirs(cache, exist_ok=True)
    sess, out = None, []
    for f in fs:
        m = os.path.join(cache, os.path.basename(f))
        if not os.path.exists(m):
            sess = sess or new_session("u2net_human_seg")
            remove(Image.open(f).convert("RGB"), session=sess, only_mask=True).save(m)
        out.append(Image.open(m).convert("L"))
    return out


def paper_cut(imgs, mks, every=5):
    """Witte papierrand rond de persoon; om de `every` frames blijft een bevroren kopie staan."""
    paper = Image.new("RGB", imgs[0].size, (232, 224, 210))
    stamps = []
    for i, (img, m) in enumerate(zip(imgs, mks)):
        mask = m.point(lambda v: 255 if v > 110 else 0)
        border = mask.filter(ImageFilter.MaxFilter(13))
        cut = Image.new("RGBA", img.size, (0, 0, 0, 0))
        cut.paste(Image.new("RGB", img.size, (250, 248, 240)), (0, 0), border)
        cut.paste(img, (0, 0), mask)
        shadow = border.filter(ImageFilter.GaussianBlur(6)).point(lambda v: v * 0.35)
        if i % every == 0:
            stamps.append((cut, shadow))
        canvas = paper.copy()
        for c, s in stamps[-12:] + [(cut, shadow)]:
            canvas.paste((150, 140, 125), (6, 8), s)
            canvas.paste(c, (0, 0), c)
        yield canvas


def pixelated(imgs, mks, block=14):
    """Achtergrond naar pixel-art (verkleinen, 24 kleuren, scherp vergroten); persoon blijft echt."""
    for img, m in zip(imgs, mks):
        w, h = img.size
        small = img.resize((w // block, h // block), Image.BILINEAR).quantize(24).convert("RGB")
        bg = small.resize((w, h), Image.NEAREST)
        bg.paste(img, (0, 0), m.filter(ImageFilter.GaussianBlur(1)))
        yield bg


def clones(imgs, mks, offsets=((-150, 12), (150, 24), (-280, 36))):
    """Dezelfde persoon zijwaarts gekopieerd, elke kopie met tijdsvertraging: één take, meerdere 'klonen'."""
    hard = [m.point(lambda v: 255 if v > 90 else 0) for m in mks]
    for i, img in enumerate(imgs):
        canvas = img.copy()
        for dx, delay in offsets:
            j = max(0, i - delay)
            canvas.paste(imgs[j], (dx, 0), hard[j])
        canvas.paste(img, (0, 0), hard[i])
        yield canvas


def fill_hole(img, mask):
    """Goedkope invulling: genormaliseerde vervaging van alles buiten het (verbrede) personenmasker."""
    hole = np.asarray(mask.filter(ImageFilter.MaxFilter(21)), np.float32) / 255
    keep = 1 - hole
    a = np.asarray(img, np.float32)
    num = Image.fromarray(np.uint8(np.clip(a * keep[..., None], 0, 255)))
    den = Image.fromarray(np.uint8(keep * 255))
    nb = np.asarray(num.filter(ImageFilter.GaussianBlur(45)), np.float32)
    db = np.asarray(den.filter(ImageFilter.GaussianBlur(45)), np.float32)[..., None] / 255
    out = np.where(hole[..., None] > 0, nb / np.maximum(db, 1e-3), a)
    return Image.fromarray(np.uint8(np.clip(out, 0, 255)))


def incline(imgs, mks, max_deg=14):
    """De ruimte kantelt heen en terug, de persoon blijft rechtop: lege ruimte draaien, persoon terugplakken."""
    n = len(imgs)
    for i, (img, m) in enumerate(zip(imgs, mks)):
        deg = max_deg * math.sin(math.pi * i / max(1, n - 1))
        clean = fill_hole(img, m.point(lambda v: 255 if v > 40 else 0))
        bg = clean.rotate(deg, resample=Image.BICUBIC)
        bg = bg.crop((40, 50, img.width - 40, img.height - 50)).resize(img.size, Image.BICUBIC)
        bg.paste(img, (0, 0), m.filter(ImageFilter.GaussianBlur(1)))
        yield bg


def main():
    if len(sys.argv) != 4 or sys.argv[1] not in EFFECTS:
        raise SystemExit(f"gebruik: effects.py <{'|'.join(EFFECTS)}> <in_dir> <out_dir>")
    effect, in_dir, out_dir = sys.argv[1:]
    fs = frames(in_dir)
    imgs = [Image.open(f).convert("RGB") for f in fs]
    mks = masks(fs, os.path.join(in_dir, "..", "masks"))
    os.makedirs(out_dir, exist_ok=True)
    fn = {"papercut": paper_cut, "pixelated": pixelated, "clones": clones, "incline": incline}[effect]
    for i, img in enumerate(fn(imgs, mks)):
        img.convert("RGB").save(os.path.join(out_dir, f"f{i + 1:04d}.png"))


if __name__ == "__main__":
    main()
