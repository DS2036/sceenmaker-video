import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { layersFor, VideoDoc } from "../src/schema.js";
import { loadDoc } from "../src/store.js";

const raw = () => JSON.parse(readFileSync("videos/testhuis-gevel/v1.json", "utf8"));

test("voorbeeld-document is geldig", () => {
  const doc = loadDoc("testhuis-gevel", 1);
  assert.equal(doc.layers.length, 2);
  assert.equal(doc.occlusionBias, 0.6);
});

test("variant patcht alleen de genoemde velden", () => {
  const doc = loadDoc("testhuis-gevel", 1);
  const nl = layersFor(doc, "nl"), fr = layersFor(doc, "fr");
  assert.equal(nl[0].text, "VAN DAMME BOUW");
  assert.equal(fr[0].text, "VAN DAMME CONSTRUCTION");
  assert.deepEqual(fr[0].anchor, nl[0].anchor);
  assert.equal(doc.layers[0].text, "VAN DAMME BOUW", "origineel blijft ongewijzigd");
});

test("patch op onbekende laag wordt geweigerd", () => {
  const d = raw();
  d.variants[1].patch = { "bestaatniet.text": "x" };
  assert.equal(VideoDoc.safeParse(d).success, false);
});

test("dubbele laag-id wordt geweigerd", () => {
  const d = raw();
  d.layers[1].id = d.layers[0].id;
  assert.equal(VideoDoc.safeParse(d).success, false);
});

test("ongeldige patchwaarde wordt geweigerd bij het toepassen", () => {
  const d = raw();
  d.variants[1].patch = { "naam.height": -1 };
  const doc = VideoDoc.parse(d);
  assert.throws(() => layersFor(doc, "fr"));
});
