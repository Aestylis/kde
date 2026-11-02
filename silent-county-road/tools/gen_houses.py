#!/usr/bin/env python3
"""Build a few snowy country buildings in 3D and bake them into a relightable pixel-art atlas.

Each building is a set of convex solids (walls, gable / gambrel roofs, chimneys, porch, snow drifts), ray-cast with an
orthographic 3/4 camera at 4x the largest size, then reduced to pixel art at 96, 48 and 24 px tall. Like the trees,
nothing is coloured here: texels carry normal, material and ambient occlusion, plus a window id, so the shader can light
the walls from the real sun / moon and switch every window on and off on its own schedule.

Texel encoding (RGBA8):
  R, G = surface normal x, y in camera space (-1..1 -> 0..255); for window glass R = window id * 16 + 8
  B    = material * 32 + ao * 31
         material: 0 wall, 1 roof, 2 snow, 3 window glass, 4 trim, 5 door, 6 chimney / stone, 7 soffit / shadow
  A    = 255 inside, 0 outside

Atlas: rows of 96, 48, 24 px tall; NVAR variants side by side in boxes 1.6 x the height. One world scale for all
buildings: a box is 12 m tall. The building's ground origin sits at the box centre, ORIGIN_V of the height up.

Prints the chimney-top positions (box-relative) for the shader's smoke.

Usage: python3 tools/gen_houses.py [out.png] [preview.png]
"""
import math
import sys

import numpy as np
from PIL import Image

BUCKETS = [96, 48, 24]
SS = 4
HS = BUCKETS[0] * SS
ASPECT = 1.6
WS = int(HS * ASPECT)
WORLD_H = 12.0                      # metres covered by the box height
ORIGIN_V = 0.10                     # ground origin height in the box (fraction of the box height)
WALL, ROOF, SNOW, GLASS, TRIM, DOOR, STONE, SOFFIT = range(8)

YAW, PITCH = math.radians(32), math.radians(2)   # eye level: the viewer stands on the road
F = np.array([-math.sin(YAW) * math.cos(PITCH), -math.sin(PITCH), math.cos(YAW) * math.cos(PITCH)])
R = np.cross([0.0, 1.0, 0.0], F); R /= np.linalg.norm(R)
U = np.cross(F, R)


def box(x0, x1, y0, y1, z0, z1):
    return [((-1, 0, 0), -x0), ((1, 0, 0), x1), ((0, -1, 0), -y0), ((0, 1, 0), y1), ((0, 0, -1), -z0), ((0, 0, 1), z1)]


def plane_through(n, pt):
    n = np.array(n, float); n /= np.linalg.norm(n)
    return (tuple(n), float(n @ np.array(pt, float)))


def gable_x(x0, x1, z0, z1, y0, ridge):
    """Gable roof with the ridge along x (slopes face -z / +z), spanning z0..z1 at eave height y0."""
    half = (z1 - z0) / 2
    rise = ridge - y0
    return [((0, -1, 0), -y0), ((-1, 0, 0), -x0), ((1, 0, 0), x1),
            plane_through((0, half, -rise), (0, y0, z0)), plane_through((0, half, rise), (0, y0, z1))]


def gambrel_z(x0, x1, z0, z1, y0, knee_x, knee_y, ridge):
    """Barn roof, ridge along z (gable ends face -z / +z). Lower steep slopes from the eaves to the knees, then shallow."""
    xc = (x0 + x1) / 2
    pl = [((0, -1, 0), -y0), ((0, 0, -1), -z0), ((0, 0, 1), z1)]
    for sx in (-1, 1):
        ex, kx = (x1 if sx > 0 else x0), xc + sx * knee_x
        # steep lower plane through eave (ex, y0) and knee (kx, knee_y)
        d = np.array([kx - ex, knee_y - y0]); n = np.array([d[1], -d[0]]) * (1 if sx > 0 else -1)
        if n[1] < 0: n = -n
        pl.append(plane_through((n[0], n[1], 0), (ex, y0, 0)))
        d = np.array([xc - kx, ridge - knee_y]); n = np.array([d[1], -d[0]]) * (1 if sx > 0 else -1)
        if n[1] < 0: n = -n
        pl.append(plane_through((n[0], n[1], 0), (kx, knee_y, 0)))
    return pl


def lean_to(x0, x1, z_wall, z_out, y_wall, y_out, thick=0.25):
    """Porch roof sloping from the wall (z_wall, y_wall) out to (z_out, y_out); z_out < z_wall."""
    pt = (0, y_wall, z_wall)
    rise, run = y_wall - y_out, z_wall - z_out
    top = plane_through((0, run, -rise), pt)
    bot_n = (0, -run, rise)
    bot = plane_through(bot_n, (0, y_wall - thick, z_wall))
    return [top, bot, ((-1, 0, 0), -x0), ((1, 0, 0), x1), ((0, 0, -1), -z_out), ((0, 0, 1), z_wall)]


class Scene:
    def __init__(self):
        self.parts = []                     # (planes, shader(hit, normal, face) -> (mat, ao, win))

    def add(self, planes, shade):
        self.parts.append(([(np.array(n, float), d) for n, d in planes], shade))


def cast(scene, origin_shift):
    """Orthographic rays for every supersampled pixel; returns per-pixel material, normal (cam), ao, window id."""
    ys, xs = np.mgrid[0:HS, 0:WS]
    sx = (xs + 0.5 - WS / 2) / HS * WORLD_H
    sy = ((HS - 1 - ys) + 0.5) / HS * WORLD_H - ORIGIN_V * WORLD_H + origin_shift
    O = (sx[..., None] * R + sy[..., None] * U) - F * 100.0
    O = O.reshape(-1, 3)
    n_pix = O.shape[0]
    best_t = np.full(n_pix, np.inf)
    out_mat = np.full(n_pix, -1, np.int32)
    out_n = np.zeros((n_pix, 3))
    out_ao = np.zeros(n_pix)
    out_win = np.zeros(n_pix, np.int32)
    for planes, shade in scene.parts:
        t_in = np.full(n_pix, -np.inf); t_out = np.full(n_pix, np.inf)
        n_in = np.zeros((n_pix, 3)); face = np.zeros(n_pix, np.int32)
        ok = np.ones(n_pix, bool)
        for k, (n, d) in enumerate(planes):
            den = n @ F
            num = d - O @ n
            if abs(den) < 1e-9:
                ok &= num >= 0
                continue
            t = num / den
            if den < 0:
                upd = t > t_in
                t_in = np.where(upd, t, t_in); n_in[upd] = n; face = np.where(upd, k, face)
            else:
                t_out = np.minimum(t_out, t)
        hit = ok & (t_in <= t_out) & (t_in > 0) & (t_in < best_t)
        if not hit.any():
            continue
        P = O[hit] + t_in[hit, None] * F
        mat, ao, win = shade(P, n_in[hit], face[hit])
        best_t[hit] = t_in[hit]
        out_mat[hit] = mat; out_n[hit] = n_in[hit]; out_ao[hit] = ao; out_win[hit] = win
    ncam = np.stack([out_n @ R, out_n @ U], -1)
    return (out_mat.reshape(HS, WS), ncam.reshape(HS, WS, 2), out_ao.reshape(HS, WS), out_win.reshape(HS, WS))


rng = np.random.default_rng(7)


def wall_shader(x0, x1, y0, y1, z0, z1, windows, doors, corner=0.18):
    """Walls of a box: windows / doors given per face as (face, u0, u1, v0, v1[, id]); face: 'front' (-z), 'back',
    'left' (-x), 'right' (+x). u runs along the face left->right as seen from outside, v is height."""
    def shade(P, n, face):
        mat = np.full(len(P), WALL); win = np.zeros(len(P), np.int32)
        fn = np.where(n[:, 2] < -0.5, 0, np.where(n[:, 2] > 0.5, 1, np.where(n[:, 0] < -0.5, 2, 3)))
        u = np.select([fn == 0, fn == 1, fn == 2, fn == 3], [P[:, 0] - x0, x1 - P[:, 0], z1 - P[:, 2], P[:, 2] - z0])
        L = np.select([fn <= 1, fn >= 2], [x1 - x0, z1 - z0])
        v = P[:, 1] - y0
        mat = np.where((u < corner) | (u > L - corner), TRIM, mat)          # corner boards
        names = {'front': 0, 'back': 1, 'left': 2, 'right': 3}
        for w in windows:
            f, u0, u1, v0, v1, wid = w
            m = (fn == names[f]) & (u >= u0 - 0.12) & (u <= u1 + 0.12) & (v >= v0 - 0.12) & (v <= v1 + 0.12)
            mat = np.where(m, TRIM, mat)
            g = m & (u >= u0) & (u <= u1) & (v >= v0) & (v <= v1)
            mat = np.where(g, GLASS, mat); win = np.where(g, wid, win)
        for f, u0, u1, v0, v1 in doors:
            m = (fn == names[f]) & (u >= u0) & (u <= u1) & (v >= v0) & (v <= v1)
            mat = np.where(m, DOOR, mat)
        top = y1 - P[:, 1]
        ao = np.clip(0.55 + 0.45 * np.clip(top / 0.9, 0, 1), 0, 1) * np.clip(0.7 + 0.3 * v / 0.8, 0, 1)   # eave shadow, ground contact
        return mat, ao, win
    return shade


def roof_shader(slope_faces, snow_cover=0.85, eave_y=None, seed=0):
    r = np.random.default_rng(seed)
    blot = r.random((64, 64))

    def shade(P, n, face):
        mat = np.full(len(P), WALL)                           # gable ends are wall
        slope = np.isin(face, slope_faces)
        mat = np.where(n[:, 1] < -0.5, SOFFIT, mat)
        cell = blot[(np.floor(P[:, 0] * 2.2).astype(int)) % 64, (np.floor(P[:, 2] * 2.2 + P[:, 1] * 1.6).astype(int)) % 64]
        low = 1.0 - np.clip((P[:, 1] - (eave_y if eave_y is not None else 0.0)) / 1.6, 0, 1)   # bare spots near the eaves only
        bare = cell > 1.0 - (1.0 - snow_cover) * 1.6 * low
        if eave_y is not None:
            bare |= (P[:, 1] - eave_y) < 0.18                 # dark fascia line along the eaves
        mat = np.where(slope, np.where(bare, ROOF, SNOW), mat)
        ao = np.where(slope, 0.95, 0.6)
        return mat, ao, np.zeros(len(P), np.int32)
    return shade


def solid(mat, ao=0.8, top_mat=None):
    def shade(P, n, face):
        m = np.full(len(P), mat)
        if top_mat is not None:
            m = np.where(n[:, 1] > 0.5, top_mat, m)
        return m, np.full(len(P), ao), np.zeros(len(P), np.int32)
    return shade


def drift(sc, x0, x1, z0, z1, h=0.45, out=0.35):
    """A low snow bank against the walls."""
    sc.add(box(x0 - out, x1 + out, -0.05, h, z0 - out, z1 + out), solid(SNOW, 0.9))


def farmhouse():
    sc = Scene()
    x0, x1, z0, z1, H = -5.0, 5.0, -3.5, 3.5, 5.6
    wins, wid = [], 0
    for v0 in (0.9, 3.6):
        for uc in (1.3, 3.0, 7.0, 8.7):
            wins.append(('front', uc - 0.45, uc + 0.45, v0, v0 + 1.25, wid)); wid += 1
    for v0 in (0.9, 3.6):
        for uc in (2.2, 4.8):
            wins.append(('right', uc - 0.45, uc + 0.45, v0, v0 + 1.25, wid)); wid += 1
    sc.add(box(x0, x1, 0, H, z0, z1), wall_shader(x0, x1, 0, H, z0, z1, wins, [('front', 4.45, 5.55, 0.0, 2.2)]))
    sc.add(gable_x(x0 - 0.5, x1 + 0.5, z0 - 0.55, z1 + 0.55, H - 0.1, H + 3.0), roof_shader([3, 4], 0.82, H - 0.1, 1))
    sc.add(box(2.4, 3.2, H, H + 4.2, 0.2, 1.0), solid(STONE, 0.8, SOFFIT))
    # porch: lean-to roof on posts
    sc.add(lean_to(-3.6, 3.6, z0, z0 - 1.9, 2.9, 2.35), roof_shader([0], 0.7, 2.4, 2))
    for px in (-3.4, -1.2, 1.2, 3.4):
        sc.add(box(px - 0.1, px + 0.1, 0, 2.5, z0 - 1.85, z0 - 1.65), solid(TRIM, 0.8))
    drift(sc, x0, x1, z0, z1)
    return sc, (2.8, H + 4.2, 0.6)


def cabin():
    sc = Scene()
    x0, x1, z0, z1, H = -3.5, 3.5, -3.0, 3.0, 3.0
    wins = [('front', 0.7, 1.7, 1.0, 2.1, 0), ('front', 5.2, 6.2, 1.0, 2.1, 1), ('right', 2.4, 3.6, 1.0, 2.1, 2)]
    sc.add(box(x0, x1, 0, H, z0, z1), wall_shader(x0, x1, 0, H, z0, z1, wins, [('front', 2.6, 3.6, 0.0, 2.1)], corner=0.3))
    sc.add(gable_x(x0 - 0.6, x1 + 0.6, z0 - 0.6, z1 + 0.6, H - 0.1, H + 3.4), roof_shader([3, 4], 0.9, H - 0.1, 3))
    sc.add(box(x0 - 1.1, x0 - 0.1, 0, 2.4, -0.6, 0.6), solid(STONE, 0.75))     # outside stone chimney, stepped
    sc.add(box(x0 - 0.9, x0 - 0.1, 2.4, 7.4, -0.4, 0.4), solid(STONE, 0.8, SOFFIT))
    drift(sc, x0, x1, z0, z1, 0.55, 0.45)
    return sc, (x0 - 0.5, 7.4, 0.0)


def barn():
    sc = Scene()
    x0, x1, z0, z1, H = -5.0, 5.0, -6.0, 6.0, 4.4
    wins = [('front', 4.3, 5.7, 6.4, 7.4, 0), ('right', 2.0, 3.0, 2.2, 3.0, 1), ('right', 9.0, 10.0, 2.2, 3.0, 2)]
    sc.add(box(x0, x1, 0, H, z0, z1), wall_shader(x0, x1, 0, H, z0, z1, [w for w in wins if w[0] != 'front'],
                                                [('front', 3.1, 6.9, 0.0, 3.6)], corner=0.25))
    # gable end above the walls: a wall-coloured prism with the loft window, drawn by the roof's end faces
    roof = gambrel_z(x0 - 0.35, x1 + 0.35, z0 - 0.4, z1 + 0.4, H - 0.1, 3.3, H + 2.6, H + 4.1)
    rs = roof_shader([3, 4, 5, 6], 0.75, H - 0.1, 4)

    def roof_and_loft(P, n, face):
        mat, ao, win = rs(P, n, face)
        loft = (face == 1) & (np.abs(P[:, 0]) < 0.75) & (P[:, 1] > H + 1.8) & (P[:, 1] < H + 3.0)
        frame = (face == 1) & (np.abs(P[:, 0]) < 0.9) & (P[:, 1] > H + 1.65) & (P[:, 1] < H + 3.15)
        mat = np.where(frame, TRIM, mat); mat = np.where(loft, GLASS, mat)
        return mat, ao, np.where(loft, 0, win)
    sc.add(roof, roof_and_loft)
    drift(sc, x0, x1, z0, z1, 0.5, 0.4)
    return sc, None


def cottage():
    sc = Scene()
    x0, x1, z0, z1, H = -4.2, 4.2, -3.2, 3.2, 3.1
    wins = [('front', 0.8, 1.9, 1.0, 2.2, 0), ('front', 6.3, 7.4, 1.0, 2.2, 1), ('right', 1.4, 2.4, 1.0, 2.2, 2),
            ('right', 4.0, 5.0, 1.0, 2.2, 3)]
    sc.add(box(x0, x1, 0, H, z0, z1), wall_shader(x0, x1, 0, H, z0, z1, wins, [('front', 3.65, 4.75, 0.0, 2.1)]))
    sc.add(gable_x(x0 - 0.45, x1 + 0.45, z0 - 0.5, z1 + 0.5, H - 0.1, H + 2.7), roof_shader([3, 4], 0.88, H - 0.1, 5))
    sc.add(box(-0.4, 0.4, H + 1.5, H + 3.6, -0.4, 0.4), solid(STONE, 0.8, SOFFIT))
    drift(sc, x0, x1, z0, z1)
    return sc, (0.0, H + 3.6, 0.0)


BUILDINGS = [farmhouse, cabin, barn, cottage]


def reduce(mat, ncam, ao, win, f):
    h, w = HS // f, WS // f
    M = mat[:h * f, :w * f].reshape(h, f, w, f)
    cnt = (M >= 0).sum(axis=(1, 3)); safe = np.maximum(cnt, 1)
    inside = cnt / (f * f) >= 0.45
    frac = {m: (M == m).sum(axis=(1, 3)) / safe for m in range(8)}
    out = np.zeros((h, w), np.int32)
    best = np.zeros((h, w))
    for m in range(8):
        better = frac[m] > best; out = np.where(better, m, out); best = np.maximum(best, frac[m])
    out = np.where(frac[GLASS] >= 0.22, GLASS, out)       # keep small windows alive at small sizes
    out = np.where((frac[SNOW] >= 0.40) & (out != GLASS), SNOW, out)
    sel = M == out[:, None, :, None]; ns = np.maximum(sel.sum(axis=(1, 3)), 1)
    N = ncam[:h * f, :w * f].reshape(h, f, w, f, 2)
    nx = (N[..., 0] * sel).sum(axis=(1, 3)) / ns; ny = (N[..., 1] * sel).sum(axis=(1, 3)) / ns
    A = (ao[:h * f, :w * f].reshape(h, f, w, f) * sel).sum(axis=(1, 3)) / ns
    W = win[:h * f, :w * f].reshape(h, f, w, f)
    wmax = np.max(np.where(M == GLASS, W, -1), axis=(1, 3))
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., 0] = np.where(out == GLASS, np.clip(wmax, 0, 15) * 16 + 8, np.clip((nx * 0.5 + 0.5) * 255, 0, 255))
    rgba[..., 1] = np.clip((ny * 0.5 + 0.5) * 255, 0, 255)
    rgba[..., 2] = out * 32 + np.clip(np.round(A * 31), 0, 31)
    rgba[..., 3] = np.where(inside, 255, 0)
    rgba[~inside, :3] = 0
    return rgba


def preview(atlas):
    a = atlas.astype(np.float32)
    nx, ny = a[..., 0] / 127.5 - 1, a[..., 1] / 127.5 - 1
    mat = (a[..., 2] // 32).astype(int); ao = (a[..., 2] % 32) / 31
    dif = np.clip(nx * 0.6 + ny * 0.6 + 0.35, 0, 1)
    pal = np.array([[0.86, 0.84, 0.78], [0.25, 0.22, 0.22], [0.93, 0.95, 0.98], [1.0, 0.78, 0.40],
                    [0.95, 0.95, 0.92], [0.35, 0.18, 0.12], [0.50, 0.42, 0.38], [0.12, 0.12, 0.14]])
    col = pal[mat] * (0.45 + 0.6 * dif)[..., None] * (0.6 + 0.4 * ao)[..., None]
    col = np.where((mat == 3)[..., None], pal[3], col)
    col = np.where((a[..., 3] > 0)[..., None], col, np.array([0.55, 0.62, 0.75]))
    return Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8))


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'contents/images/houses.png'
    prev = sys.argv[2] if len(sys.argv) > 2 else None
    nv = len(BUILDINGS)
    widths = [int(b * ASPECT) for b in BUCKETS]
    atlas = np.zeros((sum(BUCKETS), widths[0] * nv, 4), np.uint8)
    for v, build in enumerate(BUILDINGS):
        sc, chim = build()
        mat, ncam, ao, win = cast(sc, 0.0)
        y0 = 0
        for bh, bw in zip(BUCKETS, widths):
            spr = reduce(mat, ncam, ao, win, HS // bh)
            atlas[y0:y0 + bh, v * bw:v * bw + bw] = spr[:bh, :bw]
            y0 += bh
        if chim is not None:
            p = np.array(chim)
            cu = (p @ R) / WORLD_H                       # box-relative: x from the centre, y from the bottom
            cvv = (p @ U) / WORLD_H + ORIGIN_V
            print(f'variant {v} chimney top: x {cu:+.4f} y {cvv:.4f}')
        else:
            print(f'variant {v} no chimney')
    Image.fromarray(atlas, 'RGBA').save(out, optimize=True)
    if prev:
        preview(atlas).save(prev)


if __name__ == '__main__':
    main()
