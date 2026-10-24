# Sceenmaker Video

Bewerkbare video: één bron, veel versies. Een 3D-camerapad uit **sceenmaker-scenes** krijgt lagen in code (nu: 3D-letters op de gevel) die exact met de camera meebewegen en achter het gebouw en de bomen verdwijnen. Een andere taal of naam is één regel in het document.

Versie **0.1.0**. Zie [ARCHITECTURE.md](ARCHITECTURE.md).

## Draaien (Mac)
Naast elkaar in `~/Projects`: `sceenmaker-scenes` en `sceenmaker-video`. Het camerapad moet in sceenmaker-scenes gerenderd zijn met diepte (het `orbit`-pad van het testhuis is dat al).

```bash
cd ~/Projects/sceenmaker-video && npm install && npx playwright install chromium && npm test && npm run render -- testhuis-gevel
```

Uit: `out/testhuis-gevel/v1/nl/video.mp4`, `fr/video.mp4` en `naast-elkaar-nl-fr.mp4`.
Andere map voor sceenmaker-scenes: `SCENES_DIR=/pad/naar/sceenmaker-scenes npm run render -- …`.

## Een nieuwe versie maken
Kopieer `videos/<slug>/v<n>.json` naar `v<n+1>.json`, zet `version` en `parentVersion`, pas tekst of anker aan en render. Een variant toevoegen: `{ "id": "de", "label": "Duits", "patch": { "naam.text": "VAN DAMME BAU" } }`.

## Versies
- 0.1.0 (24-10-2026): eerste pijplijn. 3D-bron uit sceenmaker-scenes, 3D-letters met dieptemasker en zonschaduw, varianten, mp4 + naast elkaar.
