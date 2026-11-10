#version 440
// Plexus, pass 1: the state of every dot, once per cell instead of once per pixel.
// Renders a 128 x 512 float texture: four 128 x 128 blocks stacked vertically, one per depth layer. Texel (i, j) of a
// block holds the cell whose coordinates are congruent to (i, j) modulo 128 and nearest to the cell in the middle of
// this screen, so the on-screen cells (at most about 80 across) are all there and plexus.frag finds cell c at c & 127.
//   rg = the dot's offset from its cell centre, in cells     b = presence 0..1     a = palette position 0..1
// LSCALE / LANGLE, layerOff() and the hashes must stay identical to plexus.frag.
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float phase;       // 0..1, loops
    float cell;        // cell size of the in-focus layer
    vec2 origin;       // this screen's top-left inside the frame
    vec2 size;         // this screen's size
    vec2 frame;        // size of the frame the pattern is laid out in
    float coverage;    // 0..1
    float layoutMode;  // 0 clusters, 1 wave, 2 everywhere
    float colorMix;    // 0 smooth gradient .. 1 every dot its own colour
};

const float TAU = 6.2831853;
const float LSCALE[4] = float[4](1.0, 1.9, 0.66, 3.1);
const float LANGLE[4] = float[4](0.0, 0.5, -0.35, 1.1);

uint pcg(uint v) {
    uint s = v * 747796405u + 2891336453u;
    uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
    return (w >> 22u) ^ w;
}
float u01(uint h) { return float(h >> 8) * (1.0 / 16777216.0); }
uint hcell(ivec2 c, uint seed) { return pcg(uint(c.x) + pcg(uint(c.y) + seed)); }
vec2 layerOff(int li, uint seed) {
    return vec2(u01(seed), u01(pcg(seed))) * 64.0
         + 1.3 * vec2(cos(TAU * (float(li + 1) * phase + 0.17 * float(li))), sin(TAU * (float(li + 1) * phase)));
}

void main() {
    ivec2 t = ivec2(qt_TexCoord0 * vec2(128.0, 512.0));
    int li = clamp(t.y / 128, 0, 3);
    ivec2 ij = ivec2(t.x, t.y - li * 128);
    uint seed = pcg(uint(li) * 977u + 11u);
    float s = cell * LSCALE[li];
    float cs = cos(LANGLE[li]), sn = sin(LANGLE[li]);
    vec2 off = layerOff(li, seed);

    // the cell in the middle of this screen, then the cell this texel stands for
    vec2 d0 = (origin + size * 0.5 - frame * 0.5) / s;
    ivec2 cc = ivec2(floor(vec2(cs * d0.x - sn * d0.y, sn * d0.x + cs * d0.y) + off));
    ivec2 c = cc + ((ij - cc + 64) & 127) - 64;

    uint h = hcell(c, seed), h2 = pcg(h);
    // wander: two whole-number harmonics per axis, always inside the cell
    float k1 = 20.0 + float(h & 31u), k2 = 45.0 + float((h >> 5) & 63u);
    float k3 = 20.0 + float((h >> 11) & 31u), k4 = 45.0 + float((h >> 16) & 63u);
    vec4 ph = vec4(float(h2 & 255u), float((h2 >> 8) & 255u), float((h2 >> 16) & 255u), float(h2 >> 24)) / 256.0;
    vec4 sw = sin(TAU * fract(vec4(k1, k2, k3, k4) * phase + ph));
    vec2 wander = 0.44 * vec2(0.62 * sw.x + 0.38 * sw.y, 0.62 * sw.z + 0.38 * sw.w);

    // where this cell sits in the frame decides whether its dot exists and what colour it leans to
    vec2 cp = (vec2(c) + 0.5 - off) * s;
    vec2 uv = (vec2(cs * cp.x + sn * cp.y, -sn * cp.x + cs * cp.y) + frame * 0.5) / frame;
    float x = uv.x * frame.x / frame.y + 0.37 * float(li), y = uv.y;
    float m = 2.0;
    if (layoutMode < 1.5) {
        float nz = 0.5 + 0.25 * (sin(x * 4.7 + 1.7 * sin(y * 3.9 + TAU * 2.0 * phase) + TAU * 3.0 * phase)
                               + sin(y * 6.1 - 1.3 * sin(x * 2.9 - TAU * 4.0 * phase) + TAU * 5.0 * phase + 2.0));
        if (layoutMode > 0.5) {
            float yc = 0.5 + 0.11 * sin(uv.x * 4.0 + TAU * 3.0 * phase) + 0.05 * sin(uv.x * 9.0 - TAU * 5.0 * phase);
            m = 1.0 - abs(uv.y - yc) * 2.2 + (nz - 0.5) * 0.55;
        } else m = nz;
    }
    float th = 1.0 - coverage;
    float pw = smoothstep(th - 0.07, th + 0.07, m);
    // each dot also fades out for a while now and then
    pw *= smoothstep(-0.95, -0.6, sin(TAU * fract((6.0 + float((h >> 22) & 15u)) * phase + float(h >> 26) / 64.0)));
    float sp = uv.x * 0.8 + 0.1 + 0.13 * sin(x * 2.3 + y * 3.1 + TAU * 2.0 * phase) + 0.09 * sin(y * 7.0 - x * 1.9 - TAU * 3.0 * phase);
    fragColor = vec4(wander, pw, clamp(mix(sp, u01(pcg(h2)), colorMix), 0.0, 1.0));
}
