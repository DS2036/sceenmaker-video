import assert from "node:assert/strict";
import { test } from "node:test";
import { EFFECTS, effect, parseEffect } from "../src/ops/effect.js";

test("vier effect-presets met uitleg", () => {
  assert.deepEqual(Object.keys(EFFECTS), ["papercut", "pixelated", "clones", "incline"]);
  for (const u of Object.values(EFFECTS)) assert.ok(u.length > 10);
});

test("onbekend effect wordt geweigerd", () => {
  assert.throws(() => parseEffect("earthzoom"), /onbekend effect/);
});

test("ontbrekende clip wordt geweigerd", async () => {
  await assert.rejects(() => effect("papercut", "bestaat-niet.mp4"), /clip niet gevonden/);
});
