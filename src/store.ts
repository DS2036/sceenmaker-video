/** Video-documenten: videos/<slug>/v<n>.json, nooit overschreven. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { VideoDoc } from "./schema.js";

export const videosDir = (slug: string) => join("videos", slug);

export function latestVersion(slug: string): number {
  const dir = videosDir(slug);
  if (!existsSync(dir)) throw new Error(`onbekende video ${slug}`);
  const vs = readdirSync(dir).map((f) => /^v(\d+)\.json$/.exec(f)?.[1]).filter(Boolean).map(Number);
  if (!vs.length) throw new Error(`${dir}: geen versies`);
  return Math.max(...vs);
}

export function loadDoc(slug: string, version = latestVersion(slug)): VideoDoc {
  const doc = VideoDoc.parse(JSON.parse(readFileSync(join(videosDir(slug), `v${version}.json`), "utf8")));
  if (doc.slug !== slug || doc.version !== version) throw new Error(`v${version}.json: slug/versie klopt niet met bestandsnaam`);
  return doc;
}
