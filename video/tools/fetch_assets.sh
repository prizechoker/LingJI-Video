#!/usr/bin/env bash
# Download the CC0 assets used by the realistic renderer (engine2): MakeHuman base mesh, Poly Haven HDRIs,
# ambientCG PBR textures. All CC0. Run from video/.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p assets/mh assets/hdri assets/textures
MH=https://raw.githubusercontent.com/makehumancommunity/makehuman/master
curl -fsSL -o assets/mh/base.obj "$MH/makehuman/data/3dobjs/base.obj"
curl -fsSL -o assets/mh/default.mhskel "$MH/makehuman/data/rigs/default.mhskel"
curl -fsSL -o assets/mh/default_weights.mhw "$MH/makehuman/data/rigs/default_weights.mhw"
curl -fsSL -o assets/mh/LICENSE.md "$MH/LICENSE.md"
for h in studio_small_09 lebombo comfy_cafe blinds kiara_interior glasshouse_interior brown_photostudio_04; do
  curl -fsSL -o "assets/hdri/${h}_2k.hdr" "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/${h}_2k.hdr"
done
tmp=$(mktemp -d)
for m in Wood022 Wood026 Wood027 Fabric082A Fabric030 Marble021 Concrete034; do
  curl -fsSL -o "$tmp/$m.zip" "https://ambientcg.com/get?file=${m}_2K-JPG.zip"
  unzip -q -o "$tmp/$m.zip" -d "$tmp/$m"
  for k in Color NormalGL Roughness; do cp "$tmp/$m/${m}_2K-JPG_$k.jpg" "assets/textures/${m}_$k.jpg"; done
done
# Blender's Human Base Meshes bundle (CC0): the robot's body (blender/build_bot.py)
mkdir -p assets/hbm
curl -fsSL -o "$tmp/hbm.zip" "https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip"
unzip -q -o -j "$tmp/hbm.zip" "*human_base_meshes_bundle.blend" -d assets/hbm
rm -rf "$tmp"
echo "assets ready"
