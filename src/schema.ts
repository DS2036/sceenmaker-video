/**
 * Contract van een video-document (VideoDoc). Eenheden meter, Z omhoog (zoals sceenmaker-scenes).
 * Bestand: videos/<slug>/v<n>.json, nooit overschreven.
 */
import { z } from "zod";

const Vec3 = z.tuple([z.number(), z.number(), z.number()]);

/** v0.1: alleen een 3D-bron (camerapad uit sceenmaker-scenes). Film + camera-solve komt in v0.3. */
export const Source = z.object({
  kind: z.literal("scene"),
  scene: z.string(), // slug in sceenmaker-scenes, bv. "testhuis"
  path: z.string(), // id van het camerapad, bv. "orbit"
  dir: z.string().optional(), // expliciete cachemap; anders gezocht in $SCENES_DIR/cache/paths/<path>/
  fps: z.number().positive().default(24),
});

/** Tekstlaag als 3D-letters, vast in de ruimte (op een gevel). */
export const TextLayer = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  type: z.literal("text"),
  text: z.string().min(1),
  anchor: z.object({
    position: Vec3, // midden van de tekst, op het vlak
    normal: Vec3, // naar buiten wijzend; tekst ligt in het vlak loodrecht hierop, Z blijft omhoog
  }),
  height: z.number().positive(), // hoogte hoofdletter in meter
  depth: z.number().nonnegative().default(0.06), // extrusie in meter, naar buiten
  font: z.enum(["helvetiker_bold", "helvetiker_regular", "optimer_bold", "gentilis_bold"]).default("helvetiker_bold"),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#2b2f33"),
  metalness: z.number().min(0).max(1).default(0.3),
  roughness: z.number().min(0).max(1).default(0.45),
  occlusion: z.enum(["depth", "none"]).default("depth"),
});
export type TextLayer = z.infer<typeof TextLayer>;

/** Een versie = patch op lagen: { "<laag-id>.<veld>": waarde }. */
export const Variant = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string(),
  patch: z.record(z.string(), z.unknown()).default({}),
});

export const VideoDoc = z
  .object({
    schemaVersion: z.literal(1),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    version: z.number().int().positive(),
    parentVersion: z.number().int().positive().optional(),
    title: z.string(),
    source: Source,
    layers: z.array(TextLayer).min(1),
    // Diepte-tolerantie in meter: het 8-bit dieptebeeld is grof (± 0,1 m op 15 m, ± 0,3 m op 25 m).
    occlusionBias: z.number().nonnegative().default(0.6),
    variants: z.array(Variant).min(1),
    compare: z.boolean().default(true), // altijd twee versies naast elkaar
    provenance: z.object({ createdAt: z.string(), by: z.string() }),
  })
  .superRefine((d, ctx) => {
    const ids = new Set<string>();
    for (const l of d.layers) {
      if (ids.has(l.id)) ctx.addIssue({ code: "custom", message: `dubbele laag-id ${l.id}` });
      ids.add(l.id);
    }
    for (const v of d.variants)
      for (const k of Object.keys(v.patch))
        if (!ids.has(k.split(".")[0])) ctx.addIssue({ code: "custom", message: `variant ${v.id}: onbekende laag in ${k}` });
  });
export type VideoDoc = z.infer<typeof VideoDoc>;

/** Lagen van één variant: patch toepassen, opnieuw valideren. */
export function layersFor(doc: VideoDoc, variantId: string): TextLayer[] {
  const v = doc.variants.find((x) => x.id === variantId);
  if (!v) throw new Error(`onbekende variant ${variantId}`);
  return doc.layers.map((l) => {
    const out: Record<string, unknown> = structuredClone(l);
    for (const [k, val] of Object.entries(v.patch)) {
      const [id, ...field] = k.split(".");
      if (id === l.id) out[field.join(".")] = val;
    }
    return TextLayer.parse(out);
  });
}
