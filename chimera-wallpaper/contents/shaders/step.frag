#version 440
// Chimera wallpaper: one time step of the oscillator field. One texel is one oscillator, stored as (cos, sin) of
// its phase. Each oscillator runs at its own pace and is pulled towards the average rhythm of its neighbourhood
// (the blurred field), but with a phase lag `alpha` (the Kuramoto-Sakaguchi model). With no lag everything falls
// into step. With a lag near a quarter turn, the field splits: some regions pulse in unison, in waves and spirals,
// while others never settle — a chimera state.
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 grid;      // oscillators across and down
    float omega;    // natural pace, radians per step
    float pull;     // coupling strength, radians per step
    float alpha;    // phase lag, radians
    float reset;    // > 0.5: start over from random phases
    float seed;
};
layout(binding = 1) uniform sampler2D state;
layout(binding = 2) uniform sampler2D field;

float hash(vec2 p) {
    p = fract(p * vec2(0.1031, 0.1030) + seed * 0.37);
    p += dot(p, p.yx + 33.33);
    return fract((p.x + p.y) * p.x);
}

void main() {
    vec2 cell = floor(qt_TexCoord0 * grid);
    float th;
    if (reset > 0.5) {
        th = 6.2831853 * hash(cell + 0.5);
    } else {
        vec2 s = textureLod(state, qt_TexCoord0, 0.0).rg;
        vec2 z = textureLod(field, qt_TexCoord0, 0.0).rg;
        th = atan(s.g, s.r);
        float own = omega * (1.0 + 0.04 * (hash(cell * 1.7 + 11.0) - 0.5));   // nobody keeps perfect time
        th += own + pull * (z.g * cos(th + alpha) - z.r * sin(th + alpha));
    }
    fragColor = vec4(cos(th), sin(th), 0.0, 1.0);
}
