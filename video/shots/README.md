# Shots — how the film is built

Episode 1 《棋盘之外》 (v2.3) is a realistic 3D documentary film, 1920×1080, ~5.5 minutes, every frame rendered by
three.js (r170) in headless Chromium on the CPU (SwiftShader: no GPU, 4 cores). Narration script:
`data/script.json`; the per-sentence shot list: `../docs/ep01-storyboard-v2.md`.

## Architecture

- `engine2/film.js` plays `data/timeline.json`: a list of shots `{ id, scene, start, end, fadeIn, fadeOut, p, cues }`.
  Each shot is an instance of a scene module `shots/<scene>.js`, built when first needed and disposed after.
  All shots share one WebGLRenderer; each has its own `Studio` (scene, camera, post chain).
- After the 3D frame, the film draws each shot's `overlay()` on a 2D canvas in 1920×1080 units, then the burned-in
  subtitles (bottom centre, y ≈ 900–1030 — keep that band free of important overlay text), chapter tag (top left),
  dips to black and film grain.
- **Every frame is a pure function of time.** No `Math.random()`, no `Date`, no accumulated state between frames
  (frames are rendered out of order by parallel workers). Use `rng(seed)` from `lib/kit.js` for randomness and
  compute everything from `t`. Physics must be analytic or precomputed deterministically in `create()`.

### Scene module API

```js
export async function create({ renderer, scale, p, dur, cues, id }) {
  const st = new Studio({ scale, renderer });      // from ../engine2/core.js
  ...build the scene (await loads)...
  grade(st, {...});                                  // the house post chain (lib/kit.js)
  return {
    studio: st,
    update(t, env) { ...pose everything + the camera for local time t (seconds from the shot's start)... },
    overlay(g, t, env) { ...optional 2D drawing in 1920x1080 units (labels, numbers, typography)... },
    dispose() { ...optional: free anything not in st.scene... },
  };
}
```

- `p`: the shot's parameters (free-form; document them in the module's header comment).
- `dur`: the shot's length in seconds. **Shots must look right for any duration** in a sensible range (their exact
  length comes from the narration). Drive events from `cues` with defaults relative to `dur`, e.g.
  `const tOpen = cues.open ?? dur * 0.4`.
- `cues`: named moments (seconds from the shot's start) anchored to words in the narration by
  `tools/build_timeline.py`. Name them by what happens (`flash`, `door`, `count`).
- Units are metres. y is up.

## Tools

Run from `video/`:

- Stills: `node tools/shot.mjs <scene> 0.5,2,4 0.5 '{"dur":6,"p":{...},"cues":{...}}'` → `out/lab/<scene>_<t>.png`
  (scale 0.5 = 960×540; use 1 for a final-quality check of a single frame).
- A clip: append `--video out/lab/<name>.mp4 --fps 30` (renders every frame; at 0.5 scale ~3 s/frame).
- Contact sheet of stills: PIL (`python3 -c "from PIL import Image ..."`), then look at it with the Read tool.
- After adding Chinese text to a shot: `python3 tools/charset.py` (the page preloads only the glyphs in
  `data/charset.txt`; a missing glyph renders as a box).
- The CPU is shared (narration synthesis, other renders): render only what you need to check, at 0.5 scale, a few
  frames at a time.

## Building blocks

- `engine2/core.js` — `Studio` (`hdri(url, {intensity, rotation, background})`, `pbr(name, {repeat})` for
  `assets/textures/<name>_{Color,NormalGL,Roughness}.jpg`, `post()`, `render()`), `spot(color, intensity, {...})`
  (on the board, where stones are a few mm thick, pass `normalBias: 0.0004` or stone shadows lift off into rings).
- `lib/grasp.js` — closing a hand on an object given as a signed distance function (`sdf.cylinder/sphere/union`):
  `wrap` curls each finger with its joints coupled (good for a palm round a body); `wrapSeq` bends joint by joint
  from the root (fingers hooking round an edge or a cup); `lib/pinch.js` `rimGrip` and `engine2/bothand.js`
  `solvePinch` for a thumb-to-fingertip pinch (works for the human hand too).
- `lib/kit.js` — easing (`ss`, `sstep`, `easeOut`, `key(t, [[t0, v0], [t1, v1], ...])`), `rng`, `V3`, `breathe`
  (handheld drift), `grade(st, o)` (house post: N8AO, DOF, bloom, AgX, vignette), typography (`title`, `caption`,
  `quote`, `callout` for a label pinned to a 3D point, `text`, `measure`, `FONT`), `toScreen(cam, p)`,
  `archive(g, t, o)` (old-film look, call first in `overlay()`), `weave(t)` (gate weave for archive cameras).
- `engine2/materials.js` — `skinMaterial`, `stoneMaterials`, `stoneGeometry`; `engine2/dishes.js` — porcelain rice
  bowl (`buildBowl`, `bowlGeometry`, `porcelainMaterial`), water (`waterMaterial`, droplets, streams);
  `engine2/kitchen.js` — counter, sink, faucet, cabinets (`buildKitchen`, `COUNTER`); `engine2/goban.js` — go board,
  bowls (`buildBoard`, `buildBowl`, `at(i, j)`, `BOARD`); `shots/lib/goset.js` — the game-2 set and positions.
- The robot: `engine2/bot.js` `loadBot(studio)` (white satin body, glossy black head/neck/yoke, see `lab/sf_bot.js`
  for a lit stage), its hand `engine2/bothand.js`. The human hand: `engine2/hand.js` `loadHand`, `setPose`.
- HDRIs in `assets/hdri/` (2k): studio_small_09, lebombo, comfy_cafe, blinds, kiara_interior, glasshouse_interior,
  brown_photostudio_04. Textures in `assets/textures/`: Wood022/026/027, Fabric030/082A, Marble021, Concrete034.
  More CC0 assets may be added from ambientCG (`https://ambientcg.com/get?file=<Name>_2K-JPG.zip`, copy only the
  Color/NormalGL/Roughness JPGs into `assets/textures/`, delete the zip) or Poly Haven (2k .hdr); disk is tight
  (~3 GB free) so keep it to what a shot needs, and add each to `tools/fetch_assets.sh`.

## Look

- **Photoreal, cinematic, restrained.** Physically based materials with real texture detail, soft shadows, contact
  AO, shallow depth of field on close shots, slow deliberate camera moves (push, drift, slide) with a breath of
  handheld; nothing should look like a tech demo or motion-graphics template.
- **Colour:** human = warm (tungsten, amber), machine = cool (blue-white, steel). Dark, low-key frames: one motivated
  key light and a rim; let the background fall to near black.
- **Archive (1961, 1979):** muted colour, grain, flicker, dust, gate weave (`archive()` + `weave()`), but the 3D
  underneath is still fully detailed.
- **Typography in frame:** Noto Serif SC for titles and quotes, Noto Sans SC for labels, JetBrains Mono for numbers
  and machine readouts; small caps English tags over Chinese labels (`caption()`); gold (#e8c27a-ish) or cyan
  (#96d6ff-ish) highlights only. Never put text over the subtitle band.
- **People:** real people appear only as hands or back-lit silhouettes, never faces.
- **Performance budget:** ≤ ~4 s/frame at 0.5 scale on this machine. At most two shadow-casting lights; shadow maps
  1024–2048; avoid thousands of separate meshes (merge or instance them); canvas textures updated per frame only
  when they change.
- **Quality bar:** before calling a shot done, render stills across its whole duration, look at them critically
  (scale, proportions, lighting, intersections, floating objects, z-fighting, text overlap, anything that reads as
  CG), fix, and repeat. Motion should be eased and physically plausible; nothing pops.
