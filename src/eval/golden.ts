import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/**
 * The golden set: an exam with an answer key. Each file is one item exactly as the judge sees it,
 * plus the level each team should get. Live items are promoted from the database; authored items
 * cover cases the live feed rarely produces (cosmetic edits, injected instructions, a price change).
 */
export const Level = z.enum(["alert", "digest", "log", "none"]);
export type Level = z.infer<typeof Level>;

export const GoldenItem = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  origin: z.enum(["live", "authored"]),
  competitor: z.string(),
  kind: z.enum(["post", "page_change"]),
  pageType: z.enum(["general", "pricing"]).default("general"),
  url: z.string(),
  title: z.string().nullable(),
  publishedAt: z.string().nullable(),
  text: z.string().min(20),
  diff: z.string().nullable().default(null),
  beforeText: z.string().nullable().default(null),
  /** Level per team key. Null until someone labels the item; unlabelled items are not graded. */
  expected: z.record(z.string(), Level).nullable(),
  /** Who labelled it: "owner" once the product owner has confirmed, "draft" before that. */
  labelledBy: z.enum(["owner", "draft"]).nullable().default(null),
  /** Why these levels, in one or two sentences, so a later reviewer can disagree with a reason. */
  note: z.string().default(""),
  tags: z.array(z.string()).default([]),
});
export type GoldenItem = z.infer<typeof GoldenItem>;

export const GOLDEN_DIR = join(process.cwd(), "evals/golden");

export function loadGolden(dir = GOLDEN_DIR): GoldenItem[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const parsed = GoldenItem.safeParse(JSON.parse(readFileSync(join(dir, f), "utf8")));
      if (!parsed.success) throw new Error(`${f}: ${parsed.error.message}`);
      if (`${parsed.data.id}.json` !== f) throw new Error(`${f}: id must match the file name`);
      return parsed.data;
    });
}
