/**
 * 3D-bron: een camerapad dat sceenmaker-scenes al gerenderd heeft (render_path.py).
 * Map: <dir>/{job.json, meta.json, beauty/f0001.png…, depth/f0001.png…}
 * Camera per frame komt exact uit job.json; diepte = disparity (1/afstand) tussen meta.nearFar.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { VideoDoc } from "./schema.js";

export type Frame = { position: [number, number, number]; target: [number, number, number]; focalLength: number };
export type SceneSource = {
  dir: string;
  frames: Frame[];
  width: number;
  height: number;
  fps: number;
  nearFar: [number, number];
  sunDirection: [number, number, number];
  sensorWidth: number;
};

export const scenesDir = () => resolve(process.env.SCENES_DIR ?? "../sceenmaker-scenes");

/** Zoekt de nieuwste cachemap van dit pad die beauty én depth heeft. */
export function findSourceDir(doc: VideoDoc): string {
  if (doc.source.dir) return resolve(doc.source.dir);
  const base = join(scenesDir(), "cache", "paths", doc.source.path);
  if (!existsSync(base)) throw new Error(`geen render van pad "${doc.source.path}" in ${base}; render eerst in sceenmaker-scenes met extraPasses depth`);
  const dirs = readdirSync(base)
    .map((d) => join(base, d))
    .filter((d) => existsSync(join(d, "depth")) && existsSync(join(d, "beauty")) && existsSync(join(d, "meta.json")))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!dirs.length) throw new Error(`pad "${doc.source.path}" heeft geen render met diepte in ${base}`);
  return dirs[0];
}

export function loadSource(doc: VideoDoc): SceneSource {
  const dir = findSourceDir(doc);
  const job = JSON.parse(readFileSync(join(dir, "job.json"), "utf8"));
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  if (!meta.nearFar) throw new Error(`${dir}: geen nearFar in meta.json (depth-pass ontbreekt)`);
  const frames: Frame[] = job.frames.map((f: Frame) => ({ position: f.position, target: f.target, focalLength: f.focalLength }));
  for (const v of ["beauty", "depth"]) {
    const n = readdirSync(join(dir, v)).filter((f) => f.endsWith(".png")).length;
    if (n !== frames.length) throw new Error(`${dir}/${v}: ${n} frames, verwacht ${frames.length}`);
  }
  return {
    dir,
    frames,
    width: job.resolution.w,
    height: job.resolution.h,
    fps: doc.source.fps,
    nearFar: meta.nearFar,
    sunDirection: job.sunDirection,
    sensorWidth: 36, // render_path.py plaatst de camera altijd met 36 mm sensor, horizontaal
  };
}

export const framePath = (src: SceneSource, view: "beauty" | "depth", i: number) =>
  join(src.dir, view, `f${String(i + 1).padStart(4, "0")}.png`);
