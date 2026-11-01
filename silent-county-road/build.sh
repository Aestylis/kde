#!/bin/bash
# Compile the shaders and build the KDE Store / kpackagetool archive into dist/.
# Needs qt6-qtshadertools (qsb). Shaders use an integer hash, so target desktop GL / Vulkan (GLSL 150/330), not GLES.
set -euo pipefail
cd "$(dirname "$0")"
QSB=$(command -v qsb || echo /usr/lib64/qt6/bin/qsb)
for f in contents/shaders/*.frag; do "$QSB" --glsl "150,330" --hlsl 50 --msl 12 -o "$f.qsb" "$f"; done
VER=$(python3 -c 'import json; print(json.load(open("metadata.json"))["KPlugin"]["Version"])')
mkdir -p dist
tar --transform 's,^\./,silent-county-road/,' --exclude=./dist --exclude=./.git --exclude=./screenshots \
    --exclude=./build.sh --exclude=./README.md --exclude=./STORE.md --exclude=./.gitignore \
    -czf "dist/silent-county-road-$VER.tar.gz" ./metadata.json ./contents ./LICENSE
echo "built dist/silent-county-road-$VER.tar.gz"
