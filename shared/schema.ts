import { z } from "zod";
export const safeUrl = z
  .string()
  .max(4096)
  .refine((value) => {
    try {
      const u = new URL(value);
      return (
        ["http:", "https:"].includes(u.protocol) &&
        !u.username &&
        !u.password &&
        !/[&<>"'\s]/.test(u.hostname) &&
        /^https?:\/\//i.test(value)
      );
    } catch {
      return false;
    }
  }, "Use an http or https URL without credentials.");
export const kindSchema = z.enum(["article", "video", "product", "social"]);
export const sourceSchema = z.enum(["hn", "brave", "youtube"]);
const phrases = z.array(z.string().trim().min(1).max(120)).max(20);
const domains = z
  .array(
    z
      .string()
      .trim()
      .toLowerCase()
      .max(253)
      .refine((value) => {
        try {
          const u = new URL(`https://${value}`);
          return (
            u.hostname === value &&
            !u.port &&
            !u.username &&
            !u.password &&
            u.pathname === "/" &&
            !u.search &&
            !u.hash &&
            !/[&<>"'\s]/.test(value)
          );
        } catch {
          return false;
        }
      }, "Use a hostname without a protocol, path or port."),
  )
  .max(100);
export const lensSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(80),
  brief: z.string().max(2000).default(""),
  knowledge: z.string().max(2000).default(""),
  assessValue: z.boolean().default(false),
  queries: phrases.min(1).max(3),
  exclude: phrases.default([]),
  preferredDomains: domains.default([]),
  blockedDomains: domains.default([]),
  sources: z.array(sourceSchema).min(1).max(3).default(["hn"]),
  kind: z.enum(["all", "article", "video", "product", "social"]).default("all"),
  evidenceWeight: z.number().min(0).max(100).default(25),
  recencyWeight: z.number().min(0).max(100).default(5),
  minMentions: z.number().int().min(0).max(20).default(0),
  diversity: z.boolean().default(true),
  limit: z.number().int().min(1).max(48).default(24),
});
export const evidenceSchema = z.object({
  url: safeUrl,
  label: z.string().max(200),
  threadId: z.string().max(100).optional(),
  year: z.number().int().min(1970).max(2200).optional(),
  points: z.number().nonnegative().max(1000000).optional(),
});
export const itemSchema = z.object({
  url: safeUrl,
  title: z.string().min(1).max(500),
  description: z.string().max(3000).default(""),
  kind: kindSchema,
  provider: z.enum(["hn", "brave", "youtube", "import"]),
  author: z.string().max(200).optional(),
  publishedAt: z.string().datetime({ offset: true }).optional(),
  youtubeId: z
    .string()
    .regex(/^[\w-]{11}$/)
    .optional(),
  evidence: z.array(evidenceSchema).max(200).default([]),
});
export type Lens = z.infer<typeof lensSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Kind = z.infer<typeof kindSchema>;
export type Source = z.infer<typeof sourceSchema>;
export const valueAssessmentSchema = z.object({
  usefulness: z.number().min(0).max(5),
  novelty: z.number().min(0).max(5),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1).max(600),
});
export type ValueAssessment = z.infer<typeof valueAssessmentSchema>;
export type RankedItem = Item & {
  score: number;
  assessment?: ValueAssessment;
  reasons: string[];
  components: {
    relevance: number;
    evidence: number;
    freshness: number;
    preference: number;
    usefulness: number;
    novelty: number;
  };
  mentions: number;
};
export interface SourceStatus {
  id: Source;
  state: "ready" | "unconfigured" | "ok" | "error" | "skipped";
  count: number;
  message: string;
}
export interface Discovery {
  items: RankedItem[];
  sources: SourceStatus[];
  fetchedAt: string;
  candidateCount: number;
  coverage: string;
  valueStatus?: {
    state: "off" | "ok" | "unconfigured" | "error";
    count: number;
    message: string;
  };
}
export const interpretationSchema = z.object({
  queries: phrases.min(1).max(3),
  exclude: phrases.default([]),
});
