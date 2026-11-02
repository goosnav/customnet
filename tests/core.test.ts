import { describe, it, expect } from "vitest";
import { canonicalUrl, mergeItems, rankItems } from "../shared/ranking";
import { lensSchema, itemSchema } from "../shared/schema";
import { interpretLocally } from "../shared/intent";
const lens = () =>
  lensSchema.parse({
    id: "test",
    name: "My lens",
    brief: "Find computer graphics",
    queries: ["computer graphics"],
  });
const item = (url: string, extras = {}) =>
  itemSchema.parse({
    url,
    title: "Computer graphics lecture",
    kind: "article",
    provider: "hn",
    evidence: [],
    ...extras,
  });
describe("canonicalization and evidence", () => {
  it("collapses youtube forms and tracking without conflating distinct pages", () => {
    expect(canonicalUrl("https://youtu.be/abcdefghijk?t=30")).toBe(
      "https://www.youtube.com/watch?v=abcdefghijk",
    );
    expect(canonicalUrl("https://example.com/a?utm_source=x&part=2#top")).toBe(
      "https://example.com/a?part=2",
    );
    expect(canonicalUrl("javascript:alert(1)")).toBeNull();
    expect(canonicalUrl("https://user:password@example.com")).toBeNull();
  });
  it("merges duplicates and counts independent threads rather than comments", () => {
    const a = item("https://example.com", {
      evidence: [
        {
          url: "https://news.ycombinator.com/item?id=1",
          label: "Mention",
          threadId: "10",
          year: 2020,
        },
      ],
    });
    const b = item("https://example.com/?utm_source=x", {
      evidence: [
        {
          url: "https://news.ycombinator.com/item?id=2",
          label: "Mention",
          threadId: "10",
          year: 2021,
        },
        {
          url: "https://news.ycombinator.com/item?id=3",
          label: "Mention",
          threadId: "20",
          year: 2022,
        },
      ],
    });
    const merged = mergeItems([a, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].evidence).toHaveLength(3);
    expect(rankItems(merged, { ...lens(), minMentions: 3 })).toHaveLength(0);
    expect(rankItems(merged, { ...lens(), minMentions: 2 })).toHaveLength(1);
  });
});
describe("ranking contract", () => {
  it("enforces phrase exclusions, domain boundaries and hidden URLs", () => {
    const items = [
      item("https://bad.com/1"),
      item("https://sub.bad.com/2"),
      item("https://notbad.com/3"),
      item("https://other.com/4", { title: "Graphics crypto scam" }),
      item("https://hidden.com"),
    ];
    expect(
      rankItems(
        items,
        { ...lens(), blockedDomains: ["bad.com"], exclude: ["crypto scam"] },
        ["https://hidden.com/"],
      ).map((x) => x.url),
    ).toEqual(["https://notbad.com/3"]);
  });
  it("prefers evidenced results when requested and exposes actual components", () => {
    const ranked = rankItems(
      [
        item("https://plain.com"),
        item("https://proven.com", {
          evidence: [
            {
              url: "https://news.ycombinator.com/item?id=1",
              label: "Discussion",
              threadId: "1",
              points: 100,
              year: 2020,
            },
          ],
        }),
      ],
      { ...lens(), evidenceWeight: 100, recencyWeight: 0 },
    );
    expect(ranked[0].url).toBe("https://proven.com/");
    expect(ranked[0].reasons.join(" ")).toContain("1 independent");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });
  it("filters kind and bounds results without mutating inputs", () => {
    const items = [
      item("https://a.com", { kind: "video" }),
      item("https://b.com"),
    ];
    expect(rankItems(items, { ...lens(), kind: "video" })).toHaveLength(1);
    expect(items).toHaveLength(2);
  });
  it("rejects malformed configuration and unsafe imported links", () => {
    expect(lensSchema.safeParse({ ...lens(), limit: 5000 }).success).toBe(
      false,
    );
    expect(
      itemSchema.safeParse({
        ...item("https://a.com"),
        url: "data:text/html,evil",
      }).success,
    ).toBe(false);
    expect(lensSchema.safeParse({ ...lens(), queries: [] }).success).toBe(
      false,
    );
  });
  it("keeps local interpretation conservative and captures explicit exclusions", () => {
    const result = interpretLocally(
      "Find computer graphics, animation; avoid crypto, politics",
    );
    expect(result.exclude).toEqual(["crypto", "politics"]);
    expect(result.queries.join(" ")).toContain("graphics");
    expect(result.mode).toBe("local");
  });
});
it("rejects malformed hosts from entity-encoded URLs", () => {
  expect(canonicalUrl("https:&#x2F;&#x2F;example.com")).toBeNull();
  expect(
    itemSchema.safeParse({ ...item("https://a.com"), url: "https://&/" })
      .success,
  ).toBe(false);
});

it("diversifies equally relevant results without defeating hard filters", () => {
  const l = lensSchema.parse({
    id: "d",
    name: "Diverse",
    queries: ["graphics"],
  });
  const candidates = [
    "https://a.com/1",
    "https://a.com/2",
    "https://b.com/1",
  ].map((url) =>
    itemSchema.parse({
      url,
      title: "Graphics",
      kind: "article",
      provider: "hn",
    }),
  );
  expect(rankItems(candidates, l).map((i) => new URL(i.url).hostname)).toEqual([
    "a.com",
    "b.com",
    "a.com",
  ]);
  expect(
    rankItems(candidates, { ...l, diversity: false }).map(
      (i) => new URL(i.url).hostname,
    ),
  ).toEqual(["a.com", "a.com", "b.com"]);
});

it("matches blocked domains across www and DNS trailing-dot variants", () => {
  const l = lensSchema.parse({
    id: "block",
    name: "Blocked",
    queries: ["graphics"],
    blockedDomains: ["example.com"],
  });
  const variants = ["https://example.com./x", "https://www.example.com/x"].map(
    (url) =>
      itemSchema.parse({
        url,
        title: "Graphics",
        kind: "article",
        provider: "import",
      }),
  );
  expect(rankItems(variants, l)).toEqual([]);
});
