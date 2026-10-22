#!/usr/bin/env bash
# Download the CC0 assets used by the realistic renderer (engine2): MakeHuman base mesh, Poly Haven HDRIs,
# ambientCG PBR textures. All CC0. Run from video/.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p assets/mh assets/hdri assets/textures
MH=https://raw.githubusercontent.com/makehumancommunity/makehuman/master
curl -fsSL -o assets/mh/base.obj "$MH/makehuman/data/3dobjs/base.obj"
curl -fsSL -o assets/mh/default.mhskel "$MH/makehuman/data/rigs/default.mhskel"
curl -fsSL -o assets/mh/LICENSE.md "$MH/LICENSE.md"
for h in studio_small_09 lebombo comfy_cafe; do
  curl -fsSL -o "assets/hdri/${h}_2k.hdr" "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/${h}_2k.hdr"
done
tmp=$(mktemp -d)
for m in Wood022 Wood026 Wood027 Fabric082A Fabric030 Marble021; do
  curl -fsSL -o "$tmp/$m.zip" "https://ambientcg.com/get?file=${m}_2K-JPG.zip"
  unzip -q -o "$tmp/$m.zip" -d "$tmp/$m"
  for k in Color NormalGL Roughness; do cp "$tmp/$m/${m}_2K-JPG_$k.jpg" "assets/textures/${m}_$k.jpg"; done
done
rm -rf "$tmp"
echo "assets ready"
