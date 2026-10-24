/**
 * npm run render -- <slug> [--version n] [--variant id] [--frames 1-48] [--force]
 */
import { args, runOp } from "../src/cli.js";
import { render } from "../src/ops/render.js";
import { loadDoc } from "../src/store.js";

const { pos, flags } = args();
await runOp("render", async () => {
  if (!pos[0]) throw new Error("gebruik: npm run render -- <slug> [--version n] [--variant id] [--frames a-b] [--force]");
  const doc = loadDoc(pos[0], flags.version ? Number(flags.version) : undefined);
  const frames = typeof flags.frames === "string" ? (flags.frames.split("-").map(Number) as [number, number]) : undefined;
  return { slug: doc.slug, version: doc.version, ...(await render(doc, { variant: flags.variant as string | undefined, frames, force: !!flags.force })) };
});
