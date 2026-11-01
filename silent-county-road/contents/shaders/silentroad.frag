#version 440
// Silent County Road — procedural pixel-art winter night (Plasma 6 wallpaper).
// One pass: every screen pixel is snapped to a coarse pixel grid, the scene is evaluated analytically at that grid
// pixel, then ordered-dithered into a fixed 16-colour palette. No textures, no CPU-side state:
//   SCENE  sky, tree lines, road + snowbanks, poles, wire, streetlamps, fence (static, from fixed layout + hashes)
//   LIGHT  two warm lamp pools / cones / halos
//   FOG    slow value-noise fog, thickest near the horizon, warmed inside lamplight
//   SNOW   hash-generated flakes in 3 depth layers + rare near flakes; nearly invisible unless lamp-lit
//   WIND   slow "moods" from layered low-frequency noise (calm / drift / whisper gust)
//   FLICKER lamps burn steady, then rarely stutter for a few seconds (the far lamp is the dying one)
//   WINTER `erosion` (0..1, driven by the real clock) thickens fog, softens the road edge, buries the fence,
//          and grows snow caps; `roadCover` is snow lying on the road itself
//   DAY    `day` 0..1 / `twi` 0..1 / `rising` re-light the whole scene from the real sun: night -> blue hour -> rose
//          dawn or orange dusk -> overcast winter day. Lamps switch off by day and stutter back on at dusk.
//   TRAFFIC cars, pickups and vans in either direction (lanes, perspective speed); headlights / tail lights at
//          night; tyre tracks in the road snow that fill back in over ~10 minutes
//   WIRES  snow ridges build on the wires overnight; through the late morning sections shed it in falling clumps
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
    vec2 res;        // item size
};

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
float bayer4(vec2 q) {
    int x = int(mod(q.x, 4.0)), y = int(mod(q.y, 4.0));
    int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
    return (float(m[y * 4 + x]) + 0.5) / 16.0;
}

// ---- palettes: one hand-picked 16-colour set per phase; the active palette blends between them each frame
//      (night <-> day by sun height, then toward dusk or dawn during twilight); entries 16-19 are each phase's sky blues.
//      PAL_TAIL is reserved for the plough.
const vec3 PAL_NIGHT[21] = vec3[21](
    vec3(0.027, 0.035, 0.051), vec3(0.051, 0.067, 0.094), vec3(0.075, 0.098, 0.145), vec3(0.106, 0.133, 0.192),
    vec3(0.137, 0.173, 0.239), vec3(0.176, 0.216, 0.286), vec3(0.227, 0.271, 0.349), vec3(0.290, 0.337, 0.420),
    vec3(0.369, 0.416, 0.502), vec3(0.463, 0.510, 0.604), vec3(0.580, 0.627, 0.714), vec3(0.765, 0.796, 0.847),
    vec3(0.231, 0.188, 0.149), vec3(0.431, 0.329, 0.208), vec3(0.706, 0.541, 0.322), vec3(0.941, 0.827, 0.627),
    vec3(0.050, 0.070, 0.140), vec3(0.080, 0.110, 0.220), vec3(0.120, 0.170, 0.320), vec3(0.200, 0.270, 0.450),
    vec3(0.070, 0.090, 0.100));
const vec3 PAL_DAY[21] = vec3[21](
    vec3(0.100, 0.120, 0.120), vec3(0.160, 0.200, 0.190), vec3(0.205, 0.210, 0.220), vec3(0.300, 0.330, 0.360),
    vec3(0.400, 0.440, 0.480), vec3(0.480, 0.520, 0.570), vec3(0.580, 0.630, 0.690), vec3(0.660, 0.710, 0.770),
    vec3(0.740, 0.780, 0.830), vec3(0.820, 0.850, 0.890), vec3(0.890, 0.910, 0.940), vec3(0.950, 0.960, 0.970),
    vec3(0.550, 0.330, 0.140), vec3(0.800, 0.520, 0.200), vec3(0.450, 0.460, 0.480), vec3(1.000, 0.800, 0.450),
    vec3(0.300, 0.460, 0.740), vec3(0.420, 0.580, 0.830), vec3(0.560, 0.690, 0.880), vec3(0.700, 0.800, 0.930),
    vec3(0.270, 0.340, 0.280));
const vec3 PAL_DUSK[21] = vec3[21](
    vec3(0.050, 0.050, 0.090), vec3(0.090, 0.090, 0.150), vec3(0.140, 0.130, 0.210), vec3(0.200, 0.180, 0.280),
    vec3(0.280, 0.240, 0.340), vec3(0.380, 0.300, 0.380), vec3(0.500, 0.380, 0.420), vec3(0.640, 0.460, 0.420),
    vec3(0.780, 0.540, 0.380), vec3(0.900, 0.620, 0.360), vec3(0.960, 0.740, 0.480), vec3(0.990, 0.860, 0.640),
    vec3(0.231, 0.188, 0.149), vec3(0.431, 0.329, 0.208), vec3(0.706, 0.541, 0.322), vec3(0.941, 0.827, 0.627),
    vec3(0.080, 0.100, 0.220), vec3(0.130, 0.170, 0.340), vec3(0.200, 0.250, 0.460), vec3(0.300, 0.360, 0.580),
    vec3(0.360, 0.260, 0.220));
const vec3 PAL_DAWN[21] = vec3[21](
    vec3(0.060, 0.060, 0.100), vec3(0.100, 0.110, 0.170), vec3(0.160, 0.170, 0.250), vec3(0.240, 0.250, 0.340),
    vec3(0.340, 0.340, 0.440), vec3(0.460, 0.430, 0.520), vec3(0.600, 0.520, 0.600), vec3(0.740, 0.600, 0.660),
    vec3(0.860, 0.680, 0.660), vec3(0.930, 0.780, 0.700), vec3(0.970, 0.880, 0.800), vec3(0.990, 0.950, 0.900),
    vec3(0.231, 0.188, 0.149), vec3(0.431, 0.329, 0.208), vec3(0.706, 0.541, 0.322), vec3(0.941, 0.827, 0.627),
    vec3(0.090, 0.120, 0.250), vec3(0.150, 0.210, 0.400), vec3(0.240, 0.330, 0.560), vec3(0.380, 0.480, 0.700),
    vec3(0.300, 0.270, 0.300));
const vec3 PAL_TAIL = vec3(0.702, 0.235, 0.188);
vec3 quantize(vec3 c, vec2 q) {
    c += (bayer4(q) - 0.5) * 0.075;     // strong enough to bridge the wider steps in the dusk/dawn palettes
    float bd = 1e9; vec3 best = vec3(0.0);
    for (int i = 0; i < 21; i++) {
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
    P.top = vec2(P.base.x + (k == 0 ? 0.02 : 0.0), gy + 1.68 * P.t);    // the near one leans
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

// one hand-placed spruce: base y, centre x, height; tip = snowy tier end
float spruce(vec2 p, float baseY, float cx, float h, float seed, inout float tip) {
    float y = p.y - baseY;
    if (y < 0.0 || y > h) return 0.0;
    float tiers = 6.0 + floor(hash11(seed) * 3.0);
    float s = fract((y / h) * tiers);
    float hw = (h - y) * 0.27 * (0.60 + 0.40 * (1.0 - s));
    hw = max(hw, px1 * 0.8);
    float jag = (hash11(floor(y / px1) + seed) - 0.5) * px1 * 1.6;   // ragged needles
    if (abs(p.x - cx) < hw + jag) {
        if (s > 0.88 && abs(p.x - cx) > hw * 0.55) tip = 1.0;
        return 1.0;
    }
    return 0.0;
}

// spruce with tier information for shading: returns 1 inside; tip = snowy tier end; tier = 0 (base of tier) .. 1 (top)
float spruceT(vec2 p, float baseY, float cx, float h, float seed, out float tip, out float tier) {
    tip = 0.0; tier = 0.0;
    float y = p.y - baseY;
    if (y < 0.0 || y > h) return 0.0;
    float tiers = 6.0 + floor(hash11(seed) * 3.0);
    float s = fract((y / h) * tiers);
    float hw = (h - y) * 0.27 * (0.60 + 0.40 * (1.0 - s));
    hw = max(hw, px1 * 0.8);
    float jag = (hash11(floor(y / px1) + seed) - 0.5) * px1 * 1.6;
    if (abs(p.x - cx) < hw + jag) {
        tier = s;
        if (s > 0.88 && abs(p.x - cx) > hw * 0.55) tip = 1.0;
        return 1.0;
    }
    return 0.0;
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
    float thick = (near && wireSnow > 0.6) ? 2.0 : 1.0;
    if (!fallen && wireSnow > 0.12 && p.y > yw + 0.5 * px1 && p.y < yw + (0.5 + thick) * px1)
        col = DN(vec3(0.40, 0.44, 0.52), vec3(0.93, 0.95, 0.96));
    if (near && meltStart > -1.0 && since > 0.0 && since < 1.6 && wireSnow > 0.12) {
        float cy = yw - 0.30 * since * since;                                          // gravity
        float spread = since * 2.5;                                                     // px: the clump breaks up
        vec2 dd = vec2(p.x - (a.x + (seg + 0.5) / 14.0 * (b.x - a.x)), p.y - cy) / px1;
        if (abs(dd.x) < 1.0 + spread && abs(dd.y) < 1.0 + spread * 0.6) {
            float hp = hash11(floor(dd.x) * 3.1 + floor(dd.y) * 7.7 + seg + span * 11.0);
            if (hp > 0.35 + 0.12 * spread) col = DN(vec3(0.44, 0.48, 0.56), vec3(0.95, 0.96, 0.97));
        }
    }
}

// lamp light at p: ground pool + cone + halo. head = lamp head position, g = ground y under it, k = strength
float lampLight(vec2 p, vec2 head, float g, float k, float strength, out float halo) {   // k = perspective size
    vec2 d = p - head;
    halo = strength * exp(-dot(d, d) / (0.0016 * k));
    float below = head.y - p.y;
    float cone = 0.0;
    if (below > 0.0) {
        float r = below * 0.55 + 0.004;
        cone = smoothstep(r, r * 0.25, abs(d.x)) * smoothstep(head.y - g + 0.02 * k, 0.0, below) * strength;
    }
    vec2 pd = vec2((p.x - head.x) / (0.20 * k), (p.y - g) / (0.045 * k));
    float pool = exp(-dot(pd, pd)) * strength;
    return max(cone * 0.75, pool);
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
    float h1, h2;
    float L = lampLight(p, lamp1, g1, 1.0, 1.0, h1) * f1 + lampLight(p, lamp2, g2, lt2 / lt1, 0.8, h2) * f2;
    h1 *= f1; h2 *= f2;
    float halo = h1 + h2;
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
    col += warm * halo * 0.5;
    // low sun: a pale disc just above the tree line around sunrise / sunset (higher sun lives on the sky screen)
    vec2 sunP = vec2(sunX * A, HZ + sunElev * 0.035);
    float sunD = length(p - sunP);
    if (sunElev > -1.5 && sunElev < 12.0) {
        col = mix(col, mix(vec3(1.0, 0.85, 0.62), vec3(0.98, 0.96, 0.90), day), smoothstep(0.034, 0.030, sunD));
        col += glow * 0.35 * exp(-sunD * 9.0) * (0.4 + twi);
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

    // distant forest: a band of tiny trees on the horizon (t ~ 0.012) and a slightly larger band just in front (t ~ 0.03),
    // sized to match the perspective of the middle groves (tree height ~ 1.1-2.0 x t)
    float farT = spruces(p, HZ - 0.002, 0.012, 0.012, 0.030, 11.0, VP.x, 0.03, tip);
    if (farT > 0.5) { tier = 0.5; SHADE_TREE(p.x, 0.012, false) }
    float tipB = 0.0;
    float farB = spruces(p, HZ - 0.012, 0.024, 0.030, 0.060, 23.0, VP.x, 0.06, tipB);
    if (farB > 0.5 && 0.03 > zTree) { tip = tipB; tier = 0.5; SHADE_TREE(p.x, 0.03, false) }
    // middle groves: both sides, set back from the road, perspective-scaled (height and offset proportional to t)
    for (int side = 0; side < 2; side++) {
        for (int i = 0; i < 12; i++) {
            float hs = hash11(float(i) * 3.71 + float(side) * 17.3);
            float tT = 0.07 + 0.17 * hash11(float(i) * 9.13 + float(side) * 5.1);
            if (tT <= zTree) continue;
            float gy = HZ - tT * HZ;
            float lat = side == 0 ? -(1.5 + 4.0 * hs) : (2.4 + 4.5 * hs);           // world lateral offset (beyond the poles on the right)
            float cxT = roadCx(gy) + roadHw(gy) * sign(lat) + lat * tT;
            float h = (1.1 + 0.9 * hash11(float(i) * 5.3 + float(side))) * tT;
            float tp, tr;
            if (spruceT(p, gy, cxT, h, float(i) * 2.9 + float(side) * 31.0, tp, tr) > 0.5) { tip = tp; tier = tr; SHADE_TREE(cxT, tT, true) }
        }
    }
    // near framing spruces, hand placed (x from the left edge / right edge, base y, height)
    const vec3 LEFT[6]  = vec3[6](vec3(0.03, 0.24, 0.66), vec3(0.11, 0.27, 0.50), vec3(0.18, 0.25, 0.72),
                                 vec3(0.27, 0.29, 0.40), vec3(0.34, 0.31, 0.27), vec3(0.075, 0.30, 0.34));
    const vec3 RIGHT[5] = vec3[5](vec3(0.03, 0.23, 0.74), vec3(0.12, 0.26, 0.56), vec3(0.20, 0.28, 0.42),
                                 vec3(0.27, 0.30, 0.30), vec3(0.085, 0.29, 0.36));
    for (int i = 0; i < 6; i++) {
        float tT = (HZ - LEFT[i].y) / HZ, tp, tr;
        if (tT > zTree && spruceT(p, LEFT[i].y, LEFT[i].x, LEFT[i].z, float(i) * 5.3 + 1.0, tp, tr) > 0.5) { tip = tp; tier = tr; SHADE_TREE(LEFT[i].x, tT, true) }
    }
    for (int i = 0; i < 5; i++) {
        float tT = (HZ - RIGHT[i].y) / HZ, tp, tr;
        if (tT > zTree && spruceT(p, RIGHT[i].y, A - RIGHT[i].x, RIGHT[i].z, float(i) * 7.9 + 2.0, tp, tr) > 0.5) { tip = tp; tier = tr; SHADE_TREE(A - RIGHT[i].x, tT, true) }
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
            float sag = 0.035 * (P.t + Q.t) / 0.55;
            bool single = (P.armR.x - P.armL.x) < 2.0 * px1;          // the two wires would merge: draw just one
            if (onWire(p, P.armL, Q.armL, sag) || (!single && onWire(p, P.armR, Q.armR, sag))) col = wireCol;
            snowOnWire(col, p, P.armL, Q.armL, sag, float(k), 0.0, k < 3);
            snowOnWire(col, p, P.armR, Q.armR, sag, float(k), 1.0, k < 3);
        }
    }
    {   // and back toward the viewer, off the right edge
        Pole P = pole(0);
        if (onWire(p, P.armR, vec2(A + 0.05, P.armY - 0.035), 0.05) || onWire(p, P.armL, vec2(A + 0.05, P.armY - 0.05), 0.06)) col = wireBase;
        snowOnWire(col, p, P.armR, vec2(A + 0.05, P.armY - 0.035), 0.05, 40.0, 1.0, true);
        snowOnWire(col, p, P.armL, vec2(A + 0.05, P.armY - 0.05), 0.06, 41.0, 0.0, true);
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

    // ---------------- CLOUD SHADOWS: a drifting cloud layer projected onto the ground plane (and the trees standing on it)
    {
        float sunUp = day * smoothstep(2.0, 10.0, sunElev);
        bool isTree = zTree > 0.0;
        if (sunUp > 0.01 && (p.y < HZ || isTree)) {
            float tg = max(isTree ? zTree : roadT(p.y), 0.015);         // depth: shadows shrink and flatten toward the horizon
            vec2 w = vec2((p.x - VP.x) / tg, 1.0 / tg);                // world position on the ground (lateral, distance)
            vec2 cp = vec2(w.x * 0.07 + time * 0.010, w.y * 0.22);     // drifts the same way as the sky clouds
            float n = fbm(cp) * 0.75 + fbm(cp * 2.1 + 5.0) * 0.35;
            float cov = mix(0.50, 0.40, e);
            float sh = smoothstep(cov, cov + 0.10, n) * sunUp * (1.0 - 0.6 * smoothstep(0.6, 0.95, e));   // thick overcast: no distinct shadows
            col = mix(col, col * vec3(0.70, 0.76, 0.92), sh * 0.85);    // shaded snow goes cooler and bluer, not just darker
        }
    }

    // ---------------- LAMPLIGHT on the scene (snow takes the warm light; dark shapes barely)
    float lum = dot(col, vec3(0.3, 0.5, 0.2));
    col = mix(col, col + warm * 0.55, clamp(L, 0.0, 1.0) * smoothstep(0.08, 0.30, lum));

    // ---------------- FOG (thickens with the night; warmed in lamplight; dithered by the quantizer)
    float fogH = exp(-max(0.0, p.y - HZ + 0.06) * 5.0);
    float n = vnoise(vec2(p.x * 3.0 + time * 0.006, p.y * 9.0 - time * 0.0015)) * 0.6 + vnoise(vec2(p.x * 9.0 - time * 0.01, p.y * 20.0)) * 0.4;
    float fog = fogAmt * (0.22 + 0.55 * e) * fogH * (0.55 + 0.45 * n);
    fog += fogAmt * e * 0.18 * smoothstep(0.25, 0.0, abs(p.x - roadCx(p.y))) * step(p.y, HZ);   // the road fades first
    vec3 fogCol = mix(mix(DN(vec3(0.17, 0.20, 0.26), vec3(0.84, 0.87, 0.90)), glow, twi * 0.22), warm * 0.75, clamp(L * 0.8, 0.0, 0.7));
    col = mix(col, fogCol, clamp(fog, 0.0, 0.75));

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
        col += lc * on * (1.0 - 0.45 * dfade) * (exp(-dh * (0.55 + 0.5 * dfade)) * 0.55 + exp(-length(vec2((p.x - head.x) / (0.03 * tl / 0.055), (p.y - gy) / (0.008 * tl / 0.055)))) * 0.25);
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
        float wsag = 0.035 * (P0.t + P1.t) / 0.55;
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
    float wind = windAmt * (time * 0.8 + 70.0 * noise1(time / 75.0) + 25.0 * noise1(time / 23.0) + 140.0 * pow(noise1(time / 140.0 + 9.0), 4.0));

    // ---------------- SNOW (in pixel units; 3 layers + rare near flakes)
    vec2 pp = q + 0.5;
    float flake = 0.0;
    for (int l = 0; l < 4; l++) {
        float cs    = l == 0 ? 7.0  : l == 1 ? 11.0 : l == 2 ? 19.0 : 70.0;
        float speed = l == 0 ? 2.6  : l == 1 ? 4.2  : l == 2 ? 6.5  : 5.0;
        float wm    = l == 0 ? 0.45 : l == 1 ? 0.75 : l == 2 ? 1.1  : 1.4;
        float dens  = (l == 0 ? 0.30 : l == 1 ? 0.22 : l == 2 ? 0.12 : 0.025) * snowAmt * 2.0;
        float size  = l == 0 ? 0.55 : l == 1 ? 0.65 : l == 2 ? 0.9  : 2.2;
        float bright= l == 0 ? 0.35 : l == 1 ? 0.55 : l == 2 ? 0.8  : 0.9;
        // varied fall speed: every column of cells has its own pace, so flakes slide past each other
        float sx = pp.x - wind * wm;
        float colH = uh(vec2(floor(sx / cs), 0.0), float(l) * 17.0 + 0.0);
        vec2 sp = vec2(sx, pp.y + time * speed * (0.6 + 0.8 * colH) + colH * 997.0);
        vec2 cell = floor(sp / cs);
        vec2 h = vec2(uh(cell, float(l) * 31.0 + 1.0), uh(cell, float(l) * 31.0 + 2.0));
        // patchy, breathing snowfall: slow drifting bands of heavier/lighter snow + intensity that swells over minutes
        float patchy = smoothstep(0.2, 0.8, vnoise(mod(cell * cs * 0.011 + vec2(time * 0.018, -time * 0.008), 512.0) + float(l) * 3.7));
        float swell = 0.5 + 0.5 * noise1(time / 70.0 + float(l) * 1.3);
        if (h.x > dens * (0.25 + 1.5 * patchy) * (0.45 + 0.75 * swell)) continue;
        vec2 c = (cell + 0.15 + 0.7 * vec2(uh(cell, float(l) * 31.0 + 3.0), uh(cell, float(l) * 31.0 + 4.0))) * cs;
        c.x += sin(time * (0.3 + 0.9 * h.y) + h.y * 40.0) * (0.3 + 1.7 * hash11(h.y * 71.0)) * (1.0 + float(l));   // each flake its own sway       // gentle sway
        float d = length(sp - c);
        if (d < size) flake = max(flake, bright * (l == 3 ? smoothstep(size, size * 0.3, d) : 1.0));
    }
    if (flake > 0.0) {
        float lit = clamp(L * 1.4, 0.0, 1.0);
        float vis = mix(mix(0.10, 1.0, lit), 0.85, day) * flake;              // almost invisible in the dark, plain by day
        vec3 fc = mix(DN(vec3(0.55, 0.60, 0.68), vec3(0.97, 0.98, 0.99)), vec3(1.0, 0.88, 0.70), lit);
        if (lit > 0.55 && uh(q + vec2(floor(time * 6.0), 0.0), 77.0) > 0.93) { fc = vec3(1.0, 0.95, 0.85); vis = 1.0; }  // sparkle
        col = mix(col, fc, vis);
    }

    fragColor = vec4(tail ? PAL_TAIL : exact ? exactCol : quantize(col, q), 1.0) * qt_Opacity;
}
