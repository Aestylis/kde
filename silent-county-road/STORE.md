# Silent County Road

### Short description

A quiet pixel-art winter road that follows the real time of day, with a tiny snowplough that clears it every morning.

### Description

A procedural pixel-art winter road with old streetlamps, a line of utility poles receding to the horizon, buried fence posts, snow and fog. Everything is drawn by a single GPU shader, including a little farm across the field (farmhouse, red barn, a cabin and a cottage, with windows lighting up after dark and smoke from the chimneys) and the spruces, which are grown procedurally in 3D, baked to pixel art and relit live by the sun, the moon and the lamps. Clouds are lit by the real sun or moon: bright, sun-facing tops, darker undersides, golden edges at sunset.

The wallpaper follows the real time of day. Sunrise, sunset and the sun's position are calculated from your latitude and longitude. The scene changes between hand-picked palettes for night, dawn, day and dusk, with cold blue nights, rose mornings, clear winter days and mauve evenings.

### Details

- Snow falls in three depth layers. At night, it is mostly visible when passing through the lamplight.
- The streetlamps turn off after sunrise and back on at dusk. They occasionally flicker, especially the far lamp.
- Snow builds on the road overnight while the fog thickens and the fence posts slowly disappear.
- About 25 minutes after sunrise, a small snowplough with an amber beacon clears the road.
- A **Send the plough** button lets you trigger it manually.
- Wind shifts between calm, drifting and gusty conditions.
- Snowfall comes and goes in patches.
- Now and then a car, pickup or van passes in either direction, with headlights or tail lights at night. Its tyre tracks slowly fill back in with snow.
- Snow builds up on the power lines overnight and drops off in clumps through the late morning.
- A deer wanders through by day, stopping to graze; at night a fox trots along the verge under the lamps. Cars brake and wait for anything crossing in front of them. (Animal sprites: CC0, "Animated Wild Animals" by ScratchIO.) There's a **Send wildlife** button too.
- By day, small flocks of birds fly in, sit on the wire for a few minutes, then fly off.

### Two monitors

Set another monitor to **Scene: Sky**.

At night it shows the moon in its current phase behind drifting snow clouds. During the day, the sun moves across the winter sky.

Both scenes use the same clock, so wind and snow stay in sync.

### Performance

About 1 to 3% of one CPU core. Rendering is handled by the GPU at the pixel-art resolution, so it stays light even on large screens.

### Settings

Scene, pixel size, frame rate, snow, fog, wind, lamp flicker, winter mode, latitude and longitude, hour preview, Send the plough and Send wildlife.

Winter mode can follow the day, stay clear, or stay buried.

### Requirements

Requires Plasma 6.

Install from:

**Desktop and Wallpaper > Get New Plugins...**

Or manually:

`kpackagetool6 -t Plasma/Wallpaper -i silent-county-road-1.2.tar.gz`

### Source

https://github.com/Aestylis/kde/tree/main/silent-county-road

### Changelog

**1.2:** A farmhouse, red barn, log cabin and cottage across the fields: every window on its own evening schedule (and a flickering TV), chimney smoke leaning with the wind; wildlife (a deer by day, a fox by night) that traffic stops for; procedurally grown spruces (drooping branch whorls, snow on the boughs that melts by day and builds overnight) that sway in the wind; one gusty wind driving the snowfall, the trees, the chimney smoke and blowing ground snow; banded pixel-art lamplight with a visible beam; passing traffic in both directions with headlights, tail lights and tyre tracks; birds on the wire; a line of utility poles running to the horizon; two distant streetlamps (an old sodium and a cold white LED); snow on the power lines that falls off in clumps during the day; clouds lit by the real sun and moon (ray-marched light, dark undersides); three depth layers of trees with atmospheric perspective; cloud shadows drifting across the snow; rendering at pixel-art resolution for much lower GPU use.

**1.1:** Real day and night cycle, new palettes, dawn snowplough, Send the plough button, Sky scene, patchy snowfall and lamp flicker.

**1.0:** First release with the original night scene and overnight snow buildup.

### Other fields

**Category:** Plasma 6 Wallpaper Plugins
**Version:** 1.2
**Licence:** MIT
**Homepage / source:** https://github.com/Aestylis/kde/tree/main/silent-county-road
**File:** `dist/silent-county-road-1.2.tar.gz` (run `./build.sh`)

**Screenshots:** `screenshots/1-night.png` through `screenshots/6-sky-day.png`
