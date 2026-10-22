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
for h in studio_small_09 lebombo comfy_cafe blinds kiara_interior glasshouse_interior brown_photostudio_04 potsdamer_platz; do
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
# archive shots (shots/cart.js, shots/unimate.js): an old machine shop (reflections), factory concrete, worn and
# brushed steel (the 1970s lab's floor, walls and ceiling are procedural)
for h in machine_shop_02; do
  curl -fsSL -o "assets/hdri/${h}_2k.hdr" "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/${h}_2k.hdr"
done
for m in Concrete048 Metal055A Metal032; do
  curl -fsSL -o "$tmp/$m.zip" "https://ambientcg.com/get?file=${m}_2K-JPG.zip"
  unzip -q -o "$tmp/$m.zip" -d "$tmp/$m"
  for k in Color NormalGL Roughness; do cp "$tmp/$m/${m}_2K-JPG_$k.jpg" "assets/textures/${m}_$k.jpg"; done
  rm -rf "$tmp/$m" "$tmp/$m.zip"
done
# the grid chapter (shots/factory_grid, warehouse, vacuum, dishwasher, grids): factory/warehouse floor, a living room
curl -fsSL -o "assets/hdri/empty_warehouse_01_2k.hdr" "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/empty_warehouse_01_2k.hdr"
for m in Concrete047A WoodFloor051 Carpet012; do
  curl -fsSL -o "$tmp/$m.zip" "https://ambientcg.com/get?file=${m}_2K-JPG.zip"
  unzip -q -o "$tmp/$m.zip" -d "$tmp/$m"
  for k in Color NormalGL Roughness; do cp "$tmp/$m/${m}_2K-JPG_$k.jpg" "assets/textures/${m}_$k.jpg"; done
  rm -rf "$tmp/$m" "$tmp/$m.zip"
done
# the home and the balance (shots/home.js, design.js, balance.js): antique brass, a knit sweater, plaster walls, a wool rug
for m in Metal048C Fabric068 PaintedPlaster017 Carpet016; do
  curl -fsSL -o "$tmp/$m.zip" "https://ambientcg.com/get?file=${m}_2K-JPG.zip"
  unzip -q -o "$tmp/$m.zip" -d "$tmp/$m"
  for k in Color NormalGL Roughness; do cp "$tmp/$m/${m}_2K-JPG_$k.jpg" "assets/textures/${m}_$k.jpg"; done
  rm -rf "$tmp/$m" "$tmp/$m.zip"
done
rm -rf "$tmp"
echo "assets ready"
