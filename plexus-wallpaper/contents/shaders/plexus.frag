#version 440
// Plexus wallpaper. Everything is drawn per pixel, no geometry:
//   * the plane is cut into square cells and every cell owns one dot that wanders inside it,
//   * a pixel only has to look at the 4x4 cells nearest to it: because links are never longer than 1.5 cells, every
//     line or triangle that can touch the pixel has all its corners in that neighbourhood. Of those 16 cells only the
//     dots within link distance of the pixel are kept (usually about four), so the pair and triple loops stay tiny,
//   * dots closer than linkDist are joined by a line, three mutually linked dots may fill in as a translucent triangle,
//   * several such layers at different scales are stacked; the out-of-focus ones are softened analytically (wider,
//     dimmer edges) instead of with a blur pass, and main.qml renders them at reduced resolution since they are soft,
//   * all lengths are logical px of the desktop layout, so neighbouring monitors continue each other's pattern,
//   * all motion is built from whole-number multiples of one loop phase, so it never drifts or loses float precision.
// Output is additive (alpha 0) over a black rectangle. Background stays exactly 0,0,0 (pixels off on OLED): faint blur
// tails are cut and dither is only added on lit pixels.
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float phase;       // 0..1, loops
    float cell;        // cell size of the in-focus layer
    float texel;       // logical px per rendered texel (large for the low-resolution blurred layers)
    float layerMask;   // which layers this instance draws: 1 focus, 2 near blur, 4 far, 8 very near
    vec2 origin;       // this screen's top-left inside the frame
    vec2 size;         // this screen's size
    vec2 frame;        // size of the frame the pattern is laid out in: the whole desktop when spanning, else the screen
    float linkDist;    // in cells, at most 1.5
    float dotR;
    float lineW;       // half width
    float lineGain;
    float triAmount;   // 0..1 share of eligible triangles that fill in
    float triOpacity;  // 0..1
    float blur;        // at blur factor 1
    float glow;        // 0..1
    float coverage;    // 0..1
    float layoutMode;  // 0 clusters, 1 wave, 2 everywhere
    float colorMix;    // 0 smooth gradient .. 1 every dot its own colour
    float nColors;     // 3 or 4
    float gain;
    vec4 c1; vec4 c2; vec4 c3; vec4 c4;
};

const float TAU = 6.2831853;

uint pcg(uint v) {
    uint s = v * 747796405u + 2891336453u;
    uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
    return (w >> 22u) ^ w;
}
float u01(uint h) { return float(h >> 8) * (1.0 / 16777216.0); }
uint hcell(ivec2 c, uint seed) { return pcg(uint(c.x) + pcg(uint(c.y) + seed)); }

vec3 pal(float t) {
    t = clamp(t, 0.0, 1.0) * (nColors - 1.0);
    if (t < 1.0) return mix(c1.rgb, c2.rgb, t);
    if (t < 2.0) return mix(c2.rgb, c3.rgb, t - 1.0);
    return mix(c3.rgb, c4.rgb, t - 2.0);
}

// thin things get dimmer as their light is spread out
float spread(float hw, float b) { return pow((hw + 0.75) / (hw + 0.75 + b), 0.4); }

vec3 layer(vec2 fp, int li, float scale, float ang, float bf, float dim) {
    uint seed = pcg(uint(li) * 977u + 11u);
    float s = cell * scale;                 // px per cell
    float b = blur * bf;
    float aa = 0.75 * texel;
    float cs = cos(ang), sn = sin(ang);
    vec2 off = vec2(u01(seed), u01(pcg(seed))) * 64.0
             + 1.3 * vec2(cos(TAU * (float(li + 1) * phase + 0.17 * float(li))), sin(TAU * (float(li + 1) * phase)));
    vec2 d0 = (fp - frame * 0.5) / s;
    vec2 q = vec2(cs * d0.x - sn * d0.y, sn * d0.x + cs * d0.y) + off;
    vec2 base = floor(q);
    vec2 f = q - base;
    ivec2 ib = ivec2(base);
    ivec2 o0 = ivec2(f.x >= 0.5 ? -1 : -2, f.y >= 0.5 ? -1 : -2);

    float hwL = lineW * scale, rD = dotR * scale;
    float sig = 5.0 * scale;
    float gl = b < 1.0 ? glow * 0.2 : 0.0;
    float edge = (b + aa + (gl > 0.0 ? 3.0 * sig : 0.0)) / s;      // how far outside a shape it still lights pixels, cells
    float lineReach = edge + hwL / s, dotReach = edge * 1.6 + rD / s;
    float reach = min(linkDist + lineReach, 1.5);
    float asp = frame.x / frame.y;
    float th = 1.0 - coverage;

    // gather the dots that can matter for this pixel
    vec2 P[16]; float PW[16]; float PT[16]; float PD[16]; uint PID[16];
    int cnt = 0;
    for (int n = 0; n < 16; n++) {
        vec2 o = vec2(o0 + ivec2(n % 4, n / 4));
        vec2 bd = max(max(o + 0.06 - f, f - o - 0.94), 0.0);
        if (dot(bd, bd) > reach * reach) continue;
        ivec2 c = ib + ivec2(o);
        uint h = hcell(c, seed), h2 = pcg(h);
        // wander: two whole-number harmonics per axis, always inside the cell
        float k1 = 20.0 + float(h & 31u), k2 = 45.0 + float((h >> 5) & 63u);
        float k3 = 20.0 + float((h >> 11) & 31u), k4 = 45.0 + float((h >> 16) & 63u);
        vec4 ph = vec4(float(h2 & 255u), float((h2 >> 8) & 255u), float((h2 >> 16) & 255u), float(h2 >> 24)) / 256.0;
        vec4 sw = sin(TAU * fract(vec4(k1, k2, k3, k4) * phase + ph));
        vec2 p = o + 0.5 + 0.44 * vec2(0.62 * sw.x + 0.38 * sw.y, 0.62 * sw.z + 0.38 * sw.w);
        float d = length(f - p);
        if (d > reach) continue;
        // where this cell sits on screen decides whether its dot exists and what colour it leans to
        vec2 cc = (vec2(c) + 0.5 - off) * s;
        vec2 uv = (vec2(cs * cc.x + sn * cc.y, -sn * cc.x + cs * cc.y) + frame * 0.5) / frame;
        float x = uv.x * asp + 0.37 * float(li), y = uv.y;
        float m = 2.0;
        if (layoutMode < 1.5) {
            float nz = 0.5 + 0.25 * (sin(x * 4.7 + 1.7 * sin(y * 3.9 + TAU * 2.0 * phase) + TAU * 3.0 * phase)
                                   + sin(y * 6.1 - 1.3 * sin(x * 2.9 - TAU * 4.0 * phase) + TAU * 5.0 * phase + 2.0));
            if (layoutMode > 0.5) {
                float yc = 0.5 + 0.11 * sin(uv.x * 4.0 + TAU * 3.0 * phase) + 0.05 * sin(uv.x * 9.0 - TAU * 5.0 * phase);
                m = 1.0 - abs(uv.y - yc) * 2.2 + (nz - 0.5) * 0.55;
            } else m = nz;
        }
        float pw = smoothstep(th - 0.07, th + 0.07, m);
        if (pw <= 0.0) continue;
        // each dot also fades out for a while now and then
        pw *= smoothstep(-0.95, -0.6, sin(TAU * fract((6.0 + float((h >> 22) & 15u)) * phase + float(h >> 26) / 64.0)));
        if (pw <= 0.0) continue;
        float sp = uv.x * 0.8 + 0.1 + 0.13 * sin(x * 2.3 + y * 3.1 + TAU * 2.0 * phase) + 0.09 * sin(y * 7.0 - x * 1.9 - TAU * 3.0 * phase);
        P[cnt] = p; PW[cnt] = pw; PD[cnt] = d; PID[cnt] = h;
        PT[cnt] = mix(sp, u01(pcg(h2)), colorMix);
        cnt++;
    }
    if (cnt == 0) return vec3(0.0);

    vec3 col = vec3(0.0);
    float eL = spread(hwL, b) * lineGain;

    // links
    float W[256];
    for (int i = 0; i < cnt - 1; i++) {
        for (int j = i + 1; j < cnt; j++) {
            vec2 ba = P[j] - P[i];
            float L = length(ba);
            float wl = (1.0 - smoothstep(linkDist * 0.78, linkDist, L)) * PW[i] * PW[j];
            W[i * 16 + j] = wl;
            if (wl <= 0.0 || PD[i] + PD[j] > L + lineReach) continue;
            vec2 pa = f - P[i];
            float h = clamp(dot(pa, ba) / (L * L), 0.0, 1.0);
            float d = length(pa - ba * h) * s;
            float a = (1.0 - smoothstep(hwL - b - aa, hwL + b + aa, d)) * eL + gl * exp(-d * d / (2.0 * sig * sig));
            col += pal(mix(PT[i], PT[j], h)) * (a * wl);
        }
    }

    // triangles
    if (triAmount > 0.0 && triOpacity > 0.0) {
        for (int i = 0; i < cnt - 2; i++) {
            for (int j = i + 1; j < cnt - 1; j++) {
                float wij = W[i * 16 + j];
                if (wij <= 0.0) continue;
                for (int k = j + 1; k < cnt; k++) {
                    float wjk = W[j * 16 + k], wik = W[i * 16 + k];
                    if (wjk <= 0.0 || wik <= 0.0) continue;
                    uint th3 = pcg(PID[i] ^ pcg(PID[j] + pcg(PID[k])));
                    if (u01(th3) >= triAmount) continue;
                    vec2 A = P[i], B = P[j], C = P[k];
                    vec2 ab = B - A, bc = C - B, ca = A - C;
                    float area = ab.x * (C.y - A.y) - ab.y * (C.x - A.x);
                    if (abs(area) < 1e-4) continue;
                    float sg = sign(area);
                    float lbc = length(bc);
                    float dAB = sg * (ab.x * (f.y - A.y) - ab.y * (f.x - A.x)) / length(ab);
                    float dBC = sg * (bc.x * (f.y - B.y) - bc.y * (f.x - B.x)) / lbc;
                    float dCA = sg * (ca.x * (f.y - C.y) - ca.y * (f.x - C.x)) / length(ca);
                    float a = smoothstep(-b - aa, b + aa, min(dAB, min(dBC, dCA)) * s);
                    if (a <= 0.0) continue;
                    float bary = clamp(dBC * lbc / abs(area), 0.0, 1.0);   // 1 at A, 0 on the far edge
                    uint t2 = pcg(th3);
                    float op = triOpacity * mix(0.1, 1.0, u01(t2));
                    float wt = smoothstep(0.0, 0.45, min(wij, min(wjk, wik)));
                    float tt = (PT[i] + PT[j] + PT[k]) / 3.0 + (float(t2 & 255u) / 255.0 - 0.5) * 0.12;
                    col += pal(tt) * (a * op * wt * mix(0.4, 1.0, bary));
                }
            }
        }
    }

    // dots
    float eD = spread(rD, b * 0.6);
    float white = b < 1.0 ? 0.55 : 0.15;
    for (int n = 0; n < cnt; n++) {
        if (PD[n] > dotReach) continue;
        float d = PD[n] * s;
        float a = (1.0 - smoothstep(rD - b - aa, rD + b + aa, d)) * eD + gl * 1.6 * exp(-d * d / (5.0 * sig * sig));
        col += mix(pal(PT[n]), vec3(1.0), white) * (a * PW[n]);
    }
    return col * dim;
}

void main() {
    vec2 fp = origin + qt_TexCoord0 * size;
    int mask = int(layerMask + 0.5);
    vec3 col = vec3(0.0);
    if ((mask & 1) != 0) col += layer(fp, 0, 1.0, 0.0, 0.0, 1.0);
    if ((mask & 2) != 0) col += layer(fp, 1, 1.9, 0.5, 1.0, 0.95);
    if ((mask & 4) != 0) col += layer(fp, 2, 0.66, -0.35, 0.3, 0.7);
    if ((mask & 8) != 0) col += layer(fp, 3, 3.1, 1.1, 2.2, 0.8);
    col *= gain;

    // overlaps burn towards white instead of clipping one channel
    float m = max(col.r, max(col.g, col.b));
    if (m > 1.0) col = mix(col / m, vec3(1.0), clamp((m - 1.0) * 0.35, 0.0, 1.0));
    // true black: cut the faint tails, dither only what is lit
    m = min(m, 1.0);
    col *= smoothstep(0.006, 0.03, m);
    float ign = fract(52.9829189 * fract(dot(floor(qt_TexCoord0 * size / texel), vec2(0.06711056, 0.00583715))));
    col += (ign - 0.5) / 255.0 * smoothstep(0.03, 0.06, m);
    fragColor = vec4(clamp(col, 0.0, 1.0), 0.0) * qt_Opacity;
}
