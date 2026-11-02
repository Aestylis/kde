#!/usr/bin/env python3
"""Grow snowy spruces procedurally and bake them into a relightable pixel-art atlas.

Each tree is grown in 3D (trunk, whorls of drooping branches, side sprays, hanging needle clumps, snow pillows on the
branch tops, dead lower twigs), splatted with a z-buffer at 4x the largest size, then reduced to pixel art at 320, 160,
80 and 40 px tall. Nothing is coloured here: every texel stores what the shader needs to light it live, so the trees
follow the real sun / moon, the time-of-day palette, the lamps and the haze.

Texel encoding (RGBA8):
  R = surface normal x  (-1..1 -> 0..255)    facing left/right
  G = surface normal y  (-1..1 -> 0..255)    facing down/up
  B = material * 64 + ao * 63               material: 0 needles, 1 snow, 2 bark, 3 dead twig; ao 0 = deep inside
  A = 255 inside the tree, 0 outside

Atlas layout: one row per size bucket (320, 160, 80, 40 px tall, stacked top to bottom), NVAR variants side by side,
each in a box 0.75 x its height, trunk base at the bottom-centre of the box.

Usage: python3 tools/gen_trees.py [out.png] [preview.png]
"""
import math
import sys

import numpy as np
from PIL import Image

NVAR = 12
BUCKETS = [320, 160, 80, 40]
SS = 4                                  # supersampling of the largest bucket
HS = BUCKETS[0] * SS                    # render height
BOXW = 0.75                             # box width / height
WS = int(HS * BOXW)

NEEDLE, SNOW, BARK, DEAD = 0, 1, 2, 3


class Canvas:
    def __init__(self, seed):
        self.z = np.full((HS, WS), -1e9, np.float32)
        self.nx = np.zeros((HS, WS), np.float32)
        self.ny = np.zeros((HS, WS), np.float32)
        self.ao = np.zeros((HS, WS), np.float32)
        self.mat = np.full((HS, WS), -1, np.int8)
        self.rng = np.random.default_rng(seed + 991)

    def blob(self, cx, cy, cz, rx, ry, mat, ao, bias=(0.0, 0.0, 0.0), rag=0.35, half=None):
        """Ellipsoid splat at tree coords (x right from the axis, y up from the base, z toward the viewer)."""
        cx = max(-WS / 2 + rx + 2, min(WS / 2 - rx - 2, cx))
        col0 = cx + WS / 2
        row0 = HS - 1 - cy
        x0, x1 = int(math.floor(col0 - rx - 1)), int(math.ceil(col0 + rx + 1))
        y0, y1 = int(math.floor(row0 - ry - 1)), int(math.ceil(row0 + ry + 1))
        x0, y0 = max(x0, 0), max(y0, 0)
        x1, y1 = min(x1, WS - 1), min(y1, HS - 1)
        if x1 < x0 or y1 < y0:
            return
        X, Y = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        dx = (X + 0.5 - col0) / rx
        dy = (row0 - (Y + 0.5)) / ry                       # up = +
        d2 = dx * dx + dy * dy
        lim = (1.0 - rag * 0.5 + rag * self.rng.random(d2.shape)) ** 2   # ragged, needly edge
        inside = d2 < lim
        if half == 'top':
            inside &= dy > -0.15
        if not inside.any():
            return
        nz = np.sqrt(np.clip(1.0 - d2, 0.0, 1.0))
        z = cz + nz * min(rx, ry)
        sl = (slice(y0, y1 + 1), slice(x0, x1 + 1))
        win = inside & (z > self.z[sl])
        if not win.any():
            return
        n = np.stack([dx + bias[0], dy + bias[1], nz + bias[2]])
        n /= np.maximum(np.linalg.norm(n, axis=0), 1e-6)
        self.z[sl] = np.where(win, z, self.z[sl])
        self.nx[sl] = np.where(win, n[0], self.nx[sl])
        self.ny[sl] = np.where(win, n[1], self.ny[sl])
        self.ao[sl] = np.where(win, ao, self.ao[sl])
        self.mat[sl] = np.where(win, mat, self.mat[sl])


def grow(variant):
    rng = np.random.default_rng(1000 + variant * 7919)
    cv = Canvas(variant)
    H = HS * rng.uniform(0.94, 0.99)                       # tree height inside the box
    kind = variant % 4                                     # 0 dense spruce, 1 scraggly, 2 narrow young fir, 3 old / broken top
    Rmax = H * {0: rng.uniform(0.22, 0.26), 1: rng.uniform(0.20, 0.25), 2: rng.uniform(0.16, 0.19), 3: rng.uniform(0.22, 0.26)}[kind]
    cb = H * {0: rng.uniform(0.05, 0.09), 1: rng.uniform(0.10, 0.18), 2: rng.uniform(0.04, 0.07), 3: rng.uniform(0.12, 0.20)}[kind]
    gap = {0: 0.05, 1: 0.22, 2: 0.04, 3: 0.15}[kind]
    snowLoad = rng.uniform(0.55, 0.95)
    droopK = rng.uniform(0.8, 1.25)
    lean = rng.uniform(-0.035, 0.035)
    wob = rng.uniform(0, 6.28)
    top = H * (rng.uniform(0.80, 0.88) if kind == 3 else 1.0)  # broken / dead top on old trees

    def axis(y):
        return lean * y + H * 0.006 * math.sin(y / H * 9.0 + wob)

    # trunk (bark), visible low down and through gaps
    for y in np.arange(0, top, 2.0):
        r = H * ((0.017 if y < cb else 0.010) * (1 - y / H) + 0.002)
        cv.blob(axis(y), y, 0.0, r, 2.5, BARK, 0.25, rag=0.1)
    if kind == 3:                                          # bare snag above the broken top
        for y in np.arange(top, top + H * 0.06, 2.0):
            cv.blob(axis(y) + (y - top) * 0.25, y, 0.0, H * 0.006 * (1 - 0.6 * (y - top) / (H * 0.06)), 2.5, DEAD, 0.6, rag=0.3)
        for t in np.linspace(0, 1, 12):                    # one stubby dead limb off the snag
            cv.blob(axis(top) + H * 0.04 * t, top + H * 0.015 + H * 0.012 * t, 0.5, H * 0.003, H * 0.003, DEAD, 0.5, rag=0.2)

    nW = int(rng.integers(26, 36))
    asym, asymDir = rng.uniform(0.0, 0.18), rng.uniform(0, 2 * math.pi)   # one side fuller (light / wind)
    span = top * 0.95 - cb
    ys = np.linspace(cb, top * 0.95, nW) + rng.uniform(-0.3, 0.3, nW) * span / nW
    for yw in ys:
        u = (yw - cb) / max(span, 1)
        u = min(max(u, 0.0), 1.0)
        Rw = Rmax * (1 - u) ** 0.92 * rng.uniform(0.85, 1.12) * (top / H if kind == 3 else 1.0) + H * 0.012
        if u < 0.08:
            Rw *= 0.75 + 3.0 * u
        nb = int(rng.integers(5, 8))
        ph = rng.uniform(0, 2 * math.pi)
        for b in range(nb):
            th = ph + 2 * math.pi * b / nb + rng.uniform(-0.3, 0.3)
            c, s_ = math.cos(th), math.sin(th)
            ax = axis(yw)
            if rng.random() < gap + (0.35 if u < 0.12 else 0.0):          # dead / missing branch
                if rng.random() < 0.6:
                    L = Rw * rng.uniform(0.25, 0.55)
                    for t in np.linspace(0.05, 1, max(3, int(L / 3))):
                        cv.blob(ax + c * L * t, yw - L * 0.25 * t, s_ * L * t, H * 0.0035, H * 0.0035, DEAD, 0.4, rag=0.2)
                continue
            Lb = Rw * rng.uniform(0.62, 1.15) * (1 + asym * math.cos(th - asymDir))
            droop = (0.25 + 0.55 * (1 - u)) * rng.uniform(0.7, 1.3) * droopK
            n = max(4, int(Lb / (H * 0.0065)))
            for s in np.linspace(0.0, 1.0, n):
                r = s * Lb
                dy = -Lb * (droop * 0.45 * s ** 1.5 - 0.12 * s ** 4)
                px, py, pz = ax + c * r, yw + dy, s_ * r
                rb = H * (0.0080 + 0.0085 * math.sqrt(s)) * (0.7 + 0.5 * (1 - u)) * rng.uniform(0.85, 1.15)
                aoB = (0.30 + 0.70 * s) * (0.70 + 0.30 * (s_ + 1) / 2) * (0.72 + 0.28 * u)
                bias = (c * 0.6, 0.15, s_ * 0.6)                       # foliage faces outward from the trunk
                cv.blob(px, py, pz, rb * 1.15, rb * 0.85, NEEDLE, aoB, bias)
                if s > 0.3:                                             # side sprays: fuller, flatter fronds
                    for sg in (-1, 1):
                        qx, qz = -s_ * sg, c * sg
                        cv.blob(px + qx * rb * 1.1, py - rb * 0.15, pz + qz * rb * 1.1, rb * 0.8, rb * 0.6, NEEDLE, aoB * 0.92, bias)
                if rng.random() < 0.45:                                 # hanging curtain under the branch
                    cv.blob(px, py - rb * 0.9, pz - 0.5, rb * 0.65, rb * 0.75, NEEDLE, aoB * 0.8, (bias[0], -0.25, bias[2]))
                if s > 0.22 and rng.random() < snowLoad * (1 - 0.55 * u):  # snow pillow on top
                    cv.blob(px, py + rb * 0.55, pz + 0.8, rb * 1.05, rb * 0.5, SNOW, min(1.0, 0.6 + 0.4 * s), (0.0, 0.9, 0.0), rag=0.25, half='top')
    # leader: a thin wavy shoot with little side tufts, not an arrowhead
    if kind != 3:
        for y in np.arange(top * 0.92, top, 2.0):
            k = (top - y) / (top * 0.08)
            r = H * (0.0025 + 0.006 * k)
            cv.blob(axis(y), y, 0.0, r, r * 1.3, NEEDLE, 0.85, (0, 0.2, 0), rag=0.5)
            if rng.random() < 0.18:
                sg = 1 if rng.random() < 0.5 else -1
                cv.blob(axis(y) + sg * r * 2.2, y - r, 0.5, r * 1.3, r * 0.7, NEEDLE, 0.8, (sg * 0.5, 0.2, 0), rag=0.5)
        cv.blob(axis(top * 0.975), top * 0.975, 1.0, H * 0.005, H * 0.003, SNOW, 0.95, (0, 1.0, 0), half='top')
    return cv


def reduce(cv, f):
    """Reduce the supersampled canvas by f into pixel art: coverage threshold, snow-priority material, mean normals."""
    h, w = HS // f, WS // f
    cov = (cv.mat >= 0)[:h * f, :w * f].reshape(h, f, w, f)
    mat = cv.mat[:h * f, :w * f].reshape(h, f, w, f)
    nx = cv.nx[:h * f, :w * f].reshape(h, f, w, f)
    ny = cv.ny[:h * f, :w * f].reshape(h, f, w, f)
    ao = cv.ao[:h * f, :w * f].reshape(h, f, w, f)
    cnt = cov.sum(axis=(1, 3)).astype(np.float32)
    frac = cnt / (f * f)
    inside = frac >= 0.42
    safe = np.maximum(cnt, 1)
    fr = {m: (mat == m).sum(axis=(1, 3)) / safe for m in (NEEDLE, SNOW, BARK, DEAD)}
    m_out = np.full((h, w), NEEDLE, np.int32)
    m_out[fr[DEAD] > 0.5] = DEAD
    m_out[fr[BARK] > 0.5] = BARK
    m_out[fr[SNOW] >= 0.34] = SNOW
    sel = mat == m_out[:, None, :, None]
    ns = np.maximum(sel.sum(axis=(1, 3)), 1)
    onx = (nx * sel).sum(axis=(1, 3)) / ns
    ony = (ny * sel).sum(axis=(1, 3)) / ns
    oao = (ao * sel).sum(axis=(1, 3)) / ns
    # drop lone specks (no 8-neighbour inside)
    pad = np.pad(inside, 1)
    nb = sum(np.roll(np.roll(pad, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx)[1:-1, 1:-1]
    inside &= nb > 0
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., 0] = np.clip((onx * 0.5 + 0.5) * 255, 0, 255)
    rgba[..., 1] = np.clip((ony * 0.5 + 0.5) * 255, 0, 255)
    rgba[..., 2] = m_out * 64 + np.clip(np.round(oao * 63), 0, 63).astype(np.int32)
    rgba[..., 3] = np.where(inside, 255, 0)
    rgba[~inside, :3] = 0
    return rgba


def preview(atlas):
    """A rough lit preview (sun from the left, day greens) so the shapes can be judged by eye."""
    a = atlas.astype(np.float32)
    nx, ny = a[..., 0] / 127.5 - 1, a[..., 1] / 127.5 - 1
    mat = (a[..., 2] // 64).astype(int)
    ao = (a[..., 2] % 64) / 63
    diff = np.clip(-nx * 0.7 + ny * 0.5 + 0.25, 0, 1)
    g = np.stack([0.08 + 0.20 * diff, 0.12 + 0.26 * diff, 0.10 + 0.16 * diff], -1) * (0.55 + 0.5 * ao)[..., None]
    s = np.stack([0.62 + 0.33 * diff, 0.68 + 0.28 * diff, 0.80 + 0.17 * diff], -1) * (0.8 + 0.2 * ao)[..., None]
    b = np.stack([0.20 + 0.12 * diff, 0.15 + 0.09 * diff, 0.11 + 0.06 * diff], -1)
    col = np.where((mat == SNOW)[..., None], s, np.where((mat >= BARK)[..., None], b, g))
    bg = np.array([0.80, 0.84, 0.90])
    col = np.where((a[..., 3] > 0)[..., None], col, bg)
    return Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8))


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'contents/images/trees.png'
    prev = sys.argv[2] if len(sys.argv) > 2 else None
    W = int(BUCKETS[0] * BOXW) * NVAR
    atlas = np.zeros((sum(BUCKETS), W, 4), np.uint8)
    for v in range(NVAR):
        cv = grow(v)
        y0 = 0
        for bh in BUCKETS:
            f = HS // bh
            spr = reduce(cv, f)
            bw = int(bh * BOXW)
            atlas[y0:y0 + bh, v * bw:v * bw + bw] = spr[:bh, :bw]
            y0 += bh
        print(f'variant {v} done', flush=True)
    Image.fromarray(atlas, 'RGBA').save(out, optimize=True)
    if prev:
        preview(atlas).save(prev)


if __name__ == '__main__':
    main()
