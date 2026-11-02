import { assessValue } from "./value";
import { z } from "zod";
import {
  itemSchema,
  type Item,
  type Lens,
  type Source,
  type SourceStatus,
  type Discovery,
  type ValueAssessment,
} from "../shared/schema";
import {
  canonicalUrl,
  mergeItems,
  rankItems,
  youtubeId,
} from "../shared/ranking";
import { fetchJson, plain } from "./http";
export interface Env {
  BRAVE_API_KEY?: string;
  YOUTUBE_API_KEY?: string;
  AI_API_KEY?: string;
  AI_BASE_URL?: string;
  AI_MODEL?: string;
  APP_ORIGIN?: string;
  HOST?: string;
  PORT?: string;
  NODE_ENV?: string;
}
type Result = { items: Item[]; warnings: string[] };
const socialHosts = [
  "x.com",
  "twitter.com",
  "bsky.app",
  "mastodon.social",
  "reddit.com",
];
function kindFor(url: string): Item["kind"] {
  const host = new URL(url).hostname;
  return youtubeId(url) || /(^|\.)(vimeo.com|dailymotion.com)$/.test(host)
    ? "video"
    : socialHosts.some((d) => host === d || host.endsWith(`.${d}`))
      ? "social"
      : "article";
}
const hitSchema = z.object({
  objectID: z.string(),
  title: z.string().nullish(),
  url: z.string().nullish(),
  points: z.number().nullish(),
  created_at: z.string().nullish(),
  author: z.string().nullish(),
  story_id: z.number().nullish(),
  story_title: z.string().nullish(),
  comment_text: z.string().nullish(),
});
const date = (v?: string | null) =>
  v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined;
function accept(raw: unknown): Item[] {
  const p = itemSchema.safeParse(raw);
  return p.success ? [p.data] : [];
}
async function collect(jobs: Promise<Item[]>[]): Promise<Result> {
  const results = await Promise.allSettled(jobs);
  const good = results.filter(
    (r): r is PromiseFulfilledResult<Item[]> => r.status === "fulfilled",
  );
  if (!good.length) throw new Error("Source unavailable");
  return {
    items: good.flatMap((r) => r.value),
    warnings:
      good.length < results.length
        ? ["Some searches failed; results are incomplete."]
        : [],
  };
}
export async function searchHN(
  lens: Lens,
  fetcher: typeof fetch = fetch,
): Promise<Result> {
  return collect(
    lens.queries.flatMap((query) =>
      ["story", "comment"].map(async (tag) => {
        const params = new URLSearchParams({
          query,
          tags: tag,
          hitsPerPage: "60",
        });
        const raw = await fetchJson(
          `https://hn.algolia.com/api/v1/search?${params}`,
          fetcher,
        );
        const { hits } = z
          .object({ hits: z.array(z.unknown()).max(100) })
          .parse(raw);
        const items: Item[] = [];
        for (const rawHit of hits) {
          const parsed = hitSchema.safeParse(rawHit);
          if (!parsed.success) continue;
          const h = parsed.data;
          const when = date(h.created_at);
          const year = when ? new Date(when).getUTCFullYear() : undefined;
          const evidence = {
            url: `https://news.ycombinator.com/item?id=${encodeURIComponent(h.objectID)}`,
            label:
              tag === "story"
                ? "HN submission"
                : "HN comment mentioning this link",
            threadId: tag === "story" ? h.objectID : h.story_id?.toString(),
            year,
            points: Math.max(0, h.points || 0),
          };
          if (tag === "story" && h.url) {
            const url = canonicalUrl(h.url);
            if (!url) continue;
            items.push(
              ...accept({
                url,
                title: plain(h.title || url).slice(0, 500),
                description: `Shared on Hacker News${h.author ? ` by ${h.author}` : ""}. Open the discussion to evaluate the recommendation.`,
                kind: kindFor(url),
                provider: "hn",
                publishedAt: when,
                youtubeId: youtubeId(url),
                evidence: [evidence],
              }),
            );
          } else if (h.comment_text && h.story_id) {
            for (const match of h.comment_text.matchAll(
              /<a\b[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis,
            )) {
              const url = canonicalUrl(plain(match[1]));
              if (!url || new URL(url).hostname === "news.ycombinator.com")
                continue;
              const anchor = plain(match[2]);
              const title =
                anchor.length > 10 && !/^https?:/.test(anchor)
                  ? anchor
                  : `Link discussed in: ${plain(h.story_title || "Hacker News")}`;
              items.push(
                ...accept({
                  url,
                  title: title.slice(0, 500),
                  description: plain(h.comment_text).slice(0, 650),
                  kind: kindFor(url),
                  provider: "hn",
                  youtubeId: youtubeId(url),
                  evidence: [evidence],
                }),
              );
            }
          }
        }
        return items;
      }),
    ),
  );
}
export async function searchBrave(
  lens: Lens,
  env: Env,
  fetcher: typeof fetch = fetch,
): Promise<Result> {
  return collect(
    lens.queries.map(async (query) => {
      const suffix =
        lens.kind === "product"
          ? " buy product"
          : lens.kind === "social"
            ? " (site:x.com OR site:bsky.app OR site:reddit.com)"
            : lens.kind === "video"
              ? " video"
              : "";
      const raw = await fetchJson(
        `https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q: query + suffix, count: "20", safesearch: "moderate" })}`,
        fetcher,
        {
          headers: {
            "X-Subscription-Token": env.BRAVE_API_KEY!,
            Accept: "application/json",
          },
        },
      );
      const response = z
        .object({
          web: z
            .object({
              results: z.array(
                z.object({
                  url: z.string(),
                  title: z.string(),
                  description: z.string().optional(),
                  page_age: z.string().optional(),
                }),
              ),
            })
            .optional(),
        })
        .parse(raw);
      return (response.web?.results || []).flatMap((r) => {
        const url = canonicalUrl(r.url);
        if (!url) return [];
        return accept({
          url,
          title: plain(r.title).slice(0, 500),
          description: plain(r.description || "").slice(0, 3000),
          kind: lens.kind === "product" ? "product" : kindFor(url),
          provider: "brave",
          publishedAt: date(r.page_age),
          youtubeId: youtubeId(url),
          evidence: [],
        });
      });
    }),
  );
}
export async function searchYouTube(
  lens: Lens,
  env: Env,
  fetcher: typeof fetch = fetch,
): Promise<Result> {
  return collect(
    lens.queries.map(async (query) => {
      const raw = await fetchJson(
        `https://www.googleapis.com/youtube/v3/search?${new URLSearchParams({ part: "snippet", q: query, type: "video", maxResults: "25", key: env.YOUTUBE_API_KEY!, videoEmbeddable: "true" })}`,
        fetcher,
      );
      const response = z
        .object({
          items: z.array(
            z.object({
              id: z.object({ videoId: z.string() }),
              snippet: z.object({
                title: z.string(),
                description: z.string(),
                channelTitle: z.string(),
                publishedAt: z.string(),
              }),
            }),
          ),
        })
        .parse(raw);
      return response.items.flatMap((r) =>
        accept({
          url: `https://www.youtube.com/watch?v=${r.id.videoId}`,
          title: plain(r.snippet.title).slice(0, 500),
          description: plain(r.snippet.description).slice(0, 3000),
          kind: "video",
          provider: "youtube",
          author: r.snippet.channelTitle,
          publishedAt: date(r.snippet.publishedAt),
          youtubeId: r.id.videoId,
          evidence: [],
        }),
      );
    }),
  );
}
export function sourceConfig(env: Env): SourceStatus[] {
  return [
    {
      id: "hn",
      state: "ready",
      count: 0,
      message: "Live story and comment search. No key needed.",
    },
    {
      id: "brave",
      state: env.BRAVE_API_KEY ? "ready" : "unconfigured",
      count: 0,
      message: env.BRAVE_API_KEY
        ? "Web, shopping discovery and indexed public social links."
        : "Set BRAVE_API_KEY on the server to search beyond Hacker News.",
    },
    {
      id: "youtube",
      state: env.YOUTUBE_API_KEY ? "ready" : "unconfigured",
      count: 0,
      message: env.YOUTUBE_API_KEY
        ? "Direct YouTube video search."
        : "HN-linked videos work now. Set YOUTUBE_API_KEY for direct search.",
    },
  ];
}
export async function discover(
  lens: Lens,
  env: Env = {},
  fetcher: typeof fetch = fetch,
  hidden: string[] = [],
  signal?: AbortSignal,
): Promise<Discovery> {
  signal?.throwIfAborted();
  const upstream = fetcher;
  if (signal)
    fetcher = (input, init) => {
      signal.throwIfAborted();
      return upstream(input, {
        ...init,
        signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
      });
    };
  const sources = sourceConfig(env).filter((s) => lens.sources.includes(s.id));
  const adapters: Record<Source, () => Promise<Result>> = {
    hn: () => searchHN(lens, fetcher),
    brave: () => searchBrave(lens, env, fetcher),
    youtube: () => searchYouTube(lens, env, fetcher),
  };
  const results = await Promise.all(
    sources.map(async (status) => {
      if (status.state === "unconfigured") return [];
      if (status.id === "youtube" && !["all", "video"].includes(lens.kind)) {
        status.state = "skipped";
        status.message = "YouTube only participates in All and Watch lenses.";
        return [];
      }
      try {
        const result = await adapters[status.id]();
        status.state = "ok";
        status.count = mergeItems(result.items).length;
        status.message = result.warnings.join(" ") || "Search completed.";
        return result.items;
      } catch {
        status.state = "error";
        status.message =
          "Source could not be reached or returned an invalid response. Try again later.";
        return [];
      }
    }),
  );
  signal?.throwIfAborted();
  const items = mergeItems(results.flat());
  let assessments: Record<string, ValueAssessment> = {};
  let valueStatus: NonNullable<Discovery["valueStatus"]> = {
    state: "off",
    count: 0,
    message:
      "Deterministic relevance and evidence ranking. Novelty is not assessed. No click or watch-time tracking.",
  };
  if (lens.assessValue) {
    if (!env.AI_BASE_URL || !env.AI_MODEL)
      valueStatus = {
        state: "unconfigured",
        count: 0,
        message:
          "Connect a model to estimate usefulness and novelty. These results use deterministic rules.",
      };
    else {
      const candidates = rankItems(
        items,
        {
          ...lens,
          evidenceWeight: Math.min(15, lens.evidenceWeight),
          recencyWeight: Math.min(5, lens.recencyWeight),
          limit: 36,
        },
        hidden,
      );
      try {
        if (candidates.length)
          assessments = await assessValue(candidates, lens, env, fetcher);
        valueStatus = {
          state: "ok",
          count: Object.keys(assessments).length,
          message: `AI assessed ${Object.keys(assessments).length} of ${candidates.length} shortlisted candidates from titles/snippets only. Estimates of usefulness and novelty—not verified content evaluations.`,
        };
      } catch {
        valueStatus = {
          state: "error",
          count: 0,
          message:
            "AI value assessment failed. Your hard rules still apply; showing deterministic results without novelty claims.",
        };
      }
    }
  }
  signal?.throwIfAborted();
  return {
    items: rankItems(items, lens, hidden, Date.now(), assessments),
    valueStatus,
    sources,
    fetchedAt: new Date().toISOString(),
    candidateCount: items.length,
    coverage:
      "A bounded search of selected sources, not a complete internet or historical HN index. HN evidence counts independent discussions in this retrieval; mentions are not verified endorsements. Dates refer to source records.",
  };
}
