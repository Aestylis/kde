#version 440
// Silent County Road — procedural pixel-art winter night (Plasma 6 wallpaper).
// One pass: every screen pixel is snapped to a coarse pixel grid, the scene is evaluated analytically at that grid
// pixel, then ordered-dithered into a fixed 16-colour palette. No textures, no CPU-side state:
//   SCENE  sky, tree lines (far: procedural; groves + near: grown spruces from images/trees.png), road + snowbanks, poles, wire, streetlamps, fence (static, from fixed layout + hashes)
//   LIGHT  two warm lamp pools / cones / halos
//   FOG    slow value-noise fog, thickest near the horizon, warmed inside lamplight
//   SNOW   hash-generated flakes in 3 depth layers + rare near flakes; nearly invisible unless lamp-lit; one shared
//          gusty wind (windX / gustAt) drifts the flakes, sways the trees, bends the smoke and lifts blowing snow
//   WIND   slow "moods" from layered low-frequency noise (calm / drift / whisper gust)
//   FLICKER lamps burn steady, then rarely stutter for a few seconds (the far lamp is the dying one)
//   WINTER `erosion` (0..1, driven by the real clock) thickens fog, softens the road edge, buries the fence,
//          and grows snow caps; `roadCover` is snow lying on the road itself
//   DAY    `day` 0..1 / `twi` 0..1 / `rising` re-light the whole scene from the real sun: night -> blue hour -> rose
//          dawn or orange dusk -> overcast winter day. Lamps switch off by day and stutter back on at dusk.
//   TRAFFIC cars, pickups and vans in either direction (lanes, perspective speed); headlights / tail lights at
//          night; tyre tracks in the road snow that fill back in over ~10 minutes
//   WIRES  snow ridges build on the wires overnight; through the late morning sections shed it in falling clumps
//   WILDLIFE CC0 sprites (ScratchIO, OpenGameArt): a deer by day (walk cycle, grazing pauses), a fox by night;
//          real-world size on the road's scale, dithered edges, lit by the scene
//   BIRDS  by day a small flock flies in, perches on the wire for a few minutes (the odd hop), then leaves
//   PLOUGH once each morning a small plough with an amber beacon crawls up the road, leaving ploughed lanes.
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float time;      // session seconds
    float pix;       // pixel-art block size, item units
    float snowAmt;   // 0..1
    float fogAmt;    // 0..1
    float windAmt;   // 0..1
    float erosion;   // 0..1
    float flickerAmt;// 0..2 (1 = default)
    float day;       // 0 night .. 1 full daylight
    float twi;       // twilight strength (peaks at sunrise / sunset)
    float rising;    // 1 morning, 0 evening (dawn rose vs dusk orange)
    float lamps;     // 1 lamps on, 0 off
    float lampAge;   // seconds since the lamps last switched on (startup stutter)
    float roadCover; // 0 ploughed .. 1 deep snow on the road
    float plough;    // <0 none, 0..1 progress of the plough from the bottom of the screen to the horizon
    float sunX;      // sun position across the screen (0..1 of width) and its elevation in degrees
    float sunElev;
    vec4 veh;        // active vehicle: progress 0..1 (<0 none), dir (+1 away / -1 toward), type 0 car 1 pickup 2 van, colour 0..4
    vec4 tracks;     // tyre-track strength: x = right lane (away), y = left lane (toward)
    vec4 birds;      // x = seconds since the flock's event began (<0 none), y = count, z = arrival side (+1 right / -1 left), w = perch seconds
    float birdSeed;
    float wireSnow;  // 0..1 snow lying on the wires
    float meltStart; // clock second (same base as `time`) when wires start shedding today; meltDur = shedding window
    float meltDur;
    vec4 animal;     // x (uv; < -50 none), depth t, dir (+1 right / -1 left), type (0 deer, 1 fox)
    vec4 animal2;    // walk phase (radians), graze/sniff 0..1, buck (0/1), unused
    float treeSnow;  // 0..1 snow lying on the spruces (builds overnight, melts by day down to ~0.4)
    vec4 belt;       // x = anti-sun point across the screen (0..1 of width, may lie off-screen), y = degrees per screen width
    vec4 windKnock;  // x = how much wire snow the wind has shaken off since sunset (0..0.45), y = the same 1.6 s ago
    float localHour; // local clock hour 0..24 (the preview hour when previewing): drives the house windows / chimneys
    vec2 res;        // item size
};
layout(binding = 1) uniform sampler2D atlas;     // wildlife sprite atlas (see contents/images/CREDITS.md)
layout(binding = 3) uniform sampler2D houseAtlas; // farmhouse, cabin, barn, cottage: normal, material*32+ao / window id (tools/gen_houses.py)
layout(binding = 2) uniform sampler2D treeAtlas; // grown spruces: normal.xy, material*64+ao, coverage (tools/gen_trees.py)

// ------------------------------------------------------------------ utilities
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 hash22(vec2 p) { float n = hash21(p); return vec2(n, hash21(p + n + 17.3)); }
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
uint pcg(uint v) { uint st = v * 747796405u + 2891336453u; uint w = ((st >> ((st >> 28u) + 4u)) ^ st) * 277803737u; return (w >> 22u) ^ w; }
float uh(vec2 c, float salt) { ivec2 i = ivec2(floor(c)); return float(pcg(uint(i.x) * 1973u ^ pcg(uint(i.y) * 9277u + uint(salt)))) / 4294967295.0; }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
float noise1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash11(i), hash11(i + 1.0), f); }
// ---- one wind for the whole scene: windX = how far the air has carried things (pixels, at the snow's scale), and
//      gustAt = how hard it is blowing right now (0 calm .. 1 strong gust). Snow drifts by windX; trees, smoke and
//      blowing ground snow follow gustAt. Sampled with a delay by screen x, a gust visibly travels across the scene.
float wnoise(float x, uint salt) {                      // integer-hashed 1D value noise: identical on every GPU
    float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(float(pcg(uint(i) + salt)) / 4294967295.0, float(pcg(uint(i) + 1u + salt)) / 4294967295.0, f);
}
float windX(float t) {                                  // steady drift + wander, never blowing backwards
    return windAmt * (t * 2.4 + 41.0 * wnoise(t / 40.0, 7001u) + 5.0 * wnoise(t / 9.0, 9113u));
}
// mountain ridgeline height (0..1) at x: ridged noise (sharp crests, soft valleys) under a slow envelope of big and small peaks
float ridge1(float x, uint salt) {                     // ridged noise with a rounded crest (smooth abs): shoulders, not spikes
    float a = 2.0 * wnoise(x, salt) - 1.0, k = 0.22;
    return 1.0 - (sqrt(a * a + k * k) - k) / (sqrt(1.0 + k * k) - k);
}
float ridgeH(float x, uint salt) {                      // ridged multifractal: pointed summits, wide valleys, big + small peaks
    x += 0.55 * (wnoise(x * 0.7, salt + 71u) - 0.5) + 0.18 * (wnoise(x * 2.9, salt + 89u) - 0.5);   // domain warp: uneven spacing, leaning peaks
    float r0 = ridge1(x, salt), r1 = ridge1(x * 2.1 + 5.0, salt + 17u), r2 = ridge1(x * 3.4 + 1.3, salt + 31u);
    float h = 0.62 * pow(r0, 1.5) + 0.26 * r1 * r1 * (0.4 + 0.6 * r0) + 0.12 * r2 * r2 * (0.3 + 0.7 * r0);
    return h * (0.30 + 0.70 * smoothstep(0.15, 0.85, wnoise(x * 0.42, salt + 53u)));
}
float rockR(vec2 q) {                                   // ridged rock texture: buttresses (1) and gullies (0)
    float n1 = 1.0 - abs(2.0 * vnoise(q) - 1.0), n2 = 1.0 - abs(2.0 * vnoise(q * 2.2 + 4.0) - 1.0);
    return 0.65 * n1 * n1 + 0.35 * n2;
}
float gustAt(float t) {
    float v = (windX(t + 0.5) - windX(t - 0.5)) / max(windAmt, 1e-3);   // px/s at wind 1: ~1.1 lull .. 2.4 mean .. 3.6 gust
    return clamp((v - 2.4) / 1.2, -0.5, 1.0);
}
// wires swing in the wind: each span's sag breathes with the gusts (blowing toward / away from the viewer), each
// span on its own rhythm, the gust reaching spans in turn as it crosses the scene
float wireSwing(float k, float x) {
    if (windAmt < 0.01) return 1.0;
    float g = gustAt(time - x * 2.0);
    return 1.0 + min(windAmt, 2.0) * (0.16 * max(g, 0.0) + 0.07 * sin(time * (1.1 + 0.3 * hash11(k + 3.1)) + k * 1.7) * (0.35 + max(g, 0.0)));
}
float bayer4(vec2 q) {
    int x = int(mod(q.x, 4.0)), y = int(mod(q.y, 4.0));
    int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
    return (float(m[y * 4 + x]) + 0.5) / 16.0;
}

// ---- palettes: one hand-picked 16-colour set per phase; the active palette blends between them each frame
//      (night <-> day by sun height, then toward dusk or dawn during twilight); entries 16-19 are each phase's sky blues, 21-22 barn reds.
//      PAL_TAIL is reserved for the plough.
const vec3 PAL_NIGHT[23] = vec3[23](
    vec3(0.027, 0.035, 0.051), vec3(0.051, 0.067, 0.094), vec3(0.075, 0.098, 0.145), vec3(0.106, 0.133, 0.192),
    vec3(0.137, 0.173, 0.239), vec3(0.176, 0.216, 0.286), vec3(0.227, 0.271, 0.349), vec3(0.290, 0.337, 0.420),
    vec3(0.369, 0.416, 0.502), vec3(0.463, 0.510, 0.604), vec3(0.580, 0.627, 0.714), vec3(0.765, 0.796, 0.847),
    vec3(0.231, 0.188, 0.149), vec3(0.431, 0.329, 0.208), vec3(0.706, 0.541, 0.322), vec3(0.941, 0.827, 0.627),
    vec3(0.050, 0.070, 0.140), vec3(0.080, 0.110, 0.220), vec3(0.120, 0.170, 0.320), vec3(0.200, 0.270, 0.450),
    vec3(0.070, 0.090, 0.100),
    vec3(0.290, 0.105, 0.095), vec3(0.170, 0.070, 0.070));
const vec3 PAL_DAY[23] = vec3[23](
    vec3(0.100, 0.120, 0.120), vec3(0.160, 0.200, 0.190), vec3(0.205, 0.210, 0.220), vec3(0.300, 0.330, 0.360),
    vec3(0.400, 0.440, 0.480), vec3(0.480, 0.520, 0.570), vec3(0.580, 0.630, 0.690), vec3(0.660, 0.710, 0.770),
    vec3(0.740, 0.780, 0.830), vec3(0.820, 0.850, 0.890), vec3(0.890, 0.910, 0.940), vec3(0.950, 0.960, 0.970),
    vec3(0.550, 0.330, 0.140), vec3(0.800, 0.520, 0.200), vec3(0.450, 0.460, 0.480), vec3(1.000, 0.800, 0.450),
    vec3(0.300, 0.460, 0.740), vec3(0.420, 0.580, 0.830), vec3(0.560, 0.690, 0.880), vec3(0.700, 0.800, 0.930),
    vec3(0.270, 0.340, 0.280),
    vec3(0.560, 0.170, 0.130), vec3(0.370, 0.120, 0.100));
const vec3 PAL_DUSK[23] = vec3[23](
    vec3(0.050, 0.050, 0.090), vec3(0.090, 0.090, 0.150), vec3(0.140, 0.130, 0.210), vec3(0.200, 0.180, 0.280),
    vec3(0.280, 0.240, 0.340), vec3(0.380, 0.300, 0.380), vec3(0.500, 0.380, 0.420), vec3(0.640, 0.460, 0.420),
    vec3(0.780, 0.540, 0.380), vec3(0.900, 0.620, 0.360), vec3(0.960, 0.740, 0.480), vec3(0.990, 0.860, 0.640),
    vec3(0.231, 0.188, 0.149), vec3(0.431, 0.329, 0.208), vec3(0.706, 0.541, 0.322), vec3(0.941, 0.827, 0.627),
    vec3(0.080, 0.100, 0.220), vec3(0.130, 0.170, 0.340), vec3(0.200, 0.250, 0.460), vec3(0.300, 0.360, 0.580),
    vec3(0.360, 0.260, 0.220),
    vec3(0.580, 0.210, 0.150), vec3(0.360, 0.130, 0.110));
const vec3 PAL_DAWN[23] = vec3[23](
    vec3(0.060, 0.060, 0.100), vec3(0.100, 0.110, 0.170), vec3(0.160, 0.170, 0.250), vec3(0.240, 0.250, 0.340),
    vec3(0.340, 0.340, 0.440), vec3(0.460, 0.430, 0.520), vec3(0.600, 0.520, 0.600), vec3(0.740, 0.600, 0.660),
    vec3(0.860, 0.680, 0.660), vec3(0.930, 0.780, 0.700), vec3(0.970, 0.880, 0.800), vec3(0.990, 0.950, 0.900),
    vec3(0.231, 0.188, 0.149), vec3(0.431, 0.329, 0.208), vec3(0.706, 0.541, 0.322), vec3(0.941, 0.827, 0.627),
    vec3(0.090, 0.120, 0.250), vec3(0.150, 0.210, 0.400), vec3(0.240, 0.330, 0.560), vec3(0.380, 0.480, 0.700),
    vec3(0.300, 0.270, 0.300),
    vec3(0.540, 0.200, 0.180), vec3(0.340, 0.130, 0.130));
const vec3 PAL_TAIL = vec3(0.702, 0.235, 0.188);
// interleaved gradient noise (Jimenez): blue-noise-like thresholds from one line, no texture. Used for the sky, clouds and
// mountains, where Bayer's crosshatch shows in smooth gradients; objects keep Bayer's crisp pattern (as in Obra Dinn).
float ign(vec2 q) { return fract(52.9829189 * fract(dot(q, vec2(0.06711056, 0.00583715)))); }
vec3 quantize(vec3 c, vec2 q, bool env) {
    c += ((env ? ign(q) : bayer4(q)) - 0.5) * 0.075;     // strong enough to bridge the wider steps in the dusk/dawn palettes
    float bd = 1e9; vec3 best = vec3(0.0);
    for (int i = 0; i < 23; i++) {
        vec3 pc = mix(mix(PAL_NIGHT[i], PAL_DAY[i], day), mix(PAL_DUSK[i], PAL_DAWN[i], rising), twi * 0.85);
        vec3 d = c - pc; float e = dot(d, d * vec3(1.0, 1.25, 0.9));
        if (e < bd) { bd = e; best = pc; }
    }
    return best;
}

// night colour -> day colour, by the global `day`
vec3 DN(vec3 night, vec3 dayc) { return mix(night, dayc, day); }

float gCover;
float cloudField(vec2 p) {
    vec2 cp = vec2(p.x * 2.2 + time * 0.0025, p.y * 4.5 + 3.0);
    cp += 0.45 * vec2(fbm(cp * 0.6 + 3.1), fbm(cp * 0.6 + 7.7));
    float d = fbm(cp) * 0.75 + fbm(cp * 2.3 + vec2(time * 0.004, 0.0)) * 0.35;
    return clamp((d - gCover) / 0.30, 0.0, 1.0);
}
float cloudLight(vec2 p, vec2 lightPos) {
    vec2 dir = normalize(lightPos - p);
    float acc = 0.0;
    for (int i = 1; i <= 6; i++) acc += cloudField(p + dir * 0.022 * float(i));
    return exp(-acc * 0.5);
}

// ------------------------------------------------------------------ layout (uv: y up, 0..1 tall, 0..A wide)
const float HZ = 0.40;           // horizon
float A;                         // aspect
vec2 VP;                         // road vanishing point
float px1;                       // one pixel in uv

float roadT(float y) { return clamp((HZ - y) / HZ, 0.0, 1.0); }               // 0 at horizon, 1 at bottom
float roadCx(float y) { float t = roadT(y); return VP.x + t * (A * 0.41 - VP.x) + 0.02 * A * t * t; }   // both edges fan out from the VP
float roadHw(float y) { float t = roadT(y); return 0.0005 + t * 0.26; }   // converges to the vanishing point

// Utility pole k of a line receding along the right verge (k = 0 is the near one). Perspective: depth t halves-ish
// per pole; lateral offset, height, crossarm and wire sag all scale with t.
struct Pole { float t; vec2 base; vec2 top; float armY; vec2 armL; vec2 armR; float wpx; };
Pole pole(int k) {
    Pole P;
    P.t = 0.375 / (1.0 + 1.2 * float(k));
    float gy = HZ - P.t * HZ;
    P.base = vec2(roadCx(gy) + 1.86 * P.t, gy);
    P.top = vec2(P.base.x + (k == 0 ? 0.012 : 0.0), gy + 0.90 * P.t);    // ~12 m above ground (1 t ~ 14 m: a lane is 0.26 t); the near one leans
    P.armY = P.top.y - 0.107 * P.t;
    P.armL = vec2(P.top.x - 0.133 * P.t, P.armY);
    P.armR = vec2(P.top.x + 0.120 * P.t, P.armY);
    P.wpx = max(1.0, 2.0 * P.t / 0.375);
    return P;
}
// sagging wire from a to b: true if p is on it (thickness corrected for slope so steep spans have no gaps)
bool onWire(vec2 p, vec2 a, vec2 b, float sag) {
    if (p.x < min(a.x, b.x) || p.x > max(a.x, b.x)) return false;
    float dxab = b.x - a.x;
    float s = (p.x - a.x) / dxab;
    float y = mix(a.y, b.y, s) - sag * 4.0 * s * (1.0 - s);
    float slope = (b.y - a.y) / dxab - sag * 4.0 * (1.0 - 2.0 * s) / dxab;
    return abs(p.y - y) < px1 * min(0.5 * sqrt(1.0 + slope * slope), 3.0);
}
// height of the sagging wire at x, and how far along the span (0..1) x is
float wireY(float x, vec2 a, vec2 b, float sag, out float s) {
    s = (x - a.x) / (b.x - a.x);
    return mix(a.y, b.y, s) - sag * 4.0 * s * (1.0 - s);
}

// spruce silhouette: cell grid along x, returns 1 inside a tree; tip = 1 on snowy tier tips
float spruces(vec2 p, float baseY, float cw, float hMin, float hMax, float seed, float gapX, float gapW, out float tip) {
    tip = 0.0;
    float inside = 0.0;
    float ci = floor(p.x / cw);
    for (int k = -1; k <= 1; k++) {
        float c = ci + float(k);
        float r1 = hash11(c * 3.17 + seed), r2 = hash11(c * 7.31 + seed * 2.0);
        float cx = (c + 0.5 + (r1 - 0.5) * 0.7) * cw;
        float h = mix(hMin, hMax, r2);
        h *= smoothstep(0.0, gapW, abs(cx - gapX));                 // opening where the road leaves
        float y = p.y - baseY;
        if (y < 0.0 || y > h) continue;
        float tiers = 5.0 + floor(r1 * 3.0);
        float s = fract((y / h) * tiers);                            // 0 at bottom of tier, 1 at top
        float hw = (h - y) * 0.30 * (0.62 + 0.38 * (1.0 - s));      // jagged tiers
        hw = max(hw, px1 * 0.8);                                     // trunk / tip at least a pixel
        if (abs(p.x - cx) < hw) {
            inside = 1.0;
            if (s > 0.90 && abs(p.x - cx) > hw * 0.5) tip = 1.0;    // snow resting on tier ends
        }
    }
    return inside;
}

// one grown spruce from the tree atlas: base y, centre x, height (uv); picks the size bucket at or just above the
// needed height so pixel art is only ever reduced (by < 2x), never smeared. tx = the relightable texel when inside.
bool treeSprite(vec2 p, float gy, float cx, float h, float seed, out vec4 tx) {
    tx = vec4(0.0);
    float hpx = h / px1;
    if (p.y < gy || p.y > gy + h || abs(p.x - cx) > 0.40 * h) return false;
    int b = hpx <= 40.0 ? 3 : hpx <= 80.0 ? 2 : hpx <= 160.0 ? 1 : 0;
    int bh = b == 0 ? 320 : b == 1 ? 160 : b == 2 ? 80 : 40;
    int y0 = b == 0 ? 0 : b == 1 ? 320 : b == 2 ? 480 : 560;
    int bw = int(float(bh) * 0.75);
    float sc = float(bh) / hpx;
    int ix = int(floor((p.x - cx) / px1 * sc + float(bw) * 0.5));
    int iy = int(floor((p.y - gy) / px1 * sc));
    if (iy < 0 || iy >= bh) return false;
    if (windAmt > 0.01) {                                   // sway: tops move, trunk base stays planted; whole texels only
        float hgt = float(iy) / float(bh);
        float g = gustAt(time - cx * 2.0);
        float lean = 0.25 + 0.75 * g + 0.12 * sin(time * (1.4 + 0.4 * hash11(seed)) + seed * 5.0) * (0.4 + g);
        ix -= int(floor(0.020 * float(bh) * min(windAmt, 2.0) * hgt * hgt * lean + 0.5));
    }
    if (ix < 0 || ix >= bw) return false;
    int v = int(hash11(seed * 1.37 + 0.5) * 11.999);
    bool flip = hash11(seed * 2.71 + 3.0) < 0.5;
    if (flip) ix = bw - 1 - ix;
    tx = texelFetch(treeAtlas, ivec2(v * bw + ix, y0 + bh - 1 - iy), 0);
    if (tx.a < 0.5) return false;
    if (flip) tx.r = 1.0 - tx.r;
    tx.a = uh(vec2(float(ix / 3), float(iy / 2)), seed * 3.0 + float(b));   // clump hash: snow melts in patches, not specks
    return true;
}

// one building from the house atlas (box 1.6 x hb wide, ground origin 0.10 hb above the box bottom, at its centre)
bool houseSprite(vec2 p, float gy, float cx, float hb, int v, bool flip, out vec4 tx) {
    tx = vec4(0.0);
    float bot = gy - 0.10 * hb;
    if (p.y < bot || p.y > bot + hb || abs(p.x - cx) > 0.8 * hb) return false;
    float hpx = hb / px1;
    int b = hpx <= 24.0 ? 2 : hpx <= 48.0 ? 1 : 0;
    int bh = b == 0 ? 96 : b == 1 ? 48 : 24;
    int y0 = b == 0 ? 0 : b == 1 ? 96 : 144;
    int bw = int(float(bh) * 1.6);
    float sc = float(bh) / hpx;
    int ix = int(floor((p.x - cx) / px1 * sc + float(bw) * 0.5));
    int iy = int(floor((p.y - bot) / px1 * sc));
    if (ix < 0 || iy < 0 || ix >= bw || iy >= bh) return false;
    if (flip) ix = bw - 1 - ix;
    tx = texelFetch(houseAtlas, ivec2(v * bw + ix, y0 + bh - 1 - iy), 0);
    if (tx.a < 0.5) return false;
    if (flip && floor(tx.b * 255.0 / 32.0 + 0.002) != 3.0) tx.r = 1.0 - tx.r;
    return true;
}
// window schedule: 0 dark, 1 lamp-lit, 2 television. Lights come on after dark, go off one by one late in the
// evening (21:00 - 00:30), a few come on again before dawn; some rooms stay dark all night.
int windowState(int house, int w) {
    if (lamps < 0.5) return 0;
    float s = hash11(float(house) * 13.17 + float(w) * 3.71 + 0.3);
    if (s < 0.22) return 0;
    float off = 21.0 + 3.5 * hash11(float(house) * 7.3 + float(w) * 1.9 + 5.0);
    float morn = 5.0 + 2.2 * hash11(float(house) * 2.9 + float(w) * 4.3 + 9.0);
    float h = localHour;
    bool on = h >= 13.0 ? h < off : (h < 4.0 ? h + 24.0 < off : h >= morn);
    if (!on) return 0;
    if (s < 0.30 && h >= 18.5 && h < min(off, 23.5)) return 2;
    return 1;
}

// distance (in pixels) to a segment
float segPx(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) / px1; }

// Snow on a wire: a ridge on top (2 px on near, heavy spans), shed section by section through the late morning; the
// section that just dropped falls as a clump that breaks into a puff (near spans only).
void snowOnWire(inout vec3 col, vec2 p, vec2 a, vec2 b, float sag, float span, float w, bool near) {
    if (wireSnow <= 0.12 && meltStart <= -1.0) return;
    if (p.x < min(a.x, b.x) || p.x > max(a.x, b.x)) return;
    float sw; float yw = wireY(p.x, a, b, sag, sw);
    float seg = floor(sw * 14.0);
    float hs = hash11(seg * 7.13 + span * 13.31 + w * 3.77);
    float since = mod(time - meltStart + 43200.0, 86400.0) - 43200.0 - hs * meltDur;   // s since this section dropped
    bool fallen = meltStart > -1.0 && since > 0.0;
    float frag = hash11(seg * 5.71 + span * 9.13 + w * 2.93 + 0.7);                   // how easily the wind shakes it loose
    if (frag < windKnock.x) {                                                           // knocked off by a gust
        fallen = true;
        if (frag >= windKnock.y) since = 1.6 * (windKnock.x - frag) / max(windKnock.x - windKnock.y, 1e-4);   // just now
        else since = max(since, 99.0);
    }
    float thick = (near && wireSnow > 0.6) ? 2.0 : 1.0;
    if (!fallen && wireSnow > 0.12 && p.y > yw + 0.5 * px1 && p.y < yw + (0.5 + thick) * px1)
        col = DN(vec3(0.40, 0.44, 0.52), vec3(0.93, 0.95, 0.96));
    if (near && fallen && since > 0.0 && since < 1.6 && wireSnow > 0.12) {
        float cy = yw - 0.30 * since * since;                                          // gravity
        float spread = since * 2.5;                                                     // px: the clump breaks up
        vec2 dd = vec2(p.x - (a.x + (seg + 0.5) / 14.0 * (b.x - a.x)), p.y - cy) / px1;
        if (abs(dd.x) < 1.0 + spread && abs(dd.y) < 1.0 + spread * 0.6) {
            float hp = hash11(floor(dd.x) * 3.1 + floor(dd.y) * 7.7 + seg + span * 11.0);
            if (hp > 0.35 + 0.12 * spread) col = DN(vec3(0.44, 0.48, 0.56), vec3(0.95, 0.96, 0.97));
        }
    }
}

// ---- wildlife sprites: atlas rows (y offset, frame size): deer walk / deer graze / fox walk / fox idle
vec4 spriteTexel(int row, int f, vec2 sp) {                 // sp: sprite pixel, origin at the feet (bottom-left)
    ivec2 fs = row < 2 ? ivec2(72, 52) : ivec2(64, 36);
    int y0 = row == 0 ? 0 : row == 1 ? 52 : row == 2 ? 104 : 140;
    ivec2 ip = ivec2(floor(sp));
    if (ip.x < 0 || ip.y < 0 || ip.x >= fs.x || ip.y >= fs.y) return vec4(0.0);
    return texelFetch(atlas, ivec2(f * fs.x + ip.x, y0 + fs.y - 1 - ip.y), 0);
}

// lamp light at p, LutLight-style: smooth shapes, then snapped to a few dithered steps (see lightSteps) so lit pixels land
// on clean palette bands instead of a soft glob. head = lamp head, g = ground y under it, k = perspective size.
// Returns the ground pool; `cone` = the beam seen in the air (falling snow / mist), `halo` = the disc round the head.
float lampLight(vec2 p, vec2 head, float g, float k, float strength, out float halo, out float cone) {
    vec2 d = p - head;
    float hr = length(d) / (0.030 * k);
    halo = strength * clamp(1.0 - hr, 0.0, 1.0);
    halo *= halo;
    cone = 0.0;
    float top = head.y - 0.008 * k, H = top - g, below = top - p.y;
    if (below > 0.0 && below < H + 0.012 * k) {
        float r = 0.010 * k + below * (0.13 / max(H, 1e-4)) * k;          // beam widens to the pool's width at the ground
        float ax = abs(d.x) / r;
        cone = (1.0 - smoothstep(0.88, 1.0, ax))                         // hard edge
             * (1.0 - 0.35 * ax)                                         // a touch brighter down the middle
             * mix(1.0, 0.45, clamp(below / H, 0.0, 1.0)) * strength;    // fades as it spreads
    }
    vec2 pd = vec2((p.x - head.x) / (0.16 * k), (p.y - g) / (0.036 * k));
    float r2 = dot(pd, pd);
    return strength * pow(clamp(1.0 - r2, 0.0, 1.0), 0.8);
}
// snap a light level to n bands, with a 4x4-dithered seam between neighbouring bands
float lightSteps(float x, float n, vec2 q) {
    return clamp(floor(x * n + 0.5 + (bayer4(q) - 0.5) * 0.4) / n, 0.0, 1.0);    // narrow dithered seam, flat bands
}

// Lamp flicker: time is split into windows; a window hosts a stutter episode with probability `chance`.
// Inside the episode the lamp jumps between dim/off/on at ~12 Hz, with brief full blackouts. Returns intensity 0..1.
float flicker(float t, float seed, float window, float chance) {
    float w = floor(t / window);
    if (hash11(w * 1.731 + seed) > chance) return 1.0;
    float start = hash11(w * 3.17 + seed) * (window - 6.0);
    float len = 1.2 + hash11(w * 5.91 + seed) * 3.8;
    float local = t - w * window - start;
    if (local < 0.0 || local > len) return 1.0;
    float tick = floor(t * 12.0);
    float r = hash11(tick * 0.917 + seed);
    float dead = step(0.82, hash11(floor(t * 3.0) * 1.37 + seed));           // ~1/3 s blackouts
    return mix(r < 0.45 ? 0.08 : r < 0.75 ? 0.55 : 1.0, 0.04, dead);
}

// ---- scene layout tables (shared by drawing and by the cast shadows)
//                     variant, depth t, lateral offset (world), wall colour
const vec4 HOUSES[4] = vec4[4](vec4(0.0, 0.150, 2.6, 0.0), vec4(2.0, 0.132, 4.6, 2.0),
                               vec4(1.0, 0.120, -2.4, 1.0), vec4(3.0, 0.080, -4.6, 3.0));
// near framing spruces, hand placed (x from the left edge / right edge, base y, height)
const vec3 LEFT[6]  = vec3[6](vec3(0.03, 0.24, 0.66), vec3(0.11, 0.27, 0.50), vec3(0.18, 0.25, 0.72),
                             vec3(0.27, 0.29, 0.40), vec3(0.34, 0.31, 0.27), vec3(0.075, 0.30, 0.34));
const vec3 RIGHT[5] = vec3[5](vec3(0.03, 0.23, 0.74), vec3(0.12, 0.26, 0.56), vec3(0.20, 0.28, 0.42),
                             vec3(0.27, 0.30, 0.30), vec3(0.085, 0.29, 0.36));

// a middle-grove spruce: both sides of the road, set back, perspective-scaled; false where a house yard keeps it clear
bool groveTree(int side, int i, out float tT, out float gy, out float cxT, out float h) {
    float hs = hash11(float(i) * 3.71 + float(side) * 17.3);
    tT = 0.07 + 0.17 * hash11(float(i) * 9.13 + float(side) * 5.1);
    gy = HZ - tT * HZ;
    float lat = side == 0 ? -(1.5 + 4.0 * hs) : (2.4 + 4.5 * hs);           // world lateral offset (beyond the poles on the right)
    cxT = roadCx(gy) + roadHw(gy) * sign(lat) + lat * tT;
    h = (1.1 + 0.9 * hash11(float(i) * 5.3 + float(side))) * tT;
    for (int hI = 0; hI < 4; hI++) {                                        // the yard, and a sight line to it
        float dT = tT - HOUSES[hI].y, dL = abs(lat - HOUSES[hI].z);
        if ((abs(dT) < 0.035 && dL < 1.9) || (dT > 0.0 && dT < 0.09 && dL < 0.9)) return false;
    }
    return true;
}

// ---- cast shadows on the ground plane, in world metres. The scene's perspective has focal length 1 (uv) and
//      1 t ~ 13 m, so a ground pixel at depth t sits at lateral X = (x - VP.x) * WSC / t, distance Z = WSC / t.
const float WSC = 13.04;
vec2 groundW(float x, float t) { return vec2((x - VP.x) * WSC / t, WSC / t); }
// shadow of a vertical caster at c (height H) thrown along dir for length L: kind 0 spruce (cone, crown radius r),
// 1 house (capsule radius r), 2 pole / post (line, half-width r). pxm = one pixel in metres at this depth (min width).
bool inShadow(vec2 g, vec2 c, vec2 dir, float L, float r, int kind, float pxm) {
    vec2 v = g - c;
    float along = dot(v, dir), perp = abs(dot(v, vec2(-dir.y, dir.x)));
    if (kind == 1) { float s = clamp(along, 0.0, L); return length(v - dir * s) < r; }
    if (along < -r || along > L) return false;
    float s = along / L;
    float w = kind == 0 ? (s < 0.08 ? 0.25 : r * (1.0 - s) * (0.85 + 0.3 * hash11(floor(along * 1.7) + c.x))) : r;
    return perp < max(w, 0.5 * pxm);
}

void main() {
    // coarse pixel grid
    vec2 W = floor(res / pix);
    vec2 q = floor(qt_TexCoord0 * res / pix);
    q.y = W.y - 1.0 - q.y;                         // y up
    vec2 p = (q + 0.5) / W.y;                      // uv
    A = W.x / W.y;
    px1 = 1.0 / W.y;
    VP = vec2(A * 0.36, HZ);
    float e = erosion;

    // ---------------- LIGHT (two streetlamps along the left verge)
    // every lamp follows one perspective rule (depth t): post 0.11 t back from the verge, height 0.64 t, arm 0.19 t
    float lt1 = 0.50, lt2 = 0.1125;
    float g1 = HZ - lt1 * HZ, g2 = HZ - lt2 * HZ;
    float post1 = roadCx(g1) - roadHw(g1) - 0.11 * lt1, post2 = roadCx(g2) - roadHw(g2) - 0.11 * lt2;
    vec2 lamp1 = vec2(post1 + 0.19 * lt1, g1 + 0.64 * lt1);
    vec2 lamp2 = vec2(post2 + 0.19 * lt2, g2 + 0.64 * lt2);
    float f1 = mix(1.0, flicker(time, 3.0, 90.0, 0.35 * max(flickerAmt, 1.0)), min(flickerAmt, 1.0));           // near lamp: rare stutters
    float f2 = mix(1.0, flicker(time + 7.0, 11.0, 40.0, 0.40 * max(flickerAmt, 1.0)), min(flickerAmt, 1.0));    // far lamp: dying, more often
    // switched off by day; on switch-on they stutter for a few seconds before settling
    float boot1 = lampAge < 5.0 ? mix(step(0.45, hash11(floor(lampAge * 9.0) + 3.0)), 1.0, smoothstep(2.5, 5.0, lampAge)) : 1.0;
    float boot2 = lampAge < 6.5 ? mix(step(0.55, hash11(floor(lampAge * 7.0) + 9.0)), 1.0, smoothstep(4.0, 6.5, lampAge)) : 1.0;
    f1 *= lamps * boot1;
    f2 *= lamps * boot2;
    float h1, h2, c1, c2;
    f1 = f1 > 0.6 ? 1.0 : f1 > 0.2 ? 0.5 : 0.0;     // flicker in clean steps: a stutter blinks, it doesn't crawl through the bands
    f2 = f2 > 0.6 ? 1.0 : f2 > 0.2 ? 0.5 : 0.0;
    // overlapping lamps take the brighter one (never the sum), and the far lamp is too far off to show a beam
    float pool = max(lampLight(p, lamp1, g1, 1.0, 1.0, h1, c1) * f1, lampLight(p, lamp2, g2, lt2 / lt1, 0.8, h2, c2) * f2);
    float halo = lightSteps(max(h1 * f1, h2 * f2), 3.0, q);
    float beam = lightSteps(c1 * f1, 2.0, q);
    pool = lightSteps(pool, 4.0, q);
    float L = max(pool, beam * 0.8);           // what lit surfaces / flakes / animals see
    vec3 warm = vec3(0.86, 0.66, 0.40);

    // ---------------- SKY
    float sk = clamp((p.y - HZ) / (1.0 - HZ), 0.0, 1.0);
    vec3 glow = mix(vec3(0.95, 0.58, 0.36), vec3(0.88, 0.60, 0.64), rising);      // dusk orange / dawn rose
    vec3 col = mix(DN(vec3(0.115, 0.14, 0.20), vec3(0.74, 0.82, 0.92)), DN(vec3(0.045, 0.06, 0.11), vec3(0.44, 0.60, 0.84)), pow(sk, 0.6));
    col = mix(col, vec3(0.20, 0.26, 0.46), twi * 0.38 * smoothstep(0.35, 1.0, sk));      // blue hour overhead (soft: the sky screen carries most of it)
    col = mix(col, glow, twi * 0.75 * exp(-sk * 3.0));                             // horizon glow at dawn/dusk
    // clouds: same recipe + lighting as the sky screen, thinning toward the horizon so the two monitors read as one sky
    if (p.y > HZ) {
        gCover = mix(0.46, 0.36, e) + 0.12 * (1.0 - smoothstep(HZ, HZ + 0.35, p.y));
        float dens = cloudField(p);
        float cl = smoothstep(0.0, 0.25, dens);
        if (cl > 0.0) {
            bool bySun = day > 0.35 || twi > 0.25;
            vec2 lightPos = bySun ? vec2(sunX * A, HZ + sunElev * 0.035) : vec2(A * 0.66, 1.6);   // moon: up on the sky screen
            vec3 lightCol = bySun ? mix(mix(vec3(1.0, 0.72, 0.42), vec3(0.98, 0.72, 0.70), rising), vec3(1.0, 0.98, 0.93), day)
                                  : vec3(0.50, 0.56, 0.68);
            vec3 shadowCol = mix(DN(vec3(0.06, 0.07, 0.11), vec3(0.54, 0.59, 0.67)), vec3(0.30, 0.23, 0.32), twi * (1.0 - day));
            vec3 cc = mix(shadowCol, lightCol, 0.12 + 0.88 * cloudLight(p, lightPos) * (bySun ? mix(0.75, 1.0, day) : 0.8));
            cc *= mix(1.0, 0.90, smoothstep(0.55, 1.0, dens));
            float above = 0.0;
            for (int i = 1; i <= 4; i++) above += cloudField(p + vec2(0.0, 0.03 * float(i)));
            cc *= mix(1.0, 0.68, smoothstep(0.4, 3.2, above));
            cc += lightCol * (1.0 - cl) * exp(-length(p - lightPos) * 3.0) * 0.55;
            col = mix(col, cc, cl * 0.9);
        }
    }
    // Earth's shadow and the Belt of Venus: at twilight, opposite the sun, a dark blue band rises from the horizon as the sun
    // sinks, with a pink band above it; both fade with angular distance from the anti-sun point.
    // Applied after the clouds: low clouds over there take the same pink light and the same shadow
    if (sunElev < 3.0 && sunElev > -9.0 && p.y > HZ) {
        float dAz = (p.x / A - belt.x) * belt.y;                                     // degrees from the anti-sun azimuth
        float reach = exp(-pow(dAz / 75.0, 2.0)) * smoothstep(-9.0, -3.0, sunElev) * smoothstep(3.0, 0.5, sunElev);
        float ang = degrees(atan(p.y - HZ));                                          // degrees above the horizon (focal length 1)
        float shadowTop = 1.0 + 1.1 * clamp(-sunElev, 0.0, 8.0);                     // Earth's shadow climbs as the sun sinks
        float band = smoothstep(shadowTop, shadowTop - 1.5, ang);
        float pink = smoothstep(shadowTop - 1.0, shadowTop + 1.5, ang) * smoothstep(shadowTop + 14.0, shadowTop + 5.0, ang);
        col = mix(col, vec3(0.30, 0.34, 0.52), band * reach * 0.62);
        col = mix(col, vec3(0.88, 0.60, 0.68), pink * reach * 0.58);
    }
    col += warm * halo * 0.5;
    // low sun: a pale disc just above the tree line around sunrise / sunset (higher sun lives on the sky screen)
    vec2 sunP = vec2(sunX * A, HZ + sunElev * 0.035);
    float sunD = length(p - sunP);
    if (sunElev > -1.5 && sunElev < 12.0) {
        col = mix(col, mix(vec3(1.0, 0.85, 0.62), vec3(0.98, 0.96, 0.90), day), smoothstep(0.034, 0.030, sunD));
        col += glow * 0.35 * exp(-sunD * 9.0) * (0.4 + twi);
    }

    // ---------------- MOUNTAINS: three ranges, far -> near; each range's height, roughness, haze, snowline and colour
    //                  follow from its distance d (0 far .. 1 near). Faces lit from the sun / moon side, a ragged snowline
    //                  with snow down the gullies, forest below the treeline (spruce spikes along the crests), alpenglow at
    //                  dawn / dusk. Drawn after the sky and the low sun (the sun can set behind a peak).
    if (p.y > HZ - 0.003 && p.y < HZ + 0.44) {
        float mLX = (day > 0.35 || twi > 0.25) ? sunX * A : A * 0.66;
        vec3 mHaze = mix(DN(vec3(0.115, 0.14, 0.20), vec3(0.74, 0.80, 0.88)), glow, twi * 0.35);
        for (int L = 0; L < 3; L++) {
            float d = float(L) * 0.5;
            float fq = mix(1.5, 3.2, d), amp = L == 0 ? 0.42 : L == 1 ? 0.24 : 0.15;
            uint salt = L == 0 ? 811u : L == 1 ? 1777u : 2903u;
            float xo = p.x * fq + (L == 0 ? 11.3 : L == 1 ? 29.6 : 47.9);
            float h = ridgeH(xo, salt);
            float top = HZ - 0.003 + amp * h;
            float treeline = HZ + amp * mix(0.30, 0.95, d);                               // trees grow below this height
            float hz = mix(0.44, 0.18, d) * (0.75 + 0.25 * smoothstep(HZ + amp * 0.5, HZ, p.y));   // hazier far away and toward the foot
            vec3 forest = DN(vec3(0.045, 0.06, 0.08), vec3(0.17, 0.23, 0.22));
            if (p.y > top) {
                // spruce spikes standing on the crest (only where the crest is below the treeline)
                if (L == 0 || top > treeline) continue;
                float tw = mix(2.0, 3.0, d) * px1;                                        // one tree per cell
                float cell = floor(p.x / tw);
                if (hash11(cell * 1.31 + float(L) * 7.7) < 0.25) continue;               // gaps in the trees
                float th = (2.0 + 3.0 * hash11(cell * 2.17 + float(L))) * mix(0.8, 1.4, d) * px1;
                float tcx = (cell + 0.5) * tw, dy = p.y - top;
                if (dy > th || abs(p.x - tcx) > (1.0 - dy / th) * tw * 0.55) continue;
                col = mix(forest * 0.85, mHaze, hz);
                continue;
            }
            float depth = (top - p.y) / amp;                                              // 0 at the crest, grows downhill
            // rock texture: ridged noise running diagonally down the fall line -> buttresses and gullies
            vec2 sq = vec2(p.x * fq * 11.0 + float(L) * 9.1 + depth * 2.5, depth * 6.0 + p.x * fq * 3.0);
            float spur = rockR(sq);
            float gx = rockR(sq + vec2(0.25, 0.0)) - rockR(sq - vec2(0.25, 0.0));        // which way the buttress faces
            // the big faces: crest slope sampled a little off-column (wobbling with depth), so the light divide wavers downhill
            float xs = xo + (vnoise(vec2(p.x * fq * 4.0, depth * 2.0)) - 0.5) * 0.10 * (0.3 + depth);
            float dx = 5.0 * px1 * fq;
            float slope = (ridgeH(xs + dx, salt) - ridgeH(xs - dx, salt)) * amp / (10.0 * px1);
            float side = sign(mLX - p.x);
            float lit = clamp(0.5 - slope * side * 0.50 + gx * side * 1.1 + (spur - 0.45) * 0.40, 0.0, 1.0);
            lit = floor(lit * 4.0 + 0.5) / 4.0;                                           // a few flat light steps: rock facets
            float snowline = HZ + amp * (mix(0.44, 0.88, d) + 0.12 * wnoise(xo * 3.0, salt + 7u) - 0.22 * (spur - 0.5));
            bool snowy = p.y > snowline || (p.y > snowline - amp * 0.25 && spur < 0.30);   // ragged snowline; snow down the gullies
            vec3 rock = DN(vec3(0.09, 0.11, 0.16), vec3(0.40, 0.45, 0.54));
            vec3 c = rock * mix(0.62, 1.18, lit);
            if (L > 0 && p.y < treeline + amp * 0.08 * (spur - 0.5)) {                     // forested slopes: canopy speckle
                float canopy = hash21(floor(p / px1) + float(L) * 13.0);
                c = forest * mix(0.70, 1.25, lit) * (0.80 + 0.35 * canopy);
                if (snowy) c = mix(c, DN(vec3(0.30, 0.34, 0.45), vec3(0.90, 0.92, 0.96)), step(0.62, canopy));   // snow-dusted trees
            } else if (snowy) {
                vec3 sn = DN(vec3(0.30, 0.34, 0.45), vec3(0.94, 0.95, 0.98));
                c = mix(sn * vec3(0.66, 0.72, 0.86), sn, lit);
            }
            c = mix(c, c * glow * 1.5, twi * 0.55 * lit * (1.0 - day * 0.5));           // alpenglow on the lit faces
            col = mix(c, mHaze, hz);
        }
    }

    // ---------------- GROUND (snow field + road)
    if (p.y < HZ) {
        float t = roadT(p.y);
        vec3 snow = mix(DN(vec3(0.15, 0.18, 0.24), vec3(0.70, 0.75, 0.81)), DN(vec3(0.30, 0.345, 0.43), vec3(0.90, 0.92, 0.95)), pow(t, 0.8));
        snow = mix(snow, snow * glow * 1.25, twi * 0.35);                           // snow takes the dawn/dusk colour
        float cx = roadCx(p.y), hw = roadHw(p.y);
        float dx = abs(p.x - cx) / max(hw, 1e-4);
        float sdx = (p.x - cx) / max(hw, 1e-4);
        // road: slightly darker, smoother snow; edge softens through the night
        // snow lying on the road: the plough clears everything closer than itself
        float rc = roadCover;
        if (plough >= 0.0 && t > 1.0 - plough) rc = 0.0;
        float edge = mix(0.04, 0.22, rc);
        float road = 1.0 - smoothstep(1.0 - edge, 1.0 + edge, dx);
        vec3 snowRoad = snow * mix(0.72, 0.93, rc);
        // ploughed: packed grey with two cleared lanes and a centre ridge
        vec3 bare = DN(vec3(0.085, 0.10, 0.135), vec3(0.42, 0.45, 0.50));
        float lane = smoothstep(0.10, 0.0, abs(dx - 0.5)) * 0.6 + smoothstep(0.06, 0.0, abs(dx)) * -0.35;
        bare *= 1.0 - 0.18 * lane;
        snow = mix(snow, mix(bare, snowRoad, smoothstep(0.0, 0.45, rc)), road);
        // tyre tracks: two ruts per lane, darker packed snow; old tracks fade as snow refills them
        float trR = tracks.x, trL = tracks.y;
        if (veh.x >= 0.0 && veh.x <= 1.0) {                      // the active vehicle lays its ruts as it goes
            float tvv = veh.y > 0.0 ? 1.0 / (1.0 + 9.0 * veh.x) : 1.15 / (10.0 - 9.0 * veh.x);
            if (veh.y > 0.0 && t > tvv) trR = 1.0;
            if (veh.y < 0.0 && t < tvv) trL = 1.0;
        }
        float rut = 0.0;
        rut = max(rut, trR * max(smoothstep(0.045, 0.0, abs(sdx - 0.12)), smoothstep(0.045, 0.0, abs(sdx - 0.36))));
        rut = max(rut, trL * max(smoothstep(0.045, 0.0, abs(sdx + 0.12)), smoothstep(0.045, 0.0, abs(sdx + 0.36))));
        snow = mix(snow, snow * 0.80, rut * smoothstep(0.08, 0.5, rc) * road);
        // snowbanks: lighter ridges along both edges, a bit taller as snow builds
        float bank = exp(-pow((dx - 1.12) / (0.07 + 0.05 * e), 2.0));
        snow += DN(vec3(0.05, 0.055, 0.06), vec3(0.06, 0.06, 0.06)) * bank * (0.6 + 0.6 * max(e, 1.0 - rc)) * (0.4 + t);
        // faint drift texture
        snow *= 0.94 + 0.08 * vnoise(vec2(p.x * 40.0, p.y * 140.0));
        col = snow;
    }

    // ---------------- TREES: far line, middle groves, near framing spruces — depth-sorted, with atmospheric perspective
    //                  (distance pulls colour toward the horizon sky, contrast drops) and directional light from the sun/moon
    float zTree = -1.0;                               // depth (t) of the tree drawn at this pixel; larger = nearer
    vec3 hazeCol = mix(DN(vec3(0.115, 0.14, 0.20), vec3(0.74, 0.80, 0.88)), glow, twi * 0.35);
    float lightX = (day > 0.35 || twi > 0.25) ? sunX * A : A * 0.66;
    float lightLow = (day > 0.35 || twi > 0.25) ? 1.0 - clamp(sunElev / 35.0, 0.0, 0.6) : 0.5;   // low light = stronger side lighting
    vec3 litCol = mix(DN(vec3(0.07, 0.09, 0.10), vec3(0.27, 0.34, 0.28)), glow * 0.55, twi * 0.5);
    vec3 darkCol = DN(vec3(0.03, 0.035, 0.05), vec3(0.13, 0.17, 0.16));
    vec3 snowTip = DN(vec3(0.20, 0.23, 0.29), vec3(0.90, 0.92, 0.95));
    float tip = 0.0, tier = 0.0;
    // shade one tree pixel at depth t
    #define SHADE_TREE(cxT, tT, detail) { \
        float haze = pow(clamp(1.0 - (tT) / 0.42, 0.0, 1.0), 1.4) * 0.80; \
        float side = sign(p.x - (cxT)) * sign(lightX - (cxT)); \
        vec3 c = mix(darkCol, litCol, (side > 0.0 ? 0.55 : 0.0) * lightLow + 0.15); \
        if (detail) c *= 0.90 + 0.16 * tier; \
        vec3 tc = side > 0.0 ? snowTip : snowTip * mix(0.75, 0.85, day); \
        c = mix(c, tc, tip * (0.5 + 0.5 * e)); \
        col = mix(c, hazeCol, haze); zTree = (tT); }
    // shade one grown-spruce texel: lit live from its stored normal by the sun / moon side light, darkened by its ao
    #define SHADE_SPRITE(cxT, tT, tx) { \
        float haze = pow(clamp(1.0 - (tT) / 0.42, 0.0, 1.0), 1.4) * 0.80; \
        float snx = tx.r * 2.0 - 1.0, sny = tx.g * 2.0 - 1.0; \
        float sb = floor(tx.b * 255.0 + 0.5); int smat = int(sb / 64.0); float sao = mod(sb, 64.0) / 63.0; \
        float lat = clamp((lightX - (cxT)) * 2.0, -1.0, 1.0); \
        vec2 Ld = normalize(vec2(lat * (0.35 + 0.85 * lightLow), 1.0 - 0.45 * lightLow)); \
        float snz = sqrt(max(0.0, 1.0 - snx * snx - sny * sny)); \
        float dif = clamp(dot(vec2(snx, sny), Ld) * 0.85 + snz * 0.30, 0.0, 1.0); \
        vec3 c = mix(darkCol, litCol * 1.15, dif) * mix(0.50, 1.08, sao); \
        float rank = clamp((sao - 0.6) / 0.4, 0.0, 1.0) * 0.35 + 0.25 * dif + 0.40 * tx.a; /* sunny, outer clumps melt first */ \
        if (smat == 1 && rank < treeSnow * 1.08) \
            c = mix(snowTip * mix(0.60, 0.76, day) * vec3(0.92, 0.96, 1.08), snowTip, dif) * mix(0.78, 1.0, sao); \
        else if (smat >= 2) c = mix(darkCol, litCol, dif * 0.6) * vec3(1.30, 1.0, 0.75) * 0.9; \
        col = mix(c, hazeCol, haze); zTree = (tT); }

    // distant forest: a band of tiny trees on the horizon (t ~ 0.012) and a slightly larger band just in front (t ~ 0.03),
    // sized to match the perspective of the middle groves (tree height ~ 1.1-2.0 x t)
    float farT = spruces(p, HZ - 0.002, 0.012, 0.012, 0.030, 11.0, VP.x, 0.03, tip);
    if (farT > 0.5) { tier = 0.5; SHADE_TREE(p.x, 0.012, false) }
    float tipB = 0.0;
    float farB = spruces(p, HZ - 0.012, 0.024, 0.030, 0.060, 23.0, VP.x, 0.06, tipB);
    if (farB > 0.5 && 0.03 > zTree) { tip = tipB; tier = 0.5; SHADE_TREE(p.x, 0.03, false) }
    // ---------------- HOUSES: a farmhouse + barn across the field on the right, a cabin and a cottage far off on the left.
    // Relit like the trees; windows on their own schedules; chimney smoke rising and leaning with the wind.
    const vec3 CHIM[4] = vec3[4](vec3(0.2244, 0.9133, 1.0), vec3(-0.2827, 0.7225, 1.0), vec3(0.0, 0.0, 0.0), vec3(0.0, 0.6580, 1.0));
    float houseFog = 1.0;                         // houses (and lit windows even more) cut through the fog
    for (int i = 0; i < 4; i++) {
        float tH = HOUSES[i].y;
        if (tH <= zTree) continue;
        float gy = HZ - tH * HZ;
        float lat = HOUSES[i].z;
        float cxH = roadCx(gy) + roadHw(gy) * sign(lat) + lat * tH;
        float hb = 0.92 * tH;
        bool flip = lat > 0.0;                        // show the side that faces the road
        int v = int(HOUSES[i].x);
        float haze = pow(clamp(1.0 - tH / 0.42, 0.0, 1.0), 1.4) * 0.38;   // solid buildings: less washed out than foliage
        vec4 tx;
        if (houseSprite(p, gy, cxH, hb, v, flip, tx)) {
            float hb8 = floor(tx.b * 255.0 + 0.5);
            int mat = int(hb8 / 32.0); float hao = mod(hb8, 32.0) / 31.0;
            float hnx = tx.r * 2.0 - 1.0, hny = tx.g * 2.0 - 1.0;
            float latL = clamp((lightX - cxH) * 2.0, -1.0, 1.0);
            vec2 Ld = normalize(vec2(latL * (0.35 + 0.85 * lightLow), 1.0 - 0.45 * lightLow));
            float hnz = sqrt(max(0.0, 1.0 - hnx * hnx - hny * hny));
            float dif = clamp(dot(vec2(hnx, hny), Ld) * 0.85 + hnz * 0.35, 0.0, 1.0);
            vec3 light = DN(vec3(0.20, 0.23, 0.33), vec3(1.0, 0.98, 0.95)) * (DN(vec3(0.45), vec3(0.68)) + 0.62 * dif) * mix(0.70, 1.0, hao);   // snow bounce fills the shade by day
            light = mix(light, light * glow * 1.4, twi * 0.5);
            int wc = int(HOUSES[i].w);
            vec3 wall = wc == 0 ? vec3(0.80, 0.78, 0.72) : wc == 1 ? vec3(0.40, 0.27, 0.17) : wc == 2 ? vec3(0.48, 0.11, 0.07) : vec3(0.78, 0.70, 0.47);
            vec3 c;
            float hz = haze;
            if (mat == 2) c = mix(snowTip * mix(0.60, 0.76, day) * vec3(0.92, 0.96, 1.08), snowTip, dif) * mix(0.8, 1.0, hao);
            else if (mat == 3) {
                int ws = windowState(i, int(floor(tx.r * 255.0 / 16.0)));
                if (ws == 1) { c = vec3(1.0, 0.78, 0.42); hz = haze * 0.3; }
                else if (ws == 2) { c = vec3(0.50, 0.62, 1.0) * (0.65 + 0.35 * vnoise(vec2(time * 5.0, float(i)))); hz = haze * 0.3; }
                else c = DN(vec3(0.04, 0.05, 0.08), vec3(0.30, 0.36, 0.44));
            }
            else {
                vec3 alb = mat == 0 ? wall : mat == 1 ? vec3(0.22, 0.20, 0.21) : mat == 4 ? vec3(0.86, 0.86, 0.82)
                         : mat == 5 ? vec3(0.30, 0.15, 0.10) : mat == 6 ? vec3(0.46, 0.40, 0.37) : vec3(0.10, 0.10, 0.11);
                c = alb * light;
                if (mat == 0 && wc == 2) hz *= 0.35;   // red barn: haze would push it to orange in the palette
            }
            col = mix(c, hazeCol, hz); zTree = tH; houseFog = hz < haze ? 0.15 : 0.45;
        }
        // chimney smoke: a plume of drifting noise puffs, widening and fading as it rises, leaning downwind
        if (CHIM[v].z > 0.5) {
            float h = localHour;
            bool fire = v == 1 || (v == 0 && h >= 6.0 && h < 23.0) || (v == 3 && (h >= 16.0 || h < 1.0 || (h >= 6.0 && h < 10.0)));
            float sx = flip ? -CHIM[v].x : CHIM[v].x;
            vec2 ch = vec2(cxH + sx * hb, gy - 0.10 * hb + CHIM[v].y * hb);
            float S = 1.1 * hb, dy = p.y - ch.y;
            if (fire && dy > 0.0 && dy < S && tH > zTree) {
                float k = dy / S;
                float drift = (0.10 + 0.45 * windAmt * (0.6 + 1.6 * max(gustAt(time - cxH * 2.0), 0.0))) * dy * k + 0.03 * hb * sin(dy / hb * 7.0 - time * 0.7) * k;   // rises, then leans downwind
                float w = hb * (0.04 + 0.16 * sqrt(k));
                float dx = abs(p.x - ch.x - drift);
                float puff = vnoise(vec2((p.x - drift) / hb * 14.0, dy / hb * 9.0 - time * 0.9)) * 0.6
                           + vnoise(vec2((p.x - drift) / hb * 30.0, dy / hb * 20.0 - time * 1.6)) * 0.4;
                float dens = smoothstep(w, w * 0.3, dx) * (1.0 - k) * (0.55 + 0.75 * puff);
                if (dens > 0.38 + 0.5 * bayer4(q)) {
                    vec3 sm = DN(vec3(0.27, 0.29, 0.36), vec3(0.80, 0.81, 0.84));
                    sm = mix(sm, sm * glow * 1.3, twi * 0.4);
                    col = mix(mix(col, sm, 0.75), hazeCol, haze * 0.8); zTree = tH; houseFog = 0.6;
                }
            }
        }
    }
    // middle groves: both sides, set back from the road, perspective-scaled (height and offset proportional to t)
    for (int side = 0; side < 2; side++) {
        for (int i = 0; i < 12; i++) {
            float tT, gy, cxT, h;
            if (!groveTree(side, i, tT, gy, cxT, h) || tT <= zTree) continue;
            vec4 tx;
            if (treeSprite(p, gy, cxT, h, float(i) * 2.9 + float(side) * 31.0, tx)) SHADE_SPRITE(cxT, tT, tx)
        }
    }
    // near framing spruces, hand placed (x from the left edge / right edge, base y, height)
    for (int i = 0; i < 6; i++) {
        float tT = (HZ - LEFT[i].y) / HZ; vec4 tx;
        if (tT > zTree && treeSprite(p, LEFT[i].y, LEFT[i].x, LEFT[i].z, float(i) * 5.3 + 1.0, tx)) SHADE_SPRITE(LEFT[i].x, tT, tx)
    }
    for (int i = 0; i < 5; i++) {
        float tT = (HZ - RIGHT[i].y) / HZ; vec4 tx;
        if (tT > zTree && treeSprite(p, RIGHT[i].y, A - RIGHT[i].x, RIGHT[i].z, float(i) * 7.9 + 2.0, tx)) SHADE_SPRITE(A - RIGHT[i].x, tT, tx)
    }

    // ---------------- WILDLIFE: sprite frames sampled 2x2 per art pixel; coverage decided by the ordered dither
    bool aniEx = false; vec3 aniCol = vec3(0.0);
    if (animal.x > -50.0 && animal.y > zTree) {
        float ta = animal.y, gy = HZ - ta * HZ;
        bool fox = animal.w > 0.5;
        float spx = 0.087 * ta / (fox ? 49.0 : 29.0);            // sprite pixel in uv (road scale: 1 m = 0.087 t)
        float fw = fox ? 64.0 : 72.0, fh = fox ? 36.0 : 52.0;
        float mirror = animal.z > 0.0 ? -1.0 : 1.0;               // sprites face left
        vec2 q0 = vec2((p.x - animal.x) * mirror / spx + fw * 0.5, (p.y - gy) / spx);
        if (q0.x > -2.0 && q0.x < fw + 2.0 && q0.y > -2.0 && q0.y < fh + 2.0) {
            int row, f;
            float g = animal2.y;
            if (fox) { if (g > 0.05) { row = 3; f = int(fract(time * 1.2) * 6.0); } else { row = 2; f = int(fract(animal2.x / 6.2831853) * 8.0); } }
            else if (g > 0.05) { row = 1; f = g < 0.999 ? int(g * 4.99) : 5 + int(fract(time * 0.6) * 2.0); }   // lower head, graze, raise
            else { row = 0; f = int(fract(animal2.x / 6.2831853) * 8.0); }
            vec4 acc = vec4(0.0);
            float o = 0.25 * px1 / spx;
            for (int sx = 0; sx < 2; sx++) for (int sy = 0; sy < 2; sy++) {
                vec4 t4 = spriteTexel(row, f, q0 + vec2((float(sx) - 0.5) * 2.0 * o, (float(sy) - 0.5) * 2.0 * o));
                acc += vec4(t4.rgb * t4.a, t4.a);
            }
            float cover = acc.a * 0.25;
            if (cover > 0.02 + 0.96 * bayer4(q)) {                 // dithered coverage at the edges
                vec3 c = acc.rgb / max(acc.a, 1e-4);
                c *= mix(0.32, 1.0, day) + 1.1 * clamp(L, 0.0, 1.0); // night-dark, lifted by lamps / headlights
                c = mix(c, c * glow * 1.3, twi * 0.3);
                aniCol = mix(c, hazeCol, pow(clamp(1.0 - ta / 0.42, 0.0, 1.0), 1.4) * 0.8);
                aniEx = true;
            }
        }
    }

    // ---------------- FENCE (right verge, receding to the vanishing point; buried through the night)
    // posts t_i = 1.02 / (1 + 0.42 i): only the few whose height range can cover this row are tested
    {
        float tp = max((HZ - p.y) / HZ, 0.0008);                   // depth of a ground point at this row
        float iHi = (1.02 / tp - 1.0) / 0.42;                       // posts standing at or in front of this row
        float iLo = (1.02 / min(tp / 0.74, 1.02) - 1.0) / 0.42;     // ...whose top (+ snow cap) can reach up to it
        for (int j = 0; j < 40; j++) {
            float i = max(floor(iLo), 0.0) + float(j);
            if (i > iHi + 1.0) break;
            float t = 1.02 / (1.0 + 0.42 * i);
            float h = max(px1, 0.075 * t * (1.0 - 0.55 * e));       // buried (never below one pixel)
            if (h < px1 * 0.9 && t < 0.012) break;                  // beyond this they vanish into the vanishing point
            float y = HZ - t * HZ;
            float x = roadCx(y) + roadHw(y) * 1.32 + 0.01 * t;
            float w = max(px1 * 1.0, 0.007 * t);
            float fade = smoothstep(0.16, 0.02, t) * 0.9;              // far posts dissolve into the horizon haze
            if (fade > 0.86) break;
            if (abs(p.x - x) < w * 0.5 && p.y > y && p.y < y + h) col = mix(DN(vec3(0.05, 0.055, 0.07), vec3(0.21, 0.205, 0.21)), hazeCol, fade);
            float cap = px1 * (1.0 + 1.5 * e);
            if (abs(p.x - x) < w * 0.5 + px1 * 0.5 && p.y >= y + h && p.y < y + h + cap) col = mix(DN(vec3(0.44, 0.48, 0.56), vec3(0.93, 0.95, 0.96)), hazeCol, fade);
        }
    }

    // ---------------- UTILITY POLES + WIRES (a line of poles receding to the vanishing point)
    vec3 poleBase = DN(vec3(0.04, 0.045, 0.06), vec3(0.21, 0.205, 0.21));
    vec3 wireBase = DN(vec3(0.06, 0.07, 0.09), vec3(0.21, 0.205, 0.21));
    for (int k = 0; k < 64; k++) {                               // all the way into the vanishing point
        Pole P = pole(k);
        if (P.top.y - P.base.y < 1.5 * px1) break;                // shorter than ~1.5 px: gone into the distance
        float fade = smoothstep(0.10, 0.012, P.t) * 0.9;           // far poles and wires dissolve into the horizon haze
        if (fade > 0.86) break;
        vec3 poleCol = mix(poleBase, hazeCol, fade);
        vec3 wireCol = mix(wireBase, hazeCol, fade);
        if (p.y >= P.base.y && p.y <= P.top.y) {                 // one pixel column per row: never broken
            float xl = mix(P.base.x, P.top.x, (p.y - P.base.y) / (P.top.y - P.base.y));
            if (abs(p.x - xl) < max(0.5, P.wpx * 0.5) * px1 && P.t > zTree) col = poleCol;
        }
        if (abs(p.y - P.armY) < 0.5 * px1 && p.x >= P.armL.x && p.x <= P.armR.x) col = poleCol;
        if (k == 0 && p.x >= P.armL.x && p.x <= P.armR.x && p.y > P.armY + 0.5 * px1 && p.y < P.armY + px1 * (0.6 + 1.2 * e))
            col = DN(vec3(0.40, 0.44, 0.52), vec3(0.93, 0.95, 0.96));   // snow on the near crossarm
        if (k < 63) {                                             // two wires to the next pole
            Pole Q = pole(k + 1);
            float sag = 0.035 * (P.t + Q.t) / 0.55 * wireSwing(float(k), P.base.x);
            bool single = (P.armR.x - P.armL.x) < 2.0 * px1;          // the two wires would merge: draw just one
            if (onWire(p, P.armL, Q.armL, sag) || (!single && onWire(p, P.armR, Q.armR, sag))) col = wireCol;
            snowOnWire(col, p, P.armL, Q.armL, sag, float(k), 0.0, k < 3);
            snowOnWire(col, p, P.armR, Q.armR, sag, float(k), 1.0, k < 3);
        }
    }
    {   // and back toward the viewer, off the right edge
        Pole P = pole(0);
        float sw1 = wireSwing(-1.0, A * 0.8), sw2 = wireSwing(-2.0, A * 0.8);   // the nearest spans swing the most visibly
        if (onWire(p, P.armR, vec2(A + 0.05, P.armY - 0.035), 0.05 * sw1) || onWire(p, P.armL, vec2(A + 0.05, P.armY - 0.05), 0.06 * sw2)) col = wireBase;
        snowOnWire(col, p, P.armR, vec2(A + 0.05, P.armY - 0.035), 0.05 * sw1, 40.0, 1.0, true);
        snowOnWire(col, p, P.armL, vec2(A + 0.05, P.armY - 0.05), 0.06 * sw2, 41.0, 0.0, true);
    }

    // ---------------- STREETLAMPS (posts, arms, heads)
    for (int li = 0; li < 2; li++) {
        float lt = li == 0 ? lt1 : lt2, g = li == 0 ? g1 : g2, postX = li == 0 ? post1 : post2;
        vec2 head = li == 0 ? lamp1 : lamp2;
        float topY = head.y + 0.02 * lt, fl = li == 0 ? f1 : f2;
        float lfade = smoothstep(0.16, 0.02, lt) * 0.9;                                                   // distance haze
        vec3 metal = mix(DN(vec3(0.05, 0.055, 0.07), vec3(0.21, 0.205, 0.21)), hazeCol, lfade);
        vec3 metalHi = mix(DN(vec3(0.10, 0.11, 0.14), vec3(0.36, 0.37, 0.39)), hazeCol, lfade);
        // cobra-head streetlight: heavy base, thin pole, quarter-circle bend into the arm, flat housing, lens underneath
        float pw = max(px1, 0.009 * lt);                     // pole width
        float bw = max(2.0 * px1, 2.3 * pw), baseH = 0.18 * (topY - g);
        float r = max(2.0 * px1, 0.05 * lt);                 // bend radius
        float Lh = max(3.0 * px1, 0.085 * lt), hh = max(1.5 * px1, 0.014 * lt);
        float hx0 = head.x - 0.55 * Lh, hx1 = head.x + 0.45 * Lh;
        if (p.y >= g && p.y < g + baseH && abs(p.x - postX) < bw * 0.5) col = (p.x < postX - bw * 0.5 + px1) ? metalHi : metal;   // base
        if (p.y >= g && p.y <= topY - r && abs(p.x - postX) < pw * 0.5) col = metal;                                          // pole
        vec2 bc = vec2(postX + r, topY - r);                                                                                   // bend
        if (p.x <= bc.x && p.y >= bc.y && abs(length(p - bc) - r) < pw * 0.5) col = metal;
        if (p.x >= bc.x && p.x <= hx0 && abs(p.y - topY) < pw * 0.5) col = metal;                                             // arm
        if (p.x >= hx0 && p.x <= hx1 && p.y >= topY - hh && p.y <= topY + hh * 0.6) {                                         // housing
            col = metal;
            if (p.y < topY - hh + max(px1, hh * 0.45) && p.x > hx0 + px1 && p.x < hx1 - px1)                                   // lens strip
                col = mix(mix(DN(vec3(0.33, 0.26, 0.19), vec3(0.50, 0.51, 0.53)), hazeCol, lfade), li == 0 ? vec3(1.0, 0.86, 0.55) : vec3(0.85, 0.68, 0.42), fl);
        }
        if (li == 0 && p.x >= hx0 && p.x <= hx1 && p.y > topY + hh * 0.6 && p.y < topY + hh * 0.6 + px1 * (1.0 + e)) col = DN(vec3(0.44, 0.48, 0.56), vec3(0.93, 0.95, 0.96));   // snow cap
    }

    bool glint = false; vec3 glintCol = vec3(1.0);    // glitter: exact colours, past the palette (brighter than white snow)
    // ---------------- CLOUD SHADOWS: a drifting cloud layer projected onto the ground plane (and the trees standing on it)
    {
        float sunUp = day * smoothstep(2.0, 10.0, sunElev);
        bool isTree = zTree > 0.0;
        if (day * smoothstep(1.0, 6.0, sunElev) > 0.01 && (p.y < HZ || isTree)) {
            float tg = max(isTree ? zTree : roadT(p.y), 0.015);         // depth: shadows shrink and flatten toward the horizon
            vec2 w = vec2((p.x - VP.x) / tg, 1.0 / tg);                // world position on the ground (lateral, distance)
            vec2 cp = vec2(w.x * 0.07 + time * 0.010, w.y * 0.22);     // drifts the same way as the sky clouds
            float n = fbm(cp) * 0.75 + fbm(cp * 2.1 + 5.0) * 0.35;
            float cov = mix(0.50, 0.40, e);
            float overcast = 1.0 - 0.6 * smoothstep(0.6, 0.95, e);                                    // thick overcast: no distinct shadows
            float sh = smoothstep(cov, cov + 0.10, n) * sunUp * overcast;
            // cast shadows: trees, houses, poles and lamp posts throw shadows away from the sun, long when it is low
            if (!isTree && p.y < HZ) {
                vec2 g = groundW(p.x, tg);
                float pxm = px1 * WSC / tg;
                vec2 dir = normalize(vec2(-(sunX * A - VP.x), -1.0));                  // sun ahead of us: shadows come toward us
                float tanE = tan(radians(max(sunElev, 2.0)));
                bool inSh = false;
                for (int i = 0; i < 6 && !inSh; i++) {
                    float tc = (HZ - LEFT[i].y) / HZ, H = LEFT[i].z * WSC / tc;
                    inSh = inShadow(g, groundW(LEFT[i].x, tc), dir, min(H / tanE, 140.0), 0.26 * H, 0, pxm);
                }
                for (int i = 0; i < 5 && !inSh; i++) {
                    float tc = (HZ - RIGHT[i].y) / HZ, H = RIGHT[i].z * WSC / tc;
                    inSh = inShadow(g, groundW(A - RIGHT[i].x, tc), dir, min(H / tanE, 140.0), 0.26 * H, 0, pxm);
                }
                for (int side = 0; side < 2 && !inSh; side++) for (int i = 0; i < 12 && !inSh; i++) {
                    float tT, gyT, cxT, hT;
                    if (!groveTree(side, i, tT, gyT, cxT, hT)) continue;
                    float H = hT * WSC / tT;
                    inSh = inShadow(g, groundW(cxT, tT), dir, min(H / tanE, 140.0), 0.26 * H, 0, pxm);
                }
                for (int i = 0; i < 4 && !inSh; i++) {
                    float tH = HOUSES[i].y, gyH = HZ - tH * HZ, lat = HOUSES[i].z;
                    int v = int(HOUSES[i].x);
                    float H = v == 0 ? 8.8 : v == 1 ? 6.4 : v == 2 ? 8.5 : 5.8, r = v == 0 ? 5.0 : v == 1 ? 3.6 : v == 2 ? 5.4 : 4.2;
                    inSh = inShadow(g, groundW(roadCx(gyH) + roadHw(gyH) * sign(lat) + lat * tH, tH), dir, min(H / tanE, 140.0), r, 1, pxm);
                }
                for (int k = 0; k < 7 && !inSh; k++) {
                    Pole P = pole(k);
                    float H = (P.top.y - P.base.y) * WSC / P.t;
                    inSh = inShadow(g, groundW(P.base.x, P.t), dir, min(H / tanE, 140.0), 0.16, 2, pxm);
                }
                if (!inSh) inSh = inShadow(g, groundW(post1, lt1), dir, min(8.4 / tanE, 140.0), 0.10, 2, pxm)
                               || inShadow(g, groundW(post2, lt2), dir, min(8.4 / tanE, 140.0), 0.10, 2, pxm);
                if (inSh) {                                                           // snow in sun-shadow is a clear sky-blue
                    float cs = 0.9 * day * smoothstep(1.0, 6.0, sunElev) * (1.0 - 0.45 * smoothstep(0.6, 0.95, e));
                    col = mix(col, col * vec3(0.56, 0.65, 0.90), cs);
                    sh *= 0.4;                                                        // don't stack the cloud shade on top
                }
                // glitter: ice crystals catching the sun. Sparse candidates on sunlit open snow, each flashing briefly
                // on its own rhythm; fewer in the distance (a pixel there covers far more snow, and glints are tiny)
                float gl = uh(q, 4271.0);
                if (!inSh && gl > 1.0 - 0.045 * (0.25 + tg) * smoothstep(3.0, 12.0, sunElev) * overcast) {
                    float ph = uh(q, 1913.0);
                    if (fract(time * (0.35 + 1.2 * ph) + ph * 17.0) < 0.07) {
                        float hue = uh(q, 677.0);                                       // ice throws white, cyan and gold
                        glint = true; glintCol = hue < 0.55 ? vec3(1.0) : hue < 0.80 ? vec3(0.72, 0.94, 1.0) : vec3(1.0, 0.90, 0.62);
                    }
                }
            }
            col = mix(col, col * vec3(0.70, 0.76, 0.92), sh * 0.85);    // shaded snow goes cooler and bluer, not just darker
        }
    }

    // ---------------- LAMPLIGHT on the scene (snow takes the warm light; dark shapes barely)
    float lum = dot(col, vec3(0.3, 0.5, 0.2));
    col = mix(col, col + warm * 0.55, clamp(pool, 0.0, 1.0) * smoothstep(0.08, 0.30, lum));
    col = mix(col, col * 0.6 + warm * 0.30, clamp(pool, 0.0, 1.0) * (1.0 - smoothstep(0.08, 0.30, lum)) * 0.6);   // dark ground still catches it
    if (pool > 0.45 && p.y < HZ && zTree < 0.0 && uh(q, 8123.0) > 0.975) {        // glints in the lamplit snow
        float ph = uh(q, 5507.0);
        if (fract(time * (0.25 + 0.9 * ph) + ph * 11.0) < 0.10) { glint = true; glintCol = vec3(1.0, 0.88, 0.60); }
    }

    // ---------------- FOG (thickens with the night; warmed in lamplight; dithered by the quantizer)
    float fogH = exp(-max(0.0, p.y - HZ + 0.06) * 5.0);
    float n = vnoise(vec2(p.x * 3.0 + time * 0.006, p.y * 9.0 - time * 0.0015)) * 0.6 + vnoise(vec2(p.x * 9.0 - time * 0.01, p.y * 20.0)) * 0.4;
    float fog = fogAmt * (0.22 + 0.55 * e) * fogH * (0.55 + 0.45 * n);
    fog += fogAmt * e * 0.18 * smoothstep(0.25, 0.0, abs(p.x - roadCx(p.y))) * step(p.y, HZ);   // the road fades first
    vec3 fogCol = mix(mix(DN(vec3(0.17, 0.20, 0.26), vec3(0.84, 0.87, 0.90)), glow, twi * 0.22), warm * 0.75, clamp(L * 0.8, 0.0, 0.7));
    col = mix(col, fogCol, clamp(fog * houseFog, 0.0, 0.75));
    col = mix(col, col * vec3(1.06, 0.93, 0.74), beam * smoothstep(0.22, 0.50, dot(col, vec3(0.3, 0.5, 0.2))));   // pale snow behind it warms too
    col += vec3(0.95, 0.60, 0.26) * beam * (0.13 + 0.06 * snowAmt + 0.06 * fogAmt);   // the beam: lit snow-haze in the air, only ever brightens

    // ---------------- DISTANT STREETLAMPS (after the fog: lights shine through it; old sodium one, then a cold white LED)
    for (int i = 0; i < 2; i++) {
        float tl = i == 0 ? 0.058 : 0.034;
        float side = i == 0 ? -1.0 : 1.0;                       // sodium on the left verge, LED across the road
        float gy = HZ - tl * HZ;
        float lx = roadCx(gy) + side * (roadHw(gy) + 0.11 * tl);
        float topY = gy + 0.64 * tl;
        vec2 head = vec2(lx - side * 0.19 * tl, topY - px1 * 0.5);
        float on = lamps * (lampAge < 6.0 + float(i) * 2.0 ? step(0.5, hash11(floor(lampAge * 8.0) + 17.0 + float(i) * 5.0)) * smoothstep(0.0, 1.0, lampAge - float(i)) : 1.0);
        vec3 lc = i == 0 ? vec3(1.0, 0.72, 0.38) : vec3(0.86, 0.92, 1.0);
        float dfade = smoothstep(0.16, 0.02, tl) * 0.9;
        vec3 dmetal = mix(DN(vec3(0.07, 0.08, 0.10), vec3(0.26, 0.25, 0.25)), hazeCol, dfade);
        if (p.y >= gy && p.y <= topY && abs(p.x - lx) < 0.5 * px1) col = dmetal;
        if (abs(p.y - topY) < 0.5 * px1 && p.x >= min(lx, head.x) && p.x <= max(lx, head.x)) col = dmetal;
        float dh = length((p - head) / px1);
        if (dh < 1.6 && on > 0.5) col = mix(col, lc, 0.45 * (1.0 - 0.45 * dfade) * step(bayer4(q), 0.6));    // one crisp dithered ring, no soft glow
        if (dh < 0.75) col = mix(mix(DN(vec3(0.25, 0.24, 0.22), vec3(0.45, 0.46, 0.48)), hazeCol, dfade), lc, on);
    }

    // ---------------- PLOUGH (drawn after the fog: it is close to the camera; seen from behind, driving away up the road; amber beacon on the cab)
    float beaconGlow = 0.0;
    bool tail = false;
    vec2 beaconP = vec2(-9.0);
    if (plough >= 0.0 && plough <= 1.0) {
        float tp = 1.0 - plough;                                   // 1 at the bottom of the screen, 0 at the horizon
        float yb = HZ - tp * HZ;
        float hwp = roadHw(yb);
        float xc = roadCx(yb) + hwp * 0.22;                        // keeps to the right lane
        float wv = max(hwp * 0.72, px1 * 4.0), hv = wv * 0.78;
        float dxp = abs(p.x - xc), dyp = p.y - yb;
        if (dyp > 0.0 && dyp < hv * 0.58 && dxp < wv * 0.5) {
            col = vec3(0.80, 0.52, 0.20);                                          // body
            if (dyp < max(px1, hv * 0.12)) col = vec3(0.16, 0.13, 0.11);           // bumper
            if (dyp < hv * 0.25 && dyp > hv * 0.08 && dxp > wv * 0.5 - max(px1, wv * 0.1)) tail = true;   // tail lights
        }
        if (dyp >= hv * 0.58 && dyp < hv && dxp < wv * 0.30) {
            col = vec3(0.74, 0.48, 0.19);                                          // cab
            if (dyp > hv * 0.68 && dyp < hv * 0.92 && dxp < wv * 0.20) col = vec3(0.07, 0.08, 0.10);   // rear window
        }
        beaconP = vec2(xc, yb + hv + max(px1, hv * 0.08));
        bool on = fract(time * 1.6) < 0.5;
        if (abs(p.x - beaconP.x) < max(px1 * 0.6, wv * 0.06) && abs(p.y - beaconP.y) < max(px1 * 0.6, hv * 0.07))
            col = on ? vec3(1.0, 0.80, 0.45) : vec3(0.43, 0.33, 0.21);
        if (on) beaconGlow = exp(-length((p - beaconP) / vec2(0.09, 0.05)) * 2.2) * (1.0 - 0.7 * day);
    }
    col += vec3(0.95, 0.62, 0.25) * beaconGlow * 0.55;

    // ---------------- TRAFFIC (one vehicle at a time; drawn over the fog but faded by it with distance)
    bool exact = false;
    vec3 exactCol = vec3(0.0);
    if (veh.x >= 0.0 && veh.x <= 1.0) {
        bool away = veh.y > 0.0;
        // perspective: constant speed in distance, so fast up close and slow near the horizon
        float tv = away ? 1.0 / (1.0 + 9.0 * veh.x) : 1.15 / (10.0 - 9.0 * veh.x);
        float yb = HZ - tv * HZ;
        float hwv = 0.003 + tv * 0.26;
        float cxv = VP.x + tv * (A * 0.41 - VP.x) + 0.02 * A * tv * tv;
        float xc = cxv + (away ? 1.0 : -1.0) * hwv * 0.48;                      // centre of its lane
        int vtype = int(veh.z + 0.5);
        int vcol = int(veh.w + 0.5);
        vec3 body = vcol == 0 ? vec3(0.52, 0.13, 0.12) : vcol == 1 ? vec3(0.16, 0.22, 0.40) : vcol == 2 ? vec3(0.62, 0.64, 0.67)
                  : vcol == 3 ? vec3(0.90, 0.91, 0.92) : vec3(0.20, 0.32, 0.24);
        float shade = mix(0.30, 1.0, day) + 0.5 * clamp(L, 0.0, 1.0);
        float wv = max(hwv * 0.72, px1 * 2.0);                               // a car fills ~70% of its lane (lane = half the road)
        float hv = wv * (vtype == 2 ? 0.95 : vtype == 1 ? 0.72 : 0.62);
        float dxv = abs(p.x - xc), dyv = p.y - yb;
        float lowerH = vtype == 2 ? hv : hv * 0.5;
        vec3 glass = mix(vec3(0.05, 0.06, 0.08), vec3(0.55, 0.62, 0.70), day);
        if (dyv > 0.0 && dyv < lowerH && dxv < wv * 0.5) {
            exact = true; exactCol = body * shade;
            if (dyv < max(px1, hv * 0.10)) exactCol = vec3(0.08, 0.08, 0.09);                     // bumper
            if (vtype == 2 && dyv > hv * 0.55 && dyv < hv * 0.82 && dxv < wv * 0.38) exactCol = glass;   // van windows
        }
        if (vtype != 2 && dyv >= lowerH && dyv < hv && dxv < wv * (vtype == 1 ? 0.34 : 0.40)) {
            exact = true; exactCol = body * shade * 0.9;                                           // cabin
            if (dyv > lowerH + (hv - lowerH) * 0.2 && dyv < hv - (hv - lowerH) * 0.15 && dxv < wv * (vtype == 1 ? 0.27 : 0.33)) exactCol = glass;
        }
        bool lightRow = dyv > hv * 0.12 && dyv < hv * 0.30;
        bool corner = dxv > wv * 0.5 - max(px1, wv * 0.15) && dxv < wv * 0.5;
        bool lit = lamps > 0.5;
        if (lightRow && corner) {
            exact = true;
            if (away) { if (lit) tail = true; else exactCol = vec3(0.32, 0.09, 0.08) * shade; }
            else exactCol = lit ? vec3(1.0, 0.97, 0.86) : vec3(0.70, 0.72, 0.74) * shade;
        }
        if (exact && !tail) exactCol = mix(exactCol, fogCol, clamp(fog, 0.0, 0.75) * (1.0 - tv) * 0.9);
        if (lit && p.y < HZ) {
            // oncoming: beams fan out down the road toward you; going away: a faint pool ahead of it
            float dist = away ? p.y - yb : yb - p.y;
            if (dist > 0.0) {
                float wbeam = wv * 0.45 + dist * (away ? 0.45 : 0.85);
                float beam = smoothstep(wbeam, wbeam * 0.4, abs(p.x - xc)) * exp(-dist * (away ? 14.0 : 5.0)) * (away ? 0.35 : 0.9);
                col += vec3(0.92, 0.90, 0.80) * beam * 0.55;
                L += beam;
            }
            float glare = away ? 0.0 : exp(-length((p - vec2(xc, yb + hv * 0.2)) / vec2(wv * 0.9, hv * 0.6)) * 2.5) * 0.35;
            col += vec3(1.0, 0.97, 0.88) * glare;
        }
    }

    // ---------------- BIRDS on the wire (the near crossarm -> far pole wire)
    if (birds.x >= 0.0) {
        Pole P0 = pole(0), P1 = pole(1);
        vec2 wa = P0.armL, wb = P1.armL;
        float wsag = 0.035 * (P0.t + P1.t) / 0.55 * wireSwing(0.0, P0.base.x);
        float tB = birds.x;
        for (int i = 0; i < 7; i++) {
            if (float(i) >= birds.y) break;
            float hi = hash11(birdSeed * 13.1 + float(i) * 7.3);
            float hj = hash11(birdSeed * 5.7 + float(i) * 3.1);
            // perch spot along the wire (spread out, a little clumped), plus an occasional hop
            float sp = 0.18 + 0.64 * fract(hi + float(i) * 0.137);
            float arrive = 7.0 + float(i) * 0.9 + hj * 2.0;
            float leave = birds.w + float(i) * 1.3 + hi * 4.0;
            float hops = floor(max(tB - arrive, 0.0) / (25.0 + hj * 30.0));
            sp = clamp(sp + 0.025 * (hash11(hops + hi * 50.0) - 0.5) * min(hops, 1.0), 0.1, 0.9);
            vec2 perch = vec2(mix(wa.x, wb.x, sp), mix(wa.y, wb.y, sp) - wsag * 4.0 * sp * (1.0 - sp) + px1 * 1.0);
            vec2 bp; bool flying = true;
            if (tB < arrive) {                                    // flying in along a falling arc from the side
                float u = clamp(tB / arrive, 0.0, 1.0);
                vec2 from = vec2(birds.z > 0.0 ? A + 0.05 : -0.05, perch.y + 0.18 + hi * 0.15);
                bp = mix(from, perch, u) + vec2(0.0, 0.10 * sin(3.14159 * u));
            } else if (tB < leave) { bp = perch; flying = false; }
            else {                                                // leaving: up and away to the other side
                float u = clamp((tB - leave) / 6.0, 0.0, 1.0);
                vec2 to = vec2(birds.z > 0.0 ? -0.08 : A + 0.08, perch.y + 0.30 + hj * 0.2);
                bp = mix(perch, to, u * u) + vec2(0.0, 0.05 * u);
                if (u >= 1.0) continue;
            }
            vec2 d = (p - bp) / px1;                                    // in art pixels
            vec3 bc = DN(vec3(0.03, 0.035, 0.05), vec3(0.11, 0.11, 0.12));
            if (!flying) {
                if ((abs(d.x) < 1.0 && d.y > -0.5 && d.y < 1.5) || (abs(d.x - 0.9) < 0.5 && d.y > 1.5 && d.y < 2.5)) col = bc;   // body + head
            } else {
                bool up = fract(time * 6.0 + hi) < 0.5;                 // two-frame wing flap
                bool hit = abs(d.x) < 0.6 && abs(d.y) < 0.6;
                hit = hit || (abs(abs(d.x) - 1.0) < 0.5 && abs(d.y - (up ? 1.0 : 0.0)) < 0.5);
                hit = hit || (up && abs(abs(d.x) - 2.0) < 0.5 && abs(d.y - 1.6) < 0.5);
                if (hit) col = bc;
            }
        }
    }

    // ---------------- WIND mood: smooth offset whose slope changes like weather
    float wind = windX(time);

    // ---------------- SNOW (in pixel units; 3 layers + rare near flakes)
    vec2 pp = q + 0.5;
    float flake = 0.0;
    // turbulence: a divergence-free swirl (curl of a slow noise) bends the flakes' paths so they eddy together instead of
    // sliding in lockstep; stronger in gusts. Streaks: in strong gusts the near flakes smear along their motion.
    float gS = max(gustAt(time - p.x * 2.0), 0.0);
    float vNow = (windX(time + 0.25) - windX(time - 0.25)) * 2.0;                  // wind speed now, px/s
    vec2 ep = pp / 90.0 + vec2(time * 0.04, -time * 0.02);
    float e0 = vnoise(ep), ex = vnoise(ep + vec2(0.05, 0.0)), ey = vnoise(ep + vec2(0.0, 0.05));
    vec2 curl = vec2(ey - e0, -(ex - e0)) / 0.05;
    float turb = min(windAmt, 2.0) * (0.4 + 1.6 * gS) * 3.0;
    for (int l = 0; l < 4; l++) {
        float cs    = l == 0 ? 7.0  : l == 1 ? 11.0 : l == 2 ? 19.0 : 70.0;
        float speed = l == 0 ? 2.6  : l == 1 ? 4.2  : l == 2 ? 6.5  : 5.0;
        float wm    = l == 0 ? 0.45 : l == 1 ? 0.75 : l == 2 ? 1.1  : 1.4;
        float dens  = (l == 0 ? 0.30 : l == 1 ? 0.22 : l == 2 ? 0.12 : 0.025) * snowAmt * 2.0;
        float size  = l == 0 ? 0.55 : l == 1 ? 0.65 : l == 2 ? 0.9  : 2.2;
        float bright= l == 0 ? 0.35 : l == 1 ? 0.55 : l == 2 ? 0.8  : 0.9;
        // varied fall speed: every column of cells has its own pace, so flakes slide past each other
        float sx = pp.x - wind * wm + curl.x * turb * wm;
        float colH = uh(vec2(floor(sx / cs), 0.0), float(l) * 17.0 + 0.0);
        vec2 sp = vec2(sx, pp.y + time * speed * (0.6 + 0.8 * colH) + colH * 997.0 + curl.y * turb * wm);
        vec2 cell = floor(sp / cs);
        vec2 h = vec2(uh(cell, float(l) * 31.0 + 1.0), uh(cell, float(l) * 31.0 + 2.0));
        // patchy, breathing snowfall: slow drifting bands of heavier/lighter snow + intensity that swells over minutes
        float patchy = smoothstep(0.2, 0.8, vnoise(mod(cell * cs * 0.011 + vec2(time * 0.018, -time * 0.008), 512.0) + float(l) * 3.7));
        float swell = 0.5 + 0.5 * noise1(time / 70.0 + float(l) * 1.3);
        if (h.x > dens * (0.25 + 1.5 * patchy) * (0.45 + 0.75 * swell)) continue;
        vec2 c = (cell + 0.15 + 0.7 * vec2(uh(cell, float(l) * 31.0 + 3.0), uh(cell, float(l) * 31.0 + 4.0))) * cs;
        c.x += sin(time * (0.3 + 0.9 * h.y) + h.y * 40.0) * (0.3 + 1.7 * hash11(h.y * 71.0)) * (1.0 + float(l));   // each flake its own sway       // gentle sway
        float d = length(sp - c);
        if (l >= 2) {                                                                 // near flakes streak along their motion
            float vx = vNow * wm, vy = speed * (0.6 + 0.8 * colH);
            float st = clamp(length(vec2(vx, vy)) * 0.12 - 0.6, 0.0, 2.5) * smoothstep(0.25, 0.7, gS);
            vec2 m = normalize(vec2(vx, -vy)), e2 = sp - c;
            d = length(vec2(dot(e2, m) / (1.0 + st), dot(e2, vec2(-m.y, m.x))));
        }
        if (d < size) flake = max(flake, bright * (l == 3 ? smoothstep(size, size * 0.3, d) : 1.0));
    }
    // blowing snow: in strong gusts, low wisps of loose snow stream across the field (sheared, fast, near the ground)
    if (p.y < HZ - 0.01 && windAmt > 0.01) {
        float g = gustAt(time - p.x * 2.0);
        if (g > 0.45) {
            float tg = roadT(p.y);
            float sd = vnoise(vec2((pp.x - wind * (1.2 + 2.5 * tg)) / (18.0 + 40.0 * tg), pp.y / (1.5 + 3.0 * tg) + time * 0.15)) * 0.7
                     + vnoise(vec2((pp.x - wind * (1.6 + 3.0 * tg)) / 7.0, pp.y / 1.2)) * 0.3;
            float amt = smoothstep(0.45, 0.95, g) * smoothstep(0.55, 0.85, sd) * (0.35 + 0.65 * tg);
            if (amt > bayer4(q) * 0.9 + 0.08) col = mix(col, DN(vec3(0.42, 0.46, 0.55), vec3(0.97, 0.98, 1.0)), 0.55);
        }
    }
    if (flake > 0.0) {
        float lit = clamp(L * 1.4, 0.0, 1.0);
        float vis = mix(mix(0.10, 1.0, lit), 0.85, day) * flake;              // almost invisible in the dark, plain by day
        vec3 fc = mix(DN(vec3(0.55, 0.60, 0.68), vec3(0.97, 0.98, 0.99)), vec3(1.0, 0.88, 0.70), lit);
        if (lit > 0.55 && uh(q + vec2(floor(time * 6.0), 0.0), 77.0) > 0.93) { fc = vec3(1.0, 0.95, 0.85); vis = 1.0; }  // sparkle
        col = mix(col, fc, vis);
    }

    fragColor = vec4(tail ? PAL_TAIL : exact ? exactCol : aniEx ? aniCol : glint ? glintCol : quantize(col, q, p.y > HZ && zTree < 0.0), 1.0) * qt_Opacity;
}
