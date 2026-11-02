# Silent County Road

### Short description

A quiet pixel-art winter road that follows the real time of day and weather, with a county snowplough that clears it every morning.

### Description

A fully procedural pixel-art winter landscape that follows the real time of day and can even reflect the weather outside.

### Features

- **Location-based day and night:** Uses your latitude, longitude, date and time to calculate sunrise, sunset, sun position, moon position and lunar phases.
- **Realistic skies:** Changing colors throughout the day, including dawn, dusk, Earth's shadow and the pink Belt of Venus.
- **Optional live weather:** Connects to Open-Meteo every 15 minutes for actual cloud cover, cloud types, snowfall, wind speed, gusts and direction. Falls back to simulated weather when offline.
- **Dynamic clouds:** Realistic coverage, with low, middle and high cloud setting how dense or thin the sky looks, lit by sunlight and moonlight, with moving cloud shadows.
- **Wind simulation:** Wind affects everything together, from swaying trees and power lines to drifting snow, chimney smoke and even streetlamps.
- **Natural lighting:** Sunlight and moonlight create directional shadows that change with the time of day. Cloud cover softens them, while snow glitters in sunlight and lamplight.
- **Layered landscape:** Snow-covered mountains, distant ridges and spruce forests with atmospheric haze and changing light.
- **Living trees:** Procedurally generated spruces sway in the wind, collect snow overnight and gradually shed it during the day.
- **Rural buildings:** A farmhouse, barn, cabin and cottage with snowy roofs, chimney smoke and windows that turn on and off throughout the evening.
- **Winter weather:** Snow falls at different depths, collects on surfaces, forms drifts and blows across the landscape during gusts.
- **Passing traffic:** Classic 1980s vehicles travel in both directions with working lights, reflections, accumulating roof snow and tire tracks that slowly disappear.
- **Wildlife:** Deer during the day, foxes at night and birds occasionally gathering on power lines. Vehicles stop for crossing animals.
- **Streetlamps:** Automatically switch on at dusk and off at sunrise, with occasional flickering and wind movement.
- **Morning snowplough:** Clears overnight snowfall about 25 minutes after sunrise, coming toward you one morning and driving away the next. Can also be sent manually from settings.
- **Custom pixel-art rendering:** Procedural 3D scenery converted into pixel art, with material-specific color palettes, shading and dithering.
- **Dual-monitor support:** An optional Sky scene displays the same sun, moon and weather on a second monitor, synchronized with the main wallpaper.
- **Lightweight:** Approximately 1–3% usage of a single CPU core.

Live weather is optional and disabled by default. It requires no account and shares only your configured coordinates with Open-Meteo.

Wildlife sprites: CC0, *Animated Wild Animals* by ScratchIO. See `contents/images/CREDITS.md`.

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

**1.2:** Optional live weather from open-meteo.com (real wind, snowfall and cloud cover for your location, off by default); snow-capped mountains on the horizon (alpenglow at dawn and dusk); a farmhouse, red barn, log cabin and cottage across the fields: every window on its own evening schedule (and a flickering TV), chimney smoke leaning with the wind; wildlife (a deer by day, a fox by night) that traffic stops for; procedurally grown spruces (drooping branch whorls, snow on the boughs that melts by day and builds overnight) that sway in the wind; one gusty wind driving the snowfall, the trees, the chimney smoke and blowing ground snow; banded pixel-art lamplight with a visible beam; passing traffic in both directions with headlights, tail lights and tyre tracks; birds on the wire; a line of utility poles running to the horizon; two distant streetlamps (an old sodium and a cold white LED); snow on the power lines that falls off in clumps during the day; clouds lit by the real sun and moon (ray-marched light, dark undersides); three depth layers of trees with atmospheric perspective; cloud shadows drifting across the snow; rendering at pixel-art resolution for much lower GPU use.

**1.1:** Real day and night cycle, new palettes, dawn snowplough, Send the plough button, Sky scene, patchy snowfall and lamp flicker.

**1.0:** First release with the original night scene and overnight snow buildup.

### Other fields

**Category:** Plasma 6 Wallpaper Plugins
**Version:** 1.2
**Licence:** MIT
**Homepage / source:** https://github.com/Aestylis/kde/tree/main/silent-county-road
**File:** `dist/silent-county-road-1.2.tar.gz` (run `./build.sh`)

**Screenshots:** `screenshots/1-night.png` through `screenshots/6-sky-day.png`
