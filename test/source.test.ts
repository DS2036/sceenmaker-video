import assert from "node:assert/strict";
import { test } from "node:test";
import { findSourceDir } from "../src/source.js";
import { loadDoc } from "../src/store.js";

test("ontbrekende 3D-render geeft een duidelijke fout", () => {
  process.env.SCENES_DIR = "/bestaat/niet";
  const doc = loadDoc("testhuis-gevel", 1);
  assert.throws(() => findSourceDir(doc), /render eerst in sceenmaker-scenes/);
});
