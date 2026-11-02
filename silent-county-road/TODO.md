# Silent County Road — to do

- [ ] **Wind sway on the trees.** Upper branches move gently with the wind setting (`windStrength`). Idea: in `treeSprite`, offset the texel lookup x by `sin(time * f + seed) * amp * (iy / bh)^2`, scaled by wind and tree height. That way the tops sway and the trunk base stays put. Keep the offset in whole art pixels so the pixel art doesn't shimmer.
- [ ] **Snow melting off the trees.** The snow on the branches thins over sunny afternoons and builds back up overnight, like the wire snow (`meltStart`/`meltDur` in `main.qml`). Idea: bake a per-texel snow "rank" in `gen_trees.py` (top and outer pillows hold on longest). The shader then shows snow where `rank < treeSnow`, with `treeSnow` driven from QML by the sun and the snowfall timeline.
