#version 440
// Chimera wallpaper: one direction of a separable Gaussian blur over the oscillator field (cos, sin of each phase).
// Run across, then down, it gives every oscillator the average rhythm of its neighbourhood, which is what it is
// pulled towards. The field wraps around at the edges.
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 dir;       // one texel along the blur direction, in texture coordinates
    float radius;   // reach of the coupling, in oscillators (at most 12)
};
layout(binding = 1) uniform sampler2D src;

void main() {
    vec2 acc = vec2(0.0);
    float wsum = 0.0;
    float sigma = max(radius, 1.0) * 0.5;
    for (int i = -12; i <= 12; i++) {
        float fi = float(i);
        if (abs(fi) > radius) continue;
        float w = exp(-0.5 * fi * fi / (sigma * sigma));
        acc += w * textureLod(src, qt_TexCoord0 + dir * fi, 0.0).rg;
        wsum += w;
    }
    fragColor = vec4(acc / wsum, 0.0, 1.0);
}
