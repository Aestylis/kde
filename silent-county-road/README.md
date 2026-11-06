# Silent County Road

A quiet pixel-art winter road for KDE Plasma 6 that follows the real sun and moon at your location, with optional live weather. Snow gathers overnight, lights come on at dusk, and a full-sized county snowplow clears the road every morning. The scenery is procedurally generated and rendered on the GPU.

![Silent County Road at night](https://github.com/Aestylis/kde/raw/main/silent-county-road/screenshots/night.gif)

[**Night**](https://github.com/Aestylis/kde/blob/main/silent-county-road/screenshots/1-night.png) | [**The plow**](https://github.com/Aestylis/kde/blob/main/silent-county-road/screenshots/2-plough.png) | [**Noon**](https://github.com/Aestylis/kde/blob/main/silent-county-road/screenshots/3-noon.png) | [**Dusk**](https://github.com/Aestylis/kde/blob/main/silent-county-road/screenshots/4-dusk.png)

## Features

- **Real day and night cycle:** Uses your latitude, longitude and local time to calculate sunrise, sunset, sun position and moon phases. The sky changes naturally throughout the day, including twilight colors, alpenglow and the Belt of Venus.
- **Optional live weather:** Connects to Open-Meteo every 15 minutes for real wind speed, direction, gusts, snowfall and cloud cover. Different cloud layers reflect the actual conditions, from thin high clouds to heavy overcast. Falls back to simulated weather when offline.
- **Dynamic wind and snowfall:** Snow drifts through the scene while trees sway, power lines swing, streetlamps flex and chimney smoke follows the wind. Strong gusts can even knock snow from branches and wires.
- **Snow accumulation:** Snow builds up overnight on the road, rooftops, trees, fences and power lines. It gradually melts, blows away or falls off during the day, with ice crystals sparkling in sunlight.
- **Mountains and forests:** Three mountain ranges and layered spruce forests with realistic lighting, atmospheric haze, snowy peaks and shadows that change with the sun.
- **Rural countryside:** A farmhouse, red barn, log cabin and cottage with smoking chimneys, snow-covered roofs and windows that light up after dark. Residents gradually turn their lights off for the night, and occasionally a TV flickers. Far off in the woods, the lights of a few distant houses twinkle through the trees in the evening.
- **Natural lighting:** Sunlight, moonlight and cloud cover affect the entire landscape. Shadows move with the sun, clouds cast shadows across the fields, and the snow glows under a clear moonlit sky.
- **Passing traffic:** Classic 1980s cars, pickups and vans travel in both directions with working headlights, taillights and reflections. Their tire tracks slowly disappear beneath fresh snow.
- **Wildlife:** Deer wander through during the day, foxes appear at night, and flocks of birds occasionally gather on the power lines. Vehicles stop when animals cross the road.
- **Streetlamps:** Turn off at sunrise and flicker back on at dusk. The far lamp is getting old and occasionally struggles to stay lit.
- **Morning snowplow:** A full-sized county plow truck arrives about 25 minutes after sunrise, complete with amber beacons, a wide orange blade and snow rolling off to the side. It approaches one morning and drives away the next. You can also send it manually from the settings.
- **Second monitor support:** An optional Sky scene shows the same sun, moon, clouds and time of day, synchronized with the main wallpaper.
- **Procedural pixel art:** Custom 3D-generated scenery, material-specific color palettes, dithering and lighting, rendered through a GPU shader. Typical CPU usage is approximately 1–3% of a single core.

Live weather is disabled by default. It requires no account and shares only your configured coordinates with Open-Meteo.

Wildlife sprites are CC0, *Animated Wild Animals* by ScratchIO. See `contents/images/CREDITS.md`.

### Sky scene

[**Sky at night**](https://github.com/Aestylis/kde/blob/main/silent-county-road/screenshots/5-sky-night.png) | [**Sky by day**](https://github.com/Aestylis/kde/blob/main/silent-county-road/screenshots/6-sky-day.png)

## Install

In KDE Plasma, open **Desktop and Wallpaper → Get New Plugins…** and search for **Silent County Road**.

Store page: [store.kde.org/p/2380896](https://store.kde.org/p/2380896)

Or install from source:

```bash
git clone https://github.com/Aestylis/kde
kpackagetool6 -t Plasma/Wallpaper -i kde/silent-county-road
```

Use `-u` instead of `-i` to update an existing installation.

Then select **Silent County Road** under *Desktop and Wallpaper → Wallpaper type*.

## Settings

Customize the scene, pixel size, frame rate, snowfall, fog, wind, lamp flicker and winter conditions. Set your latitude and longitude for accurate sun and moon positions, enable live weather, or preview the scene at any hour.

You can also manually **Send the plough**, **Send wildlife** or **Send a car** whenever you like.

## Building

Run `./build.sh` to compile the shaders and create the store archive in `dist/`.

Requires `qt6-qtshadertools` for `qsb`. The shaders target desktop OpenGL 3.2+, OpenGL ES 3.0 and Vulkan, in the Qt 6.5 shader format so they load on every Plasma 6 system.

## Licence

MIT © Aestylis
