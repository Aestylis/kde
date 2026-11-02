#!/usr/bin/env python3
"""Build three 1980s vehicles in 3D and bake them into a relightable pixel-art atlas, seen from behind and head-on.

Sedan, pickup and van are made of convex solids (body, tapered cabin with sloped glass, bumpers, wheels, mirrors, roof
snow), ray-cast with an orthographic camera looking slightly down the road at 4x the largest size, then reduced to
pixel art at 88, 44, 22 and 11 px. Texels carry normal, material and ambient occlusion; the shader picks the paint
colour, lights it by sun / moon, reflects the sky in the glass and switches the lamps on at night.

Texel encoding (RGBA8): R, G = camera-space normal x, y; B = material * 32 + ao * 31
  material: 0 paint, 1 glass, 2 chrome, 3 rubber / black trim, 4 lamp (tail or head), 5 plate, 6 grille, 7 roof snow
Atlas: rows of 88, 44, 22, 11 px; columns: sedan rear, sedan front, pickup rear, pickup front, van rear, van front.
Each box is square, WORLD m across; the vehicle's centreline sits at the box centre, its wheels on the bottom row.

Usage: python3 tools/gen_cars.py [out.png] [preview.png]
"""
import math
import sys

import numpy as np
from PIL import Image

BUCKETS = [88, 44, 22, 11]
SS = 4
HS = BUCKETS[0] * SS
WORLD = 4.3                       # metres across (and up) the box
PITCH = math.radians(6)           # looking slightly down the road
YAW = math.radians(14)            # the road lies left of the view centre: we see the side facing screen-right
PAINT, GLASS, CHROME, RUBBER, LAMP, PLATE, GRILLE, SNOW = range(8)


def camera(front):
    # rear view: camera behind the car looking along +z; front view: in front looking along -z
    zs = -1 if front else 1
    F0 = np.array([0.0, -math.sin(PITCH), math.cos(PITCH) * zs])
    R0 = np.cross([0.0, 1.0, 0.0], F0); R0 /= np.linalg.norm(R0)
    # swing the camera toward screen-right so that side of the vehicle shows (a three-quarter view)
    F = math.cos(YAW) * F0 - math.sin(YAW) * R0 * math.cos(PITCH)
    F /= np.linalg.norm(F)
    R = np.cross([0.0, 1.0, 0.0], F); R /= np.linalg.norm(R)
    U = np.cross(F, R)
    return F, R, U


def plane_through(n, pt):
    n = np.array(n, float); n /= np.linalg.norm(n)
    return (n, float(n @ np.array(pt, float)))


def box(x0, x1, y0, y1, z0, z1):
    return [(np.array(n, float), d) for n, d in [((-1, 0, 0), -x0), ((1, 0, 0), x1), ((0, -1, 0), -y0), ((0, 1, 0), y1),
                                                 ((0, 0, -1), -z0), ((0, 0, 1), z1)]]


def cabin(xb, xt, yb, yt, zb0, zt0, zt1, zb1):
    """Greenhouse: bottom (yb) spans z zb0..zb1 at half-width xb, roof (yt) spans zt0..zt1 at half-width xt."""
    pl = [(np.array([0.0, -1.0, 0.0]), -yb), (np.array([0.0, 1.0, 0.0]), yt)]
    for s in (-1, 1):
        pl.append(plane_through((s * (yt - yb), xb - xt, 0), (s * xb, yb, 0)))
    pl.append(plane_through((0, zt0 - zb0, -(yt - yb)), (0, yb, zb0)))        # back glass
    pl.append(plane_through((0, zb1 - zt1, (yt - yb)), (0, yb, zb1)))         # windshield
    return pl


class Car:
    def __init__(self):
        self.parts = []

    def add(self, planes, shade):
        self.parts.append(([(np.array(n, float), d) for n, d in planes], shade))


def solid(mat, ao=0.85):
    return lambda P, n, f: (np.full(len(P), mat), np.full(len(P), ao))


def cast(car, front):
    F, R, U = camera(front)
    ys, xs = np.mgrid[0:HS, 0:HS]
    sx = (xs + 0.5 - HS / 2) / HS * WORLD
    sy = ((HS - 1 - ys) + 0.5) / HS * WORLD
    # place the lowest point of the vehicle (wheel bottoms near the camera) on the bottom row
    O = (sx[..., None] * R + sy[..., None] * U) - F * 50.0
    O = O.reshape(-1, 3)
    n_pix = O.shape[0]
    best = np.full(n_pix, np.inf); mat = np.full(n_pix, -1); nrm = np.zeros((n_pix, 3)); ao = np.zeros(n_pix)
    for planes, shade in car.parts:
        t_in = np.full(n_pix, -np.inf); t_out = np.full(n_pix, np.inf); n_in = np.zeros((n_pix, 3))
        face = np.zeros(n_pix, int); ok = np.ones(n_pix, bool)
        for k, (n, d) in enumerate(planes):
            den = n @ F; num = d - O @ n
            if abs(den) < 1e-9:
                ok &= num >= 0; continue
            t = num / den
            if den < 0:
                upd = t > t_in; t_in = np.where(upd, t, t_in); n_in[upd] = n; face = np.where(upd, k, face)
            else:
                t_out = np.minimum(t_out, t)
        hit = ok & (t_in <= t_out) & (t_in < best)
        if not hit.any():
            continue
        P = O[hit] + t_in[hit, None] * F
        m, a = shade(P, n_in[hit], face[hit])
        best[hit] = t_in[hit]; mat[hit] = m; nrm[hit] = n_in[hit]; ao[hit] = a
    ncam = np.stack([nrm @ R, nrm @ U], -1)
    return mat.reshape(HS, HS), ncam.reshape(HS, HS, 2), ao.reshape(HS, HS), U


def lift(car, front):
    """Raise the picture so the lowest wheel point lands just above the bottom row (same for every vehicle/view)."""
    return car


def sedan():
    c = Car(); W, L = 0.875, 4.6
    def body(P, n, f):
        m = np.full(len(P), PAINT); a = np.full(len(P), 0.9)
        rear, frontf = n[:, 2] < -0.5, n[:, 2] > 0.5
        ax = np.abs(P[:, 0])
        m = np.where(rear & (P[:, 1] > 0.60) & (P[:, 1] < 0.80) & (ax > 0.30), LAMP, m)            # full-width tail-light bar
        m = np.where(rear & (P[:, 1] > 0.62) & (P[:, 1] < 0.78) & (ax <= 0.30) & (ax > 0.24), RUBBER, m)
        m = np.where(rear & (P[:, 1] > 0.62) & (P[:, 1] < 0.78) & (ax <= 0.24), PLATE, m)
        m = np.where(frontf & (P[:, 1] > 0.60) & (P[:, 1] < 0.78) & (ax > 0.47) & (ax < 0.80), LAMP, m)   # square headlights
        m = np.where(frontf & (P[:, 1] > 0.56) & (P[:, 1] < 0.80) & (ax <= 0.44), GRILLE, m)
        m = np.where(frontf & (P[:, 1] > 0.80) & (P[:, 1] < 0.84) & (ax < 0.80), CHROME, m)          # grille / lamp chrome line
        m = np.where((np.abs(n[:, 0]) > 0.5) & (P[:, 1] > 0.50) & (P[:, 1] < 0.54), CHROME, m)      # side rub strip
        a = np.where(P[:, 1] < 0.40, 0.65, a)
        return m, a
    c.add(box(-W, W, 0.28, 0.92, 0.05, L - 0.05), body)
    def cab(P, n, f):
        m = np.full(len(P), GLASS); ax = np.abs(P[:, 0])
        m = np.where(n[:, 1] > 0.9, PAINT, m)                                                     # roof
        endf = np.abs(n[:, 2]) > 0.5
        m = np.where(endf & (ax > 0.58), PAINT, m)                                               # C / A pillars
        m = np.where(~endf & (n[:, 1] <= 0.9) & (np.abs(P[:, 2] - 2.28) < 0.07), PAINT, m)       # B pillar
        return m, np.full(len(P), 0.95)
    c.add(cabin(0.82, 0.68, 0.92, 1.38, 1.30, 1.80, 2.80, 3.25), cab)
    c.add(box(-0.58, 0.58, 1.38, 1.43, 1.95, 2.65), solid(SNOW, 0.95))                           # roof snow (shown after a snowy night)
    for z0 in (-0.10, L - 0.02):
        c.add(box(-0.92, 0.92, 0.30, 0.47, z0, z0 + 0.12), solid(CHROME, 0.9))                    # bumpers
    for s in (-1, 1):
        c.add(box(s * 0.98 if s < 0 else 0.86, s * 0.86 if s < 0 else 0.98, 1.00, 1.10, 3.05, 3.17), solid(PAINT, 0.9))   # mirrors
        for z0 in (0.75, 3.25):
            c.add(box(min(s * 0.60, s * 0.86), max(s * 0.60, s * 0.86), 0.0, 0.62, z0, z0 + 0.6), solid(RUBBER, 0.5))
    return c


def pickup():
    c = Car(); W = 0.90
    def bedf(P, n, f):
        m = np.full(len(P), PAINT); ax = np.abs(P[:, 0]); rear = n[:, 2] < -0.5
        m = np.where(rear & (ax > 0.76) & (P[:, 1] > 0.62) & (P[:, 1] < 1.00), LAMP, m)             # tall tail lights
        m = np.where(rear & (P[:, 1] > 0.95) & (P[:, 1] < 0.99) & (ax < 0.70), CHROME, m)           # tailgate handle line
        m = np.where(rear & (P[:, 1] > 0.50) & (P[:, 1] < 0.62) & (ax < 0.22), PLATE, m)
        m = np.where(n[:, 1] > 0.9, RUBBER, m)                                                    # bed rails dark from above
        return m, np.where(P[:, 1] < 0.45, 0.65, 0.88)
    c.add(box(-W, W, 0.40, 1.05, 0.05, 2.20), bedf)
    c.add(box(-0.78, 0.78, 0.90, 1.00, 0.15, 2.10), solid(RUBBER, 0.35))                          # inside of the bed
    def cabf(P, n, f):
        m = np.full(len(P), PAINT); ax = np.abs(P[:, 0]); endf = np.abs(n[:, 2]) > 0.5
        m = np.where(endf & (ax < 0.62) & (P[:, 1] > 1.22) & (P[:, 1] < 1.62), GLASS, m)
        m = np.where((np.abs(n[:, 0]) > 0.5) & (P[:, 1] > 1.22) & (P[:, 1] < 1.62), GLASS, m)
        return m, np.full(len(P), 0.92)
    c.add(box(-W, W, 0.40, 1.75, 2.25, 3.85), cabf)
    def hoodf(P, n, f):
        m = np.full(len(P), PAINT); ax = np.abs(P[:, 0]); frontf = n[:, 2] > 0.5
        m = np.where(frontf & (P[:, 1] > 0.62) & (P[:, 1] < 0.98) & (ax <= 0.52), GRILLE, m)
        m = np.where(frontf & (P[:, 1] > 0.68) & (P[:, 1] < 0.90) & (ax > 0.56) & (ax < 0.84), LAMP, m)
        return m, np.full(len(P), 0.9)
    c.add(box(-W, W, 0.40, 1.10, 3.85, 5.25), hoodf)
    c.add(box(-0.62, 0.62, 1.75, 1.80, 2.6, 3.5), solid(SNOW, 0.95))
    for z0 in (-0.08, 5.22):
        c.add(box(-0.95, 0.95, 0.32, 0.52, z0, z0 + 0.12), solid(CHROME, 0.9))
    for s in (-1, 1):
        c.add(box(min(s * 1.03, s * 0.90), max(s * 1.03, s * 0.90), 1.30, 1.45, 3.75, 3.85), solid(CHROME, 0.9))
        for z0 in (0.65, 4.05):
            c.add(box(min(s * 0.58, s * 0.90), max(s * 0.58, s * 0.90), 0.0, 0.74, z0, z0 + 0.72), solid(RUBBER, 0.5))
    return c


def van():
    c = Car(); W = 0.92
    def bodyf(P, n, f):
        m = np.full(len(P), PAINT); ax = np.abs(P[:, 0]); rear = n[:, 2] < -0.5; frontf = n[:, 2] > 0.5
        m = np.where(rear & (P[:, 1] > 1.22) & (P[:, 1] < 1.70) & (ax > 0.10) & (ax < 0.74), GLASS, m)   # rear door windows
        m = np.where(rear & (ax < 0.025), RUBBER, m)                                                      # door seam
        m = np.where(rear & (ax > 0.78) & (P[:, 1] > 0.58) & (P[:, 1] < 1.08), LAMP, m)
        m = np.where(rear & (P[:, 1] > 0.50) & (P[:, 1] < 0.62) & (ax > 0.06) & (ax < 0.26), PLATE, m)
        m = np.where(frontf & (P[:, 1] > 0.58) & (P[:, 1] < 0.80) & (ax <= 0.48), GRILLE, m)
        m = np.where(frontf & (P[:, 1] > 0.60) & (P[:, 1] < 0.78) & (ax > 0.52) & (ax < 0.84), LAMP, m)
        side = np.abs(n[:, 0]) > 0.5
        m = np.where(side & (P[:, 1] > 1.25) & (P[:, 1] < 1.68) & (P[:, 2] > 3.2), GLASS, m)
        return m, np.where(P[:, 1] < 0.42, 0.65, 0.9)
    c.add(box(-W, W, 0.32, 1.95, 0.05, 4.10), bodyf)
    # sloped nose: windshield plane from the roof front down to the short hood
    def nosef(P, n, f):
        m = np.full(len(P), PAINT); ax = np.abs(P[:, 0])
        slope = (n[:, 2] > 0.3) & (n[:, 1] > 0.2)
        m = np.where(slope & (ax < 0.80) & (P[:, 1] > 1.18), GLASS, m)
        frontf = (n[:, 2] > 0.9)
        m = np.where(frontf & (P[:, 1] > 0.58) & (P[:, 1] < 0.80) & (ax <= 0.48), GRILLE, m)
        m = np.where(frontf & (P[:, 1] > 0.60) & (P[:, 1] < 0.78) & (ax > 0.52) & (ax < 0.84), LAMP, m)
        return m, np.full(len(P), 0.92)
    nose = [(np.array([0.0, -1.0, 0.0]), -0.32), (np.array([-1.0, 0, 0]), W), (np.array([1.0, 0, 0]), W),
            (np.array([0.0, 0, -1.0]), -4.10), (np.array([0.0, 0, 1.0]), 4.85)]
    nose.append(plane_through((0, 0.75, 0.80 - 0.05), (0, 1.95, 4.10)))     # windshield from (y 1.95, z 4.10) down toward the hood
    nose.append((np.array([0.0, 1.0, 0.0]), 1.95))
    c.add(nose, nosef)
    c.add(box(-0.80, 0.80, 1.95, 2.01, 0.3, 3.8), solid(SNOW, 0.95))
    for z0 in (-0.08, 4.82):
        c.add(box(-0.95, 0.95, 0.28, 0.46, z0, z0 + 0.12), solid(CHROME, 0.9))
    for s in (-1, 1):
        for z0 in (0.55, 3.55):
            c.add(box(min(s * 0.62, s * 0.90), max(s * 0.62, s * 0.90), 0.0, 0.64, z0, z0 + 0.62), solid(RUBBER, 0.5))
    return c


def mirror_z(car, L):
    """Turn a vehicle around (so its front faces the camera's rear-view direction) -- unused: the camera turns instead."""
    return car


def soften(mat, ncam, passes=6):
    """Rounded-body shading: average the normals with same-material neighbours, so faces curve into each other."""
    n = ncam.copy()
    for _ in range(passes):
        acc = n.copy(); cnt = np.ones(mat.shape)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            m2 = np.roll(np.roll(mat, dy, 0), dx, 1); n2 = np.roll(np.roll(n, dy, 0), dx, 1)
            same = (m2 == mat) & (mat >= 0)
            acc += n2 * same[..., None]; cnt += same
        n = acc / cnt[..., None]
    return n


def reduce(mat, ncam, ao, f):
    h = w = HS // f
    M = mat[:h * f, :w * f].reshape(h, f, w, f)
    cnt = (M >= 0).sum(axis=(1, 3)); safe = np.maximum(cnt, 1)
    inside = cnt / (f * f) >= 0.45
    frac = {m: (M == m).sum(axis=(1, 3)) / safe for m in range(8)}
    out = np.zeros((h, w), int); best = np.zeros((h, w))
    for m in range(8):
        better = frac[m] > best; out = np.where(better, m, out); best = np.maximum(best, frac[m])
    out = np.where(frac[LAMP] >= 0.25, LAMP, out)                 # keep the lights alive at small sizes
    out = np.where((frac[GLASS] >= 0.35) & (out != LAMP), GLASS, out)
    sel = M == out[:, None, :, None]; ns = np.maximum(sel.sum(axis=(1, 3)), 1)
    N = ncam[:h * f, :w * f].reshape(h, f, w, f, 2)
    nx = (N[..., 0] * sel).sum(axis=(1, 3)) / ns; ny = (N[..., 1] * sel).sum(axis=(1, 3)) / ns
    A = (ao[:h * f, :w * f].reshape(h, f, w, f) * sel).sum(axis=(1, 3)) / ns
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., 0] = np.clip((nx * 0.5 + 0.5) * 255, 0, 255)
    rgba[..., 1] = np.clip((ny * 0.5 + 0.5) * 255, 0, 255)
    rgba[..., 2] = out * 32 + np.clip(np.round(A * 31), 0, 31)
    if h >= 18:                                                   # a 1-px dark outline round the silhouette
        pad = np.pad(inside, 1)
        edge = inside & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
        out = np.where(edge & (out != LAMP), RUBBER, out)
        rgba[..., 2] = out * 32 + np.clip(np.round(A * 31), 0, 31)
    rgba[..., 3] = np.where(inside, 255, 0)
    rgba[~inside, :3] = 0
    return rgba


def preview(atlas):
    a = atlas.astype(np.float32)
    nx, ny = a[..., 0] / 127.5 - 1, a[..., 1] / 127.5 - 1
    mat = (a[..., 2] // 32).astype(int); ao = (a[..., 2] % 32) / 31
    dif = np.clip(nx * 0.4 + ny * 0.7 + 0.45, 0, 1)
    pal = np.array([[0.20, 0.30, 0.55], [0.45, 0.55, 0.65], [0.85, 0.86, 0.88], [0.08, 0.08, 0.09],
                    [0.85, 0.15, 0.10], [0.92, 0.92, 0.85], [0.12, 0.12, 0.13], [0.95, 0.96, 0.98]])
    col = pal[mat] * (0.45 + 0.6 * dif)[..., None] * (0.6 + 0.4 * ao)[..., None]
    col = np.where((a[..., 3] > 0)[..., None], col, np.array([0.80, 0.84, 0.88]))
    return Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8))


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'contents/images/cars.png'
    prev = sys.argv[2] if len(sys.argv) > 2 else None
    builds = [sedan, pickup, van]
    atlas = np.zeros((sum(BUCKETS), BUCKETS[0] * 6, 4), np.uint8)
    for v, build in enumerate(builds):
        car = build()
        for view in (0, 1):                                       # 0 rear (driving away), 1 front (oncoming)
            mat, ncam, ao, U = cast(car, front=view == 1)
            ncam = soften(mat, ncam)
            # drop the picture so the wheels sit on the bottom row: find the lowest covered row
            rows = np.where((mat >= 0).any(axis=1))[0]
            shift = HS - 1 - rows.max()
            mat = np.roll(mat, shift, 0); ncam = np.roll(ncam, shift, 0); ao = np.roll(ao, shift, 0)
            mat[:shift] = -1
            cols = np.where((mat >= 0).any(axis=0))[0]                # and centre it across the box by its real extent
            cs = HS // 2 - (cols.min() + cols.max() + 1) // 2
            mat = np.roll(mat, cs, 1); ncam = np.roll(ncam, cs, 1); ao = np.roll(ao, cs, 1)
            y0 = 0
            for b in BUCKETS:
                spr = reduce(mat, ncam, ao, HS // b)
                col = (v * 2 + view) * b
                atlas[y0:y0 + b, col:col + b] = spr
                y0 += b
    Image.fromarray(atlas, 'RGBA').save(out, optimize=True)
    if prev:
        preview(atlas).save(prev)
    print('cars atlas', atlas.shape[1], 'x', atlas.shape[0])


if __name__ == '__main__':
    main()
