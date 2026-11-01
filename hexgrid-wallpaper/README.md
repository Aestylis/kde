# Hexgrid (Ember)

An animated hex-grid wallpaper for KDE Plasma 6: a drifting black → grey → orange gradient field where neighbouring
hexes shrink, slide past each other and swap places. Rendered on the GPU (one fragment shader, ~4 % of one CPU core at
3440×1440). A desktop port of the Hexgrid theme from [unraid-starfield](https://github.com/Aestylis/unraid-starfield).

```
git clone https://github.com/Aestylis/kde
kpackagetool6 -t Plasma/Wallpaper -i kde/hexgrid-wallpaper      # upgrade later with -u
```

Pick **Hexgrid (Ember)** under *Desktop and Wallpaper → Wallpaper type*. Settings: hex size, frame rate, swaps per
second. Rebuild the shader after editing:
`qsb --glsl "100 es,120,150" --hlsl 50 --msl 12 -o contents/shaders/hexgrid.frag.qsb contents/shaders/hexgrid.frag`
