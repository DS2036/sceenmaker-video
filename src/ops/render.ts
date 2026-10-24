/**
 * render: VideoDoc → per variant een mp4 (+ naast elkaar).
 * Per frame: Blender-beauty als achtergrond, code-lagen met dezelfde camera, occlusie via Blender-diepte.
 * Cache: een variant met dezelfde vingerafdruk wordt niet opnieuw gerenderd.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { layersFor, type VideoDoc } from "../schema.js";
import { framePath, loadSource, type SceneSource } from "../source.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RENDERER = "three-depth-v1"; // verhogen als de renderpagina anders gaat tekenen
const TYPES: Record<string, string> = { ".js": "text/javascript", ".json": "application/json", ".html": "text/html", ".png": "image/png" };

export type RenderOpts = { variant?: string; frames?: [number, number]; force?: boolean };
export type VariantResult = { id: string; label: string; mp4: string; frames: number; cached: boolean; seconds: number };

const fingerprint = (doc: VideoDoc, src: SceneSource, variant: string, range: [number, number]) =>
  createHash("sha256")
    .update(JSON.stringify({ RENDERER, layers: layersFor(doc, variant), bias: doc.occlusionBias, dir: src.dir, n: src.frames.length, range, fps: src.fps }))
    .digest("hex")
    .slice(0, 16);

async function renderVariant(doc: VideoDoc, src: SceneSource, variant: string, range: [number, number], outDir: string) {
  const framesDir = join(outDir, "frames");
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });

  // Op de Mac rendert Chromium via de GPU; op Linux zonder GPU via SwiftShader (traag maar exact).
  const gpuArgs = process.platform === "linux" ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [];
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: gpuArgs });
  try {
    const page = await browser.newPage({ viewport: { width: src.width, height: src.height } });
    page.on("pageerror", (e: Error) => console.error("pagina:", e.message));
    await page.route("http://sceenmaker.local/**", (route) => {
      const p = new URL(route.request().url()).pathname;
      const file = p.startsWith("/three/") ? join(ROOT, "node_modules/three", p.slice(7))
        : p.startsWith("/page/") ? join(ROOT, "src/page", p.slice(6))
        : p.startsWith("/src/") ? join(src.dir, p.slice(5))
        : p === "/" ? join(ROOT, "src/page/index.html") : "";
      if (!file || !existsSync(file)) return route.fulfill({ status: 404 });
      route.fulfill({ body: readFileSync(file), contentType: TYPES[extname(file)] ?? "application/octet-stream" });
    });
    await page.goto("http://sceenmaker.local/");
    await page.waitForFunction(() => (window as any).ready === true);
    await page.evaluate((c) => (window as any).setup(c), {
      width: src.width, height: src.height, sensorWidth: src.sensorWidth, nearFar: src.nearFar,
      sunDirection: src.sunDirection, occlusionBias: doc.occlusionBias, layers: layersFor(doc, variant),
    });
    for (let i = range[0]; i <= range[1]; i++) {
      const url = (v: "beauty" | "depth") => "http://sceenmaker.local/src/" + framePath(src, v, i).slice(src.dir.length + 1);
      const data: string = await page.evaluate(([f, b, d]) => (window as any).renderFrame(f, b, d), [src.frames[i], url("beauty"), url("depth")] as const);
      writeFileSync(join(framesDir, `f${String(i - range[0] + 1).padStart(4, "0")}.png`), Buffer.from(data.split(",")[1], "base64"));
    }
  } finally {
    await browser.close();
  }
  const mp4 = join(outDir, "video.mp4");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(src.fps), "-i", join(framesDir, "f%04d.png"),
    "-c:v", "libx264", "-crf", "16", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
  return mp4;
}

export async function render(doc: VideoDoc, opts: RenderOpts = {}) {
  const src = loadSource(doc);
  const last = src.frames.length - 1;
  const range: [number, number] = opts.frames ? [Math.max(0, opts.frames[0] - 1), Math.min(last, opts.frames[1] - 1)] : [0, last];
  const base = join("out", doc.slug, `v${doc.version}`);
  const variants = opts.variant ? doc.variants.filter((v) => v.id === opts.variant) : doc.variants;
  if (!variants.length) throw new Error(`onbekende variant ${opts.variant}`);

  const results: VariantResult[] = [];
  for (const v of variants) {
    const outDir = join(base, v.id);
    const fp = fingerprint(doc, src, v.id, range);
    const resultFile = join(outDir, "result.json");
    const prev = existsSync(resultFile) ? JSON.parse(readFileSync(resultFile, "utf8")) : null;
    if (!opts.force && prev?.fingerprint === fp && existsSync(prev.mp4)) {
      results.push({ id: v.id, label: v.label, mp4: prev.mp4, frames: prev.frames, cached: true, seconds: 0 });
      continue;
    }
    mkdirSync(outDir, { recursive: true });
    const t0 = Date.now();
    const mp4 = await renderVariant(doc, src, v.id, range, outDir);
    const r = { id: v.id, label: v.label, mp4, frames: range[1] - range[0] + 1, cached: false, seconds: Math.round((Date.now() - t0) / 100) / 10 };
    writeFileSync(resultFile, JSON.stringify({ ...r, fingerprint: fp, source: src.dir, createdAt: new Date().toISOString() }, null, 2));
    results.push(r);
  }

  // Altijd twee versies naast elkaar: de eerste twee varianten, elk op halve breedte.
  let compare: string | undefined;
  if (doc.compare && results.length >= 2) {
    compare = join(base, `naast-elkaar-${results[0].id}-${results[1].id}.mp4`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", results[0].mp4, "-i", results[1].mp4, "-filter_complex",
      "[0:v]scale=iw/2:-2[a];[1:v]scale=iw/2:-2[b];[a][b]hstack", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", compare]);
  }
  return { source: src.dir, variants: results, compare };
}
