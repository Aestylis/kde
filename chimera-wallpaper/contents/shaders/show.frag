#version 440
// Chimera wallpaper: draws every oscillator as a dot that flashes once per cycle, like a firefly. A dot's colour
// shows how well it agrees with its neighbours: one colour where the neighbourhood pulses together, another where it
// does not. Everything between the dots is exactly black.
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 grid;      // oscillators across and down
    vec2 size;      // item size, logical px
    float dotSize;  // dot radius at full flash, in cells
    float sharp;    // how brief the flash is
    float gain;
    float px;       // device px per logical px
    vec4 calm;      // colour where neighbours agree
    vec4 wild;      // colour where they do not
};
layout(binding = 1) uniform sampler2D state;
layout(binding = 2) uniform sampler2D field;

float hash(vec2 p) {
    p = fract(p * vec2(0.1031, 0.1030));
    p += dot(p, p.yx + 33.33);
    return fract((p.x + p.y) * p.x);
}

void main() {
    vec2 g = qt_TexCoord0 * grid;
    vec2 cell = floor(g);
    vec2 uv = (cell + 0.5) / grid;
    vec2 s = textureLod(state, uv, 0.0).rg;
    vec2 z = textureLod(field, uv, 0.0).rg;
    // each dot sits a little off its lattice point so the field reads as a swarm, not a display panel
    vec2 centre = cell + 0.5 + 0.13 * (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 2.0;
    float cellPx = size.x / grid.x * px;                 // device px per cell
    float d = length(g - centre) * cellPx;

    float flash = pow(0.5 + 0.5 * s.r, sharp);          // 1 at the top of the cycle
    float agree = smoothstep(0.35, 0.85, length(z));
    vec3 col = mix(wild.rgb, calm.rgb, agree);
    col = mix(col, vec3(1.0), 0.25 * flash * flash);     // the peak of a flash burns towards white

    float r = dotSize * cellPx * (0.4 + 0.6 * flash);
    float core = 1.0 - smoothstep(r - 0.75, r + 0.75, d);
    // the glow has to die out before the edge of the dot's own cell, since only this one dot is looked at here
    vec2 l = abs(g - cell - 0.5);
    float inside = smoothstep(0.0, 0.2, 0.5 - max(l.x, l.y));
    float hs = 0.15 * cellPx;
    float halo = flash * 0.18 * exp(-d * d / (2.0 * hs * hs)) * inside;
    vec3 outc = col * gain * (core * (0.05 + 0.95 * flash) + halo);
    float m = max(outc.r, max(outc.g, outc.b));
    outc *= smoothstep(0.006, 0.03, m);                  // true black between dots
    fragColor = vec4(clamp(outc, 0.0, 1.0), 1.0) * qt_Opacity;
}
