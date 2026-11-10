#!/bin/bash
# Compile the shader and build the KDE Store / kpackagetool archive into dist/.
# Needs qt6-qtshadertools (qsb). Targets desktop GL 3.2/3.3, OpenGL ES 3.0 (the integer hash rules out ES 2.0), Vulkan (SPIR-V),
# D3D and Metal, written in the Qt 6.5 .qsb format (--qsbversion 65) so every Plasma 6 system can load it, not only newer Qt.
set -euo pipefail
cd "$(dirname "$0")"
QSB=$(command -v qsb || echo /usr/lib64/qt6/bin/qsb)
for f in contents/shaders/*.frag; do "$QSB" --glsl "300 es,150,330" --hlsl 50 --msl 12 --qsbversion 65 -o "$f.qsb" "$f"; done
VER=$(python3 -c 'import json; print(json.load(open("metadata.json"))["KPlugin"]["Version"])')
mkdir -p dist
tar --transform 's,^\./,plexus/,' -czf "dist/plexus-$VER.tar.gz" ./metadata.json ./contents
echo "built dist/plexus-$VER.tar.gz"
