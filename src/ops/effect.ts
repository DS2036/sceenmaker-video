/**
 * effect: een filmclip → dezelfde clip met een effect-preset, puur in code (geen AI-video, geen credits).
 * Frames uit de clip (ffmpeg) → engine/effects.py (personenmasker + samenstellen) → mp4 + origineel naast nabouw.
 * Cache: dezelfde vingerafdruk (clip, effect, venster, breedte, engineversie) wordt niet opnieuw gerenderd.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ENGINE = "effects-v1"; // verhogen als engine/effects.py anders gaat tekenen

export const EFFECTS = {
  papercut: "Papieren uitsnede met witte rand; om de 5 frames blijft een kopie staan (echo-spoor).",
  pixelated: "Achtergrond wordt pixel-art, de persoon blijft echt.",
  clones: "Dezelfde persoon 4 keer, zijwaarts verschoven en telkens wat later in de tijd.",
  incline: "De ruimte kantelt heen en terug, de persoon blijft rechtop.",
} as const;
export type Effect = keyof typeof EFFECTS;

export type EffectOpts = { start?: number; seconds?: number; width?: number; force?: boolean };

export function parseEffect(name: string): Effect {
  if (!(name in EFFECTS)) throw new Error(`onbekend effect ${name}; kies uit ${Object.keys(EFFECTS).join(", ")}`);
  return name as Effect;
}

/** Python met rembg + numpy + Pillow; standaard `python3`, anders SCEENMAKER_PY. */
const python = () => process.env.SCEENMAKER_PY || "python3";

export async function effect(name: string, input: string, opts: EffectOpts = {}) {
  const fx = parseEffect(name);
  if (!existsSync(input)) throw new Error(`clip niet gevonden: ${input}`);
  const start = opts.start ?? 0, seconds = opts.seconds ?? 3, width = opts.width ?? 540;
  const fp = createHash("sha256")
    .update(readFileSync(input))
    .update(JSON.stringify({ ENGINE, fx, start, seconds, width }))
    .digest("hex")
    .slice(0, 16);
  const outDir = join("out", "effects", fx, `${basename(input).replace(/\.[^.]+$/, "")}-${fp}`);
  const resultFile = join(outDir, "result.json");
  if (!opts.force && existsSync(resultFile)) {
    const prev = JSON.parse(readFileSync(resultFile, "utf8"));
    if (existsSync(prev.mp4)) return { ...prev, cached: true };
  }

  const t0 = Date.now();
  const srcDir = join(outDir, "src"), framesDir = join(outDir, "frames");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(srcDir, { recursive: true });
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(start), "-t", String(seconds), "-i", input,
    "-vf", `fps=30,scale=${width}:-2`, join(srcDir, "f%04d.png")]);
  execFileSync(python(), ["-I", join(ROOT, "engine/effects.py"), fx, srcDir, framesDir], { stdio: ["ignore", "ignore", "inherit"] });

  const mp4 = join(outDir, "video.mp4");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "30", "-i", join(framesDir, "f%04d.png"),
    "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
  // Altijd origineel naast nabouw, zoals bij de varianten van render.
  const compare = join(outDir, "naast-elkaar.mp4");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "30", "-i", join(srcDir, "f%04d.png"), "-i", mp4,
    "-filter_complex", "[0:v][1:v]hstack", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", compare]);

  const r = { effect: fx, uitleg: EFFECTS[fx], mp4, compare, cached: false, seconds: Math.round((Date.now() - t0) / 100) / 10, kost: "code, geen credits" };
  writeFileSync(resultFile, JSON.stringify({ ...r, fingerprint: fp, input, start, duration: seconds, width, createdAt: new Date().toISOString() }, null, 2));
  return r;
}
