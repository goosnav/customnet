import {
  safeUrl,
  itemSchema,
  type Item,
  type Lens,
  type RankedItem,
  type ValueAssessment,
} from "./schema";
export function youtubeId(url: string): string | undefined {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const id =
      host === "youtu.be"
        ? u.pathname.split("/")[1]
        : ["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(
              host,
            )
          ? u.searchParams.get("v") ||
            u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1]
          : undefined;
    return id && /^[\w-]{11}$/.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}
export function canonicalUrl(value: string): string | null {
  try {
    if (!safeUrl.safeParse(value).success) return null;
    const u = new URL(value);
    const video = youtubeId(value);
    if (video) return `https://www.youtube.com/watch?v=${video}`;
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...u.searchParams.keys()])
      if (
        /^utm_/i.test(key) ||
        ["fbclid", "gclid", "ref_src", "ref_url"].includes(key)
      )
        u.searchParams.delete(key);
    u.searchParams.sort();
    return u.toString();
  } catch {
    return null;
  }
}
export function matchesDomain(host: string, domain: string) {
  host = host
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
  domain = domain
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
  return host === domain || host.endsWith(`.${domain}`);
}
export function mergeItems(items: Item[]): Item[] {
  const grouped = new Map<string, Item>();
  for (const raw of items) {
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) continue;
    const item = parsed.data;
    const url = canonicalUrl(item.url);
    if (!url) continue;
    const previous = grouped.get(url);
    const id = youtubeId(url);
    if (!previous) {
      grouped.set(url, {
        ...item,
        url,
        ...(id ? { youtubeId: id, kind: "video" as const } : {}),
      });
      continue;
    }
    const evidence = [...previous.evidence, ...item.evidence]
      .filter((e, i, a) => a.findIndex((v) => v.url === e.url) === i)
      .slice(0, 200);
    grouped.set(url, {
      ...previous,
      evidence,
      description: previous.description || item.description,
      author: previous.author || item.author,
      publishedAt: [previous.publishedAt, item.publishedAt]
        .filter((d): d is string => !!d)
        .sort()
        .at(-1),
    });
  }
  return [...grouped.values()];
}
export function rankItems(
  items: Item[],
  lens: Lens,
  hidden: string[] = [],
  now = Date.now(),
  assessments: Record<string, ValueAssessment> = {},
): RankedItem[] {
  const hiddenSet = new Set(hidden.map(canonicalUrl));
  const tokens = [
    ...new Set(
      lens.queries
        .join(" ")
        .toLowerCase()
        .match(/[\p{L}\p{N}]+/gu) || [],
    ),
  ];
  const ranked: RankedItem[] = [];
  for (const item of mergeItems(items)) {
    const host = new URL(item.url).hostname;
    const text =
      `${item.title} ${item.description} ${item.author || ""} ${item.url}`.toLowerCase();
    const mentions = new Set(
      item.evidence.map((e) => e.threadId).filter(Boolean),
    ).size;
    if (
      hiddenSet.has(item.url) ||
      lens.blockedDomains.some((d) => matchesDomain(host, d)) ||
      lens.exclude.some((e) => text.includes(e.toLowerCase())) ||
      (lens.kind !== "all" && lens.kind !== item.kind) ||
      mentions < lens.minMentions
    )
      continue;
    const matched = tokens.filter((t) => text.includes(t));
    const relevance = tokens.length ? (matched.length / tokens.length) * 50 : 0;
    const points = Math.max(0, ...item.evidence.map((e) => e.points || 0));
    const evidence =
      Math.min(1, Math.log2(1 + mentions) / 3 + Math.log10(1 + points) / 12) *
      lens.evidenceWeight;
    const age = item.publishedAt
      ? Math.max(0, now - Date.parse(item.publishedAt)) / 86400000
      : Infinity;
    const freshness = Number.isFinite(age)
      ? Math.exp(-age / 365) * lens.recencyWeight
      : 0;
    const preference = lens.preferredDomains.some((d) => matchesDomain(host, d))
      ? 25
      : 0;
    const reasons = [
      matched.length
        ? `Matches ${matched.slice(0, 4).join(", ")}`
        : "Returned by your search terms",
    ];
    if (mentions)
      reasons.push(
        `${mentions} independent HN discussion${mentions === 1 ? "" : "s"} (mentions, not verified endorsements)`,
      );
    const years = [
      ...new Set(
        item.evidence.map((e) => e.year).filter((y): y is number => !!y),
      ),
    ].sort();
    if (years.length > 1)
      reasons.push(`Referenced across ${years[0]}–${years.at(-1)}`);
    if (preference) reasons.push("A source you prefer");
    if (freshness > 5) reasons.push("Recent publication boosts its rank");
    const assessment = assessments[item.url];
    const usefulness = assessment
      ? (assessment.usefulness / 5) * 60 * assessment.confidence
      : 0;
    const novelty = assessment
      ? (assessment.novelty / 5) * 40 * assessment.confidence
      : 0;
    if (assessment)
      reasons.push(
        `AI estimates usefulness ${assessment.usefulness}/5 and novelty to you ${assessment.novelty}/5, based on title/snippet only.`,
      );
    ranked.push({
      ...item,
      score: Math.round(
        relevance + evidence + freshness + preference + usefulness + novelty,
      ),
      assessment,
      reasons,
      components: {
        relevance,
        evidence,
        freshness,
        preference,
        usefulness,
        novelty,
      },
      mentions,
    });
  }
  ranked.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
  if (!lens.diversity) return ranked.slice(0, lens.limit);
  const selected: RankedItem[] = [];
  const hosts = new Map<string, number>();
  while (ranked.length && selected.length < lens.limit) {
    let best = 0;
    let bestScore = -Infinity;
    ranked.forEach((item, index) => {
      const score =
        item.score / (1 + (hosts.get(new URL(item.url).hostname) || 0) * 0.35);
      if (score > bestScore) {
        best = index;
        bestScore = score;
      }
    });
    const [item] = ranked.splice(best, 1);
    const host = new URL(item.url).hostname;
    hosts.set(host, (hosts.get(host) || 0) + 1);
    selected.push(item);
  }
  return selected;
}
