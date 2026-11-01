# Silent County Road

### Short description

A quiet pixel-art winter road that follows the real time of day, with a tiny snowplough that clears it every morning.

### Description

A procedural pixel-art winter road with two old streetlamps, a leaning utility pole, buried fence posts, snow and fog. Everything is drawn by a single GPU shader. No images or textures.

The wallpaper follows the real time of day. Sunrise, sunset and the sun's position are calculated from your latitude and longitude. The scene changes between hand-picked palettes for night, dawn, day and dusk, with cold blue nights, rose mornings, clear winter days and mauve evenings.

### Details

- Snow falls in three depth layers. At night, it is mostly visible when passing through the lamplight.
- The streetlamps turn off after sunrise and back on at dusk. They occasionally flicker, especially the far lamp.
- Snow builds on the road overnight while the fog thickens and the fence posts slowly disappear.
- About 25 minutes after sunrise, a small snowplough with an amber beacon clears the road.
- A **Send the plough** button lets you trigger it manually.
- Wind shifts between calm, drifting and gusty conditions.
- Snowfall comes and goes in patches.

### Two monitors

Set another monitor to **Scene: Sky**.

At night it shows the moon in its current phase behind drifting snow clouds. During the day, the sun moves across the winter sky.

Both scenes use the same clock, so wind and snow stay in sync.

### Performance

About 1 to 3% of one CPU core. Rendering is handled by the GPU.

### Settings

Scene, pixel size, frame rate, snow, fog, wind, lamp flicker, winter mode, latitude and longitude, hour preview, and Send the plough.

Winter mode can follow the day, stay clear, or stay buried.

### Requirements

Requires Plasma 6.

Install from:

**Desktop and Wallpaper > Get New Plugins...**

Or manually:

`kpackagetool6 -t Plasma/Wallpaper -i silent-county-road-1.1.tar.gz`

### Source

https://github.com/Aestylis/silent-county-road

### Changelog

**1.1:** Real day and night cycle, new palettes, dawn snowplough, Send the plough button, Sky scene, patchy snowfall and lamp flicker.

**1.0:** First release with the original night scene and overnight snow buildup.

### Other fields

**Category:** Plasma 6 Wallpaper Plugins
**Version:** 1.1
**Licence:** MIT
**Homepage / source:** https://github.com/Aestylis/silent-county-road
**File:** `dist/silent-county-road-1.1.tar.gz` (run `./build.sh`)

**Screenshots:** `screenshots/1-night.png` through `screenshots/6-sky-day.png`
