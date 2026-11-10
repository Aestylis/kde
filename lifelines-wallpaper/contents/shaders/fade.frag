#version 440
// Lifelines wallpaper: one fading step of the trail texture (same as Meander). The trail is kept in a half-float texture, whose smallest
// relative step is about 1/2000, far coarser than the fade wanted per step (around 1/10000). So instead of dimming
// every pixel a little, a random few pixels are dimmed by a representable amount; on average it comes out the same.
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float chance;   // share of pixels dimmed this step
    float seed;     // changes every step
};
layout(binding = 1) uniform sampler2D prev;

void main() {
    vec4 c = texture(prev, qt_TexCoord0);
    float h = fract(sin(dot(gl_FragCoord.xy + seed * vec2(17.13, 91.7), vec2(12.9898, 78.233))) * 43758.5453);
    if (h < chance) c *= 0.992;
    fragColor = c;
}
