# Silent County Road

A quiet pixel-art winter road for KDE Plasma 6 that follows the real time of day, with a tiny snowplough that clears
it every morning. Fully procedural: one GPU fragment shader, no images.

![Silent County Road at night — snow drifting through the lamplight, the far lamp stuttering](screenshots/night.gif)

![Night](screenshots/1-night.png)
![The plough](screenshots/2-plough.png)
![Noon](screenshots/3-noon.png)
![Dusk](screenshots/4-dusk.png)

- Three depth layers of spruces with atmospheric perspective (distance fades toward the sky) and sun-facing lighting
- Mountains on the horizon in three ranges (a broad snow-capped massif, a hazy middle range, a forested ridge with spruces along its crest), each range's height, roughness, haze, snowline and treeline set by its distance; rounded ridged-multifractal crests with domain warping, buttresses and gullies lit from the sun / moon side, a ragged snowline with snow down the gullies, alpenglow at dawn and dusk; the low sun can set behind a peak
- A farmhouse, red barn, log cabin and cottage across the fields, built from 3D solids and ray-cast to pixel art by `tools/gen_houses.py`: snow on the roofs, drifts against the walls, every window lighting up after dark on its own schedule (lights go out one by one between 21:00 and 00:30, a few come back on before dawn, sometimes a TV flickers blue), chimney smoke rising and leaning with the wind
- Spruces grown procedurally in 3D (whorls of drooping branches, side sprays, snow on the boughs, dead lower twigs, broken tops), baked to a relightable pixel-art atlas by `tools/gen_trees.py` and lit live by the sun, the moon and the lamps; their tops sway in the wind, and the snow on their boughs builds overnight and melts off by day (sunny outer clumps first)
- One gusty wind for the whole scene: falling snow slants and streams with it, the trees lean in gusts, the power lines swing and bob (each span on its own rhythm) and strong gusts shake clumps of snow off them, chimney smoke bends, and strong gusts lift wisps of blowing snow across the fields and the road; the falling snow eddies on a swirling (curl-noise) flow and the near flakes streak along their path in gusts
- Twilight sky physics: Earth's shadow (a dark blue band rising from the horizon as the sun sinks) with the pink Belt of Venus above it, opposite the sun: on the left at dusk, the right at dawn, lighting the low clouds there too
- Two kinds of dithering, as in Return of the Obra Dinn: interleaved gradient noise (blue-noise-like grain) for the sky, clouds and mountains, crisp 4x4 Bayer for everything else
- Snow glitter: sparse ice-crystal glints flashing white, cyan and gold on the sunlit snow (drawn past the palette, brighter than the snow), warm glints in the lamplit snow at night
- Cast shadows: trees, houses, utility poles and lamp posts throw clear blue shadows across the snow, away from the real sun: long at dawn and dusk, short at noon, softened by overcast (worked out in world metres from the scene's perspective)
- Cloud shadows drifting across the snowfield, the road and the trees on sunny days
- Clouds lit by the real sun or moon: sunlit tops, dark undersides, golden edges at sunset
- Real sunrise / sunset / sun position for your latitude and longitude; hand-picked palettes for night, dawn, day, dusk
- Snow in three depth layers, mostly visible in the lamplight at night; patchy, drifting snowfall and wind moods
- Occasional traffic in both directions: headlights or tail lights at night, tyre tracks that fill back in
- Snow builds on the power lines overnight and falls off in clumps through the late morning
- A deer wanders through by day (stopping to graze); a fox by night; traffic stops for them if they cross. Animal sprites are CC0, "Animated Wild Animals" by ScratchIO (see contents/images/CREDITS.md)
- By day, flocks of birds land on the wire for a few minutes, then fly off
- Streetlamps off by day, stuttering on at dusk, occasionally flickering (the far one is dying)
- Snow builds on the road overnight; ~25 min after sunrise a plough with an amber beacon clears it
  (or press **Send the plough** in the settings)
- **Scene: Sky** for a monitor above: the real moon phase behind snow clouds at night, the sun crossing by day;
  both screens share one clock
- ~1–3 % of one CPU core

![Sky at night](screenshots/5-sky-night.png)
![Sky by day](screenshots/6-sky-day.png)

## Install

From Plasma: *Desktop and Wallpaper → Get New Plugins…* and search for **Silent County Road**.

From source:

```
git clone https://github.com/Aestylis/kde
kpackagetool6 -t Plasma/Wallpaper -i kde/silent-county-road      # upgrade later with -u
```

Then pick **Silent County Road** under *Desktop and Wallpaper → Wallpaper type*.

## Settings

Scene (road / sky), pixel size, frame rate, snow, fog, wind, lamp flicker, winter mode (follows the day / always
clear / always buried), latitude and longitude, preview any hour, Send the plough and Send wildlife.

## Building

`./build.sh` recompiles the shaders (needs `qt6-qtshadertools` for `qsb`) and writes the store archive to `dist/`.
The shaders use an integer hash, so they target desktop OpenGL / Vulkan (GLSL 150/330), not GLES.

## Licence

MIT © Aestylis
