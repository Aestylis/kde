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

`kpackagetool6 -t Plasma/Wallpaper -i silent-county-road-2.0.tar.gz`

### Source

https://github.com/Aestylis/kde/tree/main/silent-county-road

### Changelog

**2.0:** A full landscape. Optional live weather from Open-Meteo (wind, gusts, direction, snowfall, cloud cover and cloud type); moonlight and sunlight cast shadows; Earth's shadow and the Belt of Venus at twilight; three mountain ranges with alpenglow; procedurally grown spruces that sway, hold snow overnight and shed it by day; a farmhouse, red barn, cabin and cottage with chimney smoke and windows on their own evening schedules; 1980s traffic and a full-sized county snowplow drawn in 3D through the scene's camera; deer by day, foxes at night, birds on the wire; one gusty wind driving snow, trees, wires, smoke and streetlamps; snow glitter; material-specific shading ramps and dithering.

**1.1:** Real day and night cycle, new palettes, dawn snowplough, Send the plough button, Sky scene, patchy snowfall and lamp flicker.

**1.0:** First release with the original night scene and overnight snow buildup.

### Other fields

**Category:** Plasma 6 Wallpaper Plugins
**Version:** 2.0
**Licence:** MIT
**Homepage / source:** https://github.com/Aestylis/kde/tree/main/silent-county-road
**File:** `dist/silent-county-road-2.0.tar.gz` (run `./build.sh`)

**Screenshots:** `screenshots/1-night.png` through `screenshots/6-sky-day.png`
