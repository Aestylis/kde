# KDE Plasma bits by Aestylis

Procedural, GPU-rendered wallpapers for KDE Plasma 6. Each folder is a standalone Plasma package.

| | |
|---|---|
| [**Silent County Road**](silent-county-road/) | A quiet pixel-art winter road that follows the real time of day, with a tiny snowplough that clears it every morning. Includes a Sky scene for a second monitor. |
| [**Hexgrid (Ember)**](hexgrid-wallpaper/) | An animated black/grey/orange hex grid whose tiles drift in colour and swap places. |
| [**Plexus**](plexus-wallpaper/) | Drifting dots that link up with lines and translucent triangles, with depth blur, on true black for OLED. Colours, counts and speed are adjustable. |
| [**Meander**](meander-wallpaper/) | A river that slowly wanders, cuts off oxbow lakes and leaves its old courses behind as fading coloured bands, like a survey map of its past. |

![Silent County Road at night](silent-county-road/screenshots/night.gif)

## Install

```
git clone https://github.com/Aestylis/kde
kpackagetool6 -t Plasma/Wallpaper -i kde/silent-county-road
kpackagetool6 -t Plasma/Wallpaper -i kde/hexgrid-wallpaper
kpackagetool6 -t Plasma/Wallpaper -i kde/plexus-wallpaper
kpackagetool6 -t Plasma/Wallpaper -i kde/meander-wallpaper
```

Then choose the wallpaper under *Desktop and Wallpaper → Wallpaper type*. Use `-u` instead of `-i` to upgrade.

## Licence

MIT © Aestylis
