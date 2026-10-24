# ARCHITECTURE — Sceenmaker Video
<!-- v0.1.0 · 24 okt 2026 -->

## 1. Wat dit is
Bewerkbare video: een bron plus lagen in code die exact met de camera meebewegen. Eén video-document is de bron van waarheid; een versie (taal, naam, prijs) is een patch op dat document.
Sceenmaker Video is de regisseur naast 2D, 3D en Live, geen samenvoeging: het leest wat sceenmaker-scenes rendert en kopieert ideeën en code uit sceenmaker-posters en scenemaker-web (§7). Exact en offline, zoals 2D en 3D; niet live.
v0.1.0 kan één ding: een camerapad dat sceenmaker-scenes al gerenderd heeft (beauty + depth) als bron nemen, en daarop 3D-letters zetten die achter muren en bomen verdwijnen. Geen camera-solve nodig, want de camera komt exact uit Blender.

## 2. Datamodel (contract: `src/schema.ts`)
- **VideoDoc** — `{schemaVersion, slug, version, parentVersion?, title, source, layers[], occlusionBias, variants[], compare, provenance}`. Bestand `videos/<slug>/v<n>.json`, nooit overschreven.
- **Source** (v0.1 alleen `scene`) — `{kind: "scene", scene, path, dir?, fps}`. Zonder `dir` wordt de nieuwste map met beauty én depth gezocht in `$SCENES_DIR/cache/paths/<path>/` (standaard `../sceenmaker-scenes`).
- **Bronmap** (gemaakt door sceenmaker-scenes `blender/render_path.py`) — `job.json` (camera per frame: position, target, focalLength; sensor 36 mm horizontaal; zonrichting), `meta.json` (`nearFar`), `beauty/f0001.png…`, `depth/f0001.png…`. Diepte = disparity: grijswaarde v → afstand `1 / (1/far + v·(1/near − 1/far))`, zwart = lucht. Afstand is langs de kijkstraal, niet z-diepte.
- **TextLayer** — `{id, type: "text", text, anchor{position, normal}, height, depth, font, color, metalness, roughness, occlusion: depth|none}`. Meter, Z omhoog. Letters liggen in het vlak loodrecht op `normal`, leesbaar voor wie naar de gevel kijkt; `height` = hoofdletterhoogte.
- **Variant** — `{id, label, patch{"<laag-id>.<veld>": waarde}}`. Patch wordt toegepast en de laag opnieuw gevalideerd.
- **occlusionBias** — tolerantie in meter (standaard 0,6). Het 8-bit dieptebeeld is grof: ± 0,1 m op 15 m, ± 0,3 m op 25 m.
- **Uitvoer** — `out/<slug>/v<n>/<variant>/{frames/, video.mp4, result.json}` en `out/<slug>/v<n>/naast-elkaar-<a>-<b>.mp4`. `result.json` bevat de vingerafdruk.

## 3. State machine
Per variant: `niet gerenderd → gerenderd (vingerafdruk)`. Vingerafdruk = hash(lagen van de variant, bias, bronmap, framebereik, fps, rendererversie). Zelfde vingerafdruk → overgeslagen (`cached: true`); `--force` rendert toch.
Per document: een wijziging maakt `v<n+1>` (met de hand in v0.1; edit-op volgt), vorige versies blijven.
Ongeldig (schema weigert): dubbele laag-id, patch op een onbekende laag, patchwaarde die de laag ongeldig maakt, bronmap zonder `nearFar` of met een ander aantal beauty/depth-frames dan camera's.

## 4. Pijplijn
| stap | in → uit | faalt → |
|---|---|---|
| source | VideoDoc → bronmap, camera per frame, nearFar, zonrichting (`src/source.ts`) | ok:false, duidelijke melding "render eerst in sceenmaker-scenes" |
| layers | per frame in headless Chromium (`src/page/render.js`, three.js): beauty als achtergrond, letters met dezelfde camera (fov uit brandpunt + 36 mm sensor), zonlicht uit dezelfde richting als Blender, schaduwvanger op de gevel. Pixel van een letter of schaduw verdwijnt als Blender daar iets dichterbij zag (afstand + bias) | ok:false |
| encode | PNG-frames → ffmpeg libx264 crf 16 → `video.mp4` | ok:false |
| compare | eerste twee varianten op halve breedte naast elkaar → mp4 | ok:false |

Ingang: `npm run render -- <slug> [--version n] [--variant id] [--frames a-b] [--force]`, envelop `{ok, op, …}` via `runOp` (`src/cli.ts`), zoals in 2D.
Snelheid: ± 0,6 s per frame 1920×1080 op Linux zonder GPU; op de Mac sneller (GPU).

## 5. Out of scope (v0.1)
Filmclips als bron en camera-solve (v0.3), muziek-sync (v0.2), beeld- en logo-lagen, keyframes, lagen die schaduw van het gebouw ontvangen, AI-afwerking, MCP-server, live-afspelen, UI-editor.

## 6. Roadmap
- v0.2 muziek-sync: BPM, tellen en secties (port van scenemaker-web `public/js/analyse.js`), letters verschijnen op de tel, wisselen per refrein; audio in de mp4.
- v0.3 film als bron: camera-solve (COLMAP/GLOMAP lokaal), schaal via één gemeten maat, diepte (Depth Anything) en personenmasker (SAM 2); supermarkt-test opnieuw.
- v0.4 lagen uit het 2D-schema (beeld, logo, prijs, keyframes), MCP-server `video_<op>`, edit-op met Claude.
- Later: look-match (korrel, scherpte, kleur), optionele AI-afwerking (Decart, zwakke sterkte).

## 7. Hergebruik (overgenomen, niet gedeeld)
- sceenmaker-scenes v0.5.5: bronmap-formaat en camera-afspraken (`blender/render_path.py`, `build.py depth_builder`, `place_camera`). Video leest, schrijft daar nooit.
- sceenmaker-posters v1.0.1: OpResult-envelop en `runOp`, versies `v<n>.json` nooit overschreven, vingerafdruk-cache, Playwright → ffmpeg.
- scenemaker-web v1.62.1: three.js als 3D-motor; v0.2 neemt `analyse.js` over.
Pas als dezelfde code in drie repo's stabiel is, wordt het een gedeeld pakket.

## 8. OPEN QUESTIONS
1. Sporthal-model: formaat (IFC/SketchUp/GLB) bepaalt of de pilot via sceenmaker-scenes kan.
2. 16-bit diepte in render_path.py zou de bias van 0,6 m naar ± 5 cm brengen (strakkere occlusie); vraagt een kleine wijziging in sceenmaker-scenes.
3. Randen van de occlusie zijn hard (geen anti-aliasing op de diepte-grens); zichtbaar bij close-ups.
