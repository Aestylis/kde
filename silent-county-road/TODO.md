# Silent County Road — to do

Realism pass (from the 2026-11-01 research: palette ramps, dithering, sky models, snow rendering), one at a time:

- [x] **Cast shadows at low sun.** Trees, poles, lamps and houses throw long blue shadows across the snow, stretching away from the real sun. Long at dawn and dusk, short at noon, gone under thick overcast.
- [x] **Belt of Venus and Earth's shadow.** At twilight, a pink band sits above a dark blue band in the sky opposite the sun. Very striking over snow.
- [x] **Snow glitter.** Sparse points twinkling on the sunlit snowfield and under the lamps, driven by time and the sun's movement (the camera is fixed). Based on the jittered sparkle grid from real-time sparkle papers.
- [x] **Blue-noise dithering for sky, fog and clouds.** Interleaved gradient noise in place of Bayer for the environment (no crosshatch, film-grain look); Bayer stays for objects, as in Obra Dinn.
- [x] **Snowfall motion.** Near flakes stretch into short streaks in strong gusts, plus a little curl-noise turbulence so flakes eddy instead of sliding in lockstep.
- [ ] **Snow that settles by slope and shelter.** Snow caps on fence posts, lamp heads and crossarms; drifts banked on the windward side of buildings.
- [ ] **Shading ramps for each material** (the deep one, its own session). Every material gets its own hue-shifted ramp (cool shadows, warm highlights, about 20° of hue over 3–5 steps) and light picks a step on it, replacing the snap to the nearest of 23 palette colours. LutLight2D-style.

Done:

- [x] Wind sway on the trees (shared gusty wind: `windX` / `gustAt` in the shader)
- [x] Snow melting off the trees by day, building back overnight (`treeSnow`, per-clump ranking)
