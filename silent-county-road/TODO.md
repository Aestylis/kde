# Silent County Road — to do

Realism pass (from the 2026-11-01 research: palette ramps, dithering, sky models, snow rendering), one at a time:

- [x] **Cast shadows at low sun.** Trees, poles, lamps and houses throw long blue shadows across the snow, stretching away from the real sun. Long at dawn and dusk, short at noon, gone under thick overcast.
- [x] **Belt of Venus and Earth's shadow.** At twilight, a pink band sits above a dark blue band in the sky opposite the sun. Very striking over snow.
- [x] **Snow glitter.** Sparse points twinkling on the sunlit snowfield and under the lamps, driven by time and the sun's movement (the camera is fixed). Based on the jittered sparkle grid from real-time sparkle papers.
- [x] **Blue-noise dithering for sky, fog and clouds.** Interleaved gradient noise in place of Bayer for the environment (no crosshatch, film-grain look); Bayer stays for objects, as in Obra Dinn.
- [x] **Snowfall motion.** Near flakes stretch into short streaks in strong gusts, plus a little curl-noise turbulence so flakes eddy instead of sliding in lockstep.
- [x] **Snow that settles by slope and shelter.** Snow caps on fence posts, both lamp heads, along the lamp arms and on the near crossarms; lee drifts (downwind, to the right) beside the buildings, with a bright crest and blue-shaded flank.
- [x] **Shading ramps for each material.** Every material gets its own hue-shifted ramp (cool shadows, warm highlights, about 20° of hue over 3–5 steps) and light picks a step on it, replacing the snap to the nearest of 23 palette colours. LutLight2D-style.

Later:

- [ ] **Optimization run.** Measured 2026-11-02: GPU ~14% busy (whole desktop), plasmashell 0–4% of one core, ~500 MB. Ideas: profile which shader sections cost most (render with sections disabled and compare); early-outs for the cast-shadow caster loops and grove placement (bounding checks per pixel row); fewer `gustAt` calls (once per tree, not per texel); cache the static layers (mountains, far treeline, houses) in a texture that only re-renders when the light changes; lower the QML timer work (traffic / wildlife / wind-knock run every frame). Goal: keep the store claim "1–3% of a single core" true at every reading.

Done:

- [x] Wind sway on the trees (shared gusty wind: `windX` / `gustAt` in the shader)
- [x] Snow melting off the trees by day, building back overnight (`treeSnow`, per-clump ranking)
