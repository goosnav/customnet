import { it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../server/app";
import {
  discover,
  searchHN,
  searchBrave,
  searchYouTube,
} from "../server/providers";
import { lensSchema } from "../shared/schema";
const lens = lensSchema.parse({
  id: "test",
  name: "Graphics",
  queries: ["graphics"],
  sources: ["hn", "brave"],
});
const fetcher: typeof fetch = async (input) => {
  const url = String(input);
  if (url.includes("tags=comment"))
    return Response.json({
      hits: [
        {
          objectID: "2",
          story_id: 10,
          story_title: "Graphics talk",
          comment_text:
            'Try <a href="https://youtu.be/abcdefghijk?t=2">this graphics lecture</a>',
          created_at: "2020-01-01T00:00:00Z",
        },
        {
          objectID: "3",
          story_id: 10,
          story_title: "Graphics talk",
          comment_text: '<a href="javascript:alert(1)">bad</a>',
          created_at: "2020-01-01T00:00:00Z",
        },
      ],
    });
  return Response.json({
    hits: [
      {
        objectID: "1",
        title: "Graphics lecture",
        url: "https://youtube.com/watch?v=abcdefghijk",
        points: 100,
        created_at: "2020-01-01T00:00:00Z",
      },
    ],
  });
};
it("extracts HN linked evidence and roots comment evidence at the story", async () => {
  const result = await searchHN(lens, fetcher);
  expect(result.items).toHaveLength(2);
  expect(result.items[1].evidence[0].threadId).toBe("10");
  expect(result.items[1].youtubeId).toBe("abcdefghijk");
});
it("keeps successful sources when another is unconfigured or fails", async () => {
  const result = await discover(lens, {}, fetcher);
  expect(result.items).toHaveLength(1);
  expect(result.items[0].mentions).toBe(2);
  expect(result.sources.find((s) => s.id === "brave")?.state).toBe(
    "unconfigured",
  );
  const fail: typeof fetch = async (input) => {
    if (String(input).includes("brave"))
      throw new Error("secret internal path");
    return fetcher(input);
  };
  const partial = await discover(lens, { BRAVE_API_KEY: "test" }, fail);
  expect(partial.items).toHaveLength(1);
  expect(partial.sources.find((s) => s.id === "brave")?.message).not.toContain(
    "secret",
  );
});
it("normalizes optional search providers and rejects unsafe results", async () => {
  const b = await searchBrave(
    { ...lens, kind: "product" },
    { BRAVE_API_KEY: "test" },
    async () =>
      Response.json({
        web: {
          results: [
            {
              url: "https://shop.example.com/item",
              title: "Graphics tablet",
              description: "A tablet",
            },
            { url: "javascript:alert(1)", title: "bad" },
          ],
        },
      }),
  );
  expect(b.items).toHaveLength(1);
  expect(b.items[0].kind).toBe("product");
  const y = await searchYouTube(lens, { YOUTUBE_API_KEY: "test" }, async () =>
    Response.json({
      items: [
        {
          id: { videoId: "abcdefghijk" },
          snippet: {
            title: "Graphics",
            description: "Lecture",
            publishedAt: "2020-01-01T00:00:00Z",
            channelTitle: "Teacher",
          },
        },
      ],
    }),
  );
  expect(y.items[0].youtubeId).toBe("abcdefghijk");
});
it("validates requests, rejects cross-origin posts, and never exposes keys", async () => {
  const app = createApp({ env: { BRAVE_API_KEY: "do-not-leak" }, fetcher });
  expect((await request(app).get("/api/config")).text).not.toContain(
    "do-not-leak",
  );
  expect(
    (
      await request(app)
        .post("/api/discover")
        .send({ lens: { queries: [] } })
    ).status,
  ).toBe(400);
  expect(
    (
      await request(app)
        .post("/api/discover")
        .set("Origin", "https://evil.example")
        .send({ lens })
    ).status,
  ).toBe(403);
  const result = await request(app)
    .post("/api/discover")
    .send({ lens: { ...lens, sources: ["hn"] }, hidden: [] });
  expect(result.status).toBe(200);
  expect(result.body.items).toHaveLength(1);
});
it("returns explicit all-source failure instead of invented fallback data", async () => {
  const result = await discover(lens, {}, async () => {
    throw new Error("offline");
  });
  expect(result.items).toEqual([]);
  expect(result.sources[0].state).toBe("error");
});
it("decodes HN numeric HTML entities before grouping links", async () => {
  const result = await searchHN(
    { ...lens, queries: ["graphics"] },
    async (input) =>
      Response.json({
        hits: String(input).includes("tags=comment")
          ? [
              {
                objectID: "100",
                story_id: 50,
                story_title: "Graphics",
                comment_text:
                  '<a href="https:&#x2F;&#x2F;www.example.com&#x2F;graphics?a=1&amp;b=2">A graphics tutorial</a>',
              },
            ]
          : [],
      }),
  );
  expect(result.items[0].url).toBe("https://example.com/graphics?a=1&b=2");
  expect(result.items[0].description).not.toContain("&#");
});
it("rejects DNS rebinding hosts and permits an explicitly configured deployment origin", async () => {
  expect(
    (
      await request(createApp({ env: {}, fetcher }))
        .get("/api/config")
        .set("Host", "attacker.example")
    ).status,
  ).toBe(403);
  expect(
    (
      await request(
        createApp({
          env: { APP_ORIGIN: "https://customnet.example" },
          fetcher,
        }),
      )
        .get("/api/config")
        .set("Host", "customnet.example")
        .set("Origin", "https://customnet.example")
    ).status,
  ).toBe(200);
});

it("preserves partial results within one provider and reports missing coverage", async () => {
  const result = await searchHN(lens, async (input) => {
    if (String(input).includes("tags=comment")) throw Error("timeout");
    return fetcher(input);
  });
  expect(result.items).toHaveLength(1);
  expect(result.warnings.join(" ")).toContain("incomplete");
});
it("supports local interpretation, validated AI output and explicit AI failure", async () => {
  const app = createApp({
    env: { AI_BASE_URL: "https://model.example/v1", AI_MODEL: "test" },
    fetcher: async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.messages[1].content).toBe("Find physics, avoid gossip");
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                queries: ["physics"],
                exclude: ["gossip"],
              }),
            },
          },
        ],
      });
    },
  });
  const local = await request(app)
    .post("/api/interpret")
    .send({ brief: "Find physics, avoid gossip" });
  expect(local.body.mode).toBe("local");
  const ai = await request(app)
    .post("/api/interpret")
    .send({ brief: "Find physics, avoid gossip", useAI: true });
  expect(ai.status).toBe(200);
  expect(ai.body.exclude).toEqual(["gossip"]);
  const malformed = createApp({
    env: { AI_BASE_URL: "https://model.example/v1", AI_MODEL: "test" },
    fetcher: async () =>
      Response.json({
        choices: [{ message: { content: '{"queries":[],"exclude":[]}' } }],
      }),
  });
  expect(
    (
      await request(malformed)
        .post("/api/interpret")
        .send({ brief: "Find physics", useAI: true })
    ).status,
  ).toBe(502);
  expect(
    (
      await request(createApp({ env: {} }))
        .post("/api/interpret")
        .send({ brief: "Find physics", useAI: true })
    ).status,
  ).toBe(409);
});
it("bounds upstream response size and refuses redirects", async () => {
  const { fetchJson } = await import("../server/http");
  await expect(
    fetchJson("https://example.com", async (_url, init) => {
      expect(init?.redirect).toBe("error");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response("x".repeat(3_000_001));
    }),
  ).rejects.toThrow("Response too large");
  await expect(
    fetchJson(
      "https://example.com",
      async () => new Response("", { status: 429 }),
    ),
  ).rejects.toThrow("429");
});
it("combines independently valid lens/global blocks without an artificial 100-host union limit", async () => {
  const app = createApp({ env: {}, fetcher });
  const response = await request(app)
    .post("/api/discover")
    .send({
      lens: {
        ...lens,
        sources: ["hn"],
        blockedDomains: Array.from({ length: 80 }, (_, i) => `a${i}.com`),
      },
      blockedDomains: Array.from({ length: 80 }, (_, i) => `b${i}.com`),
    });
  expect(response.status).toBe(200);
});

it("keeps real results on value-assessment failure and excludes already-known URLs", async () => {
  const sourceLens = { ...lens, sources: ["hn" as const], assessValue: true };
  const response = await discover(
    sourceLens,
    { AI_BASE_URL: "https://model.example/v1", AI_MODEL: "test" },
    async (input, init) => {
      if (String(input).includes("model.example"))
        return Response.json({ choices: [] });
      return fetcher(input, init);
    },
  );
  expect(response.items).toHaveLength(1);
  expect(response.valueStatus?.state).toBe("error");
  expect(response.items[0].assessment).toBeUndefined();
  const known = await request(createApp({ env: {}, fetcher }))
    .post("/api/discover")
    .send({
      lens: { ...sourceLens, assessValue: false },
      known: ["https://www.youtube.com/watch?v=abcdefghijk"],
    });
  expect(known.status).toBe(200);
  expect(known.body.items).toEqual([]);
});

it("propagates client disconnect to provider requests", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let started: () => void = () => {};
  const beginning = new Promise<void>((r) => {
    started = r;
  });
  let cancelled: () => void = () => {};
  const cancellation = new Promise<void>((r) => {
    cancelled = r;
  });
  const app = createApp({
    env: {},
    fetcher: async (input, init) => {
      init?.signal?.addEventListener("abort", cancelled, { once: true });
      started();
      await gate;
      return fetcher(input, init);
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const port = (server.address() as { port: number }).port;
  const ctrl = new AbortController();
  try {
    const response = fetch(`http://127.0.0.1:${port}/api/discover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lens: { ...lens, sources: ["hn"] } }),
      signal: ctrl.signal,
    }).catch(() => undefined);
    await beginning;
    ctrl.abort();
    await response;
    const propagated = await Promise.race([
      cancellation.then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 500)),
    ]);
    expect(propagated).toBe(true);
  } finally {
    release();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
