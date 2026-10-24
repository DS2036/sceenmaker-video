/**
 * npm run effect -- <papercut|pixelated|clones|incline> <clip.mp4> [--start s] [--seconds s] [--width px] [--force]
 * npm run effect -- --list
 */
import { args, runOp } from "../src/cli.js";
import { EFFECTS, effect } from "../src/ops/effect.js";

const { pos, flags } = args();
await runOp("effect", async () => {
  if (flags.list) return { effects: EFFECTS };
  if (pos.length < 2) throw new Error("gebruik: npm run effect -- <effect> <clip.mp4> [--start s] [--seconds s] [--width px] [--force]");
  const num = (k: string) => (typeof flags[k] === "string" ? Number(flags[k]) : undefined);
  return await effect(pos[0], pos[1], { start: num("start"), seconds: num("seconds"), width: num("width"), force: !!flags.force });
});
