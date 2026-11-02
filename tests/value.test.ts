import { it, expect } from "vitest";
import { assessValue } from "../server/value";
import { lensSchema, itemSchema } from "../shared/schema";
import { rankItems } from "../shared/ranking";
const lens = lensSchema.parse({
  id: "gems",
  name: "Gems",
  queries: ["graphics"],
  brief: "Practical graphics methods for an experienced programmer",
  knowledge: "I already know matrices and basic shaders",
  assessValue: true,
});
const items = ["intro", "rare"].map((path) =>
  itemSchema.parse({
    url: `https://example.org/${path}`,
    title:
      path === "intro"
        ? "Graphics introduction"
        : "Graphics: a practical visibility technique",
    kind: "article",
    provider: "hn",
  }),
);
it("uses explicit usefulness and novelty estimates without replacing hard rules", () => {
  const ranked = rankItems(items, lens, [], Date.now(), {
    [items[0].url]: {
      usefulness: 2,
      novelty: 0,
      confidence: 1,
      rationale: "Introductory material overlaps the stated knowledge.",
    },
    [items[1].url]: {
      usefulness: 5,
      novelty: 5,
      confidence: 1,
      rationale: "Specific method relevant to the stated goal.",
    },
  });
  expect(ranked[0].url).toBe(items[1].url);
  expect(ranked[0].components.usefulness).toBeGreaterThan(0);
  expect(
    rankItems(items, { ...lens, exclude: ["practical"] }, [], Date.now(), {
      [items[1].url]: {
        usefulness: 5,
        novelty: 5,
        confidence: 1,
        rationale: "Great",
      },
    }).some((i) => i.url === items[1].url),
  ).toBe(false);
});
it("assesses only supplied IDs and includes user knowledge as data", async () => {
  const response = await assessValue(
    items,
    lens,
    { AI_BASE_URL: "https://model.example/v1", AI_MODEL: "test" },
    async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const input = JSON.parse(body.messages[1].content);
      expect(input.knowledge).toContain("matrices");
      expect(input.candidates).toHaveLength(2);
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                assessments: [
                  {
                    id: 1,
                    usefulness: 5,
                    novelty: 4,
                    confidence: 0.8,
                    rationale: "Specific method relevant to the goal.",
                  },
                ],
              }),
            },
          },
        ],
      });
    },
  );
  expect(response[items[1].url].usefulness).toBe(5);
});
it("rejects out-of-range, duplicate and invented assessment identities", async () => {
  for (const assessments of [
    [
      {
        id: 99,
        usefulness: 5,
        novelty: 4,
        confidence: 1,
        rationale: "Invented",
      },
    ],
    [
      {
        id: 0,
        usefulness: 100,
        novelty: 4,
        confidence: 1,
        rationale: "Invalid",
      },
    ],
    [
      { id: 0, usefulness: 2, novelty: 2, confidence: 1, rationale: "A" },
      { id: 0, usefulness: 2, novelty: 2, confidence: 1, rationale: "B" },
    ],
  ]) {
    await expect(
      assessValue(
        items,
        lens,
        { AI_BASE_URL: "https://model.example/v1", AI_MODEL: "test" },
        async () =>
          Response.json({
            choices: [
              { message: { content: JSON.stringify({ assessments }) } },
            ],
          }),
      ),
    ).rejects.toThrow();
  }
});

it("does not start a model assessment after discovery is cancelled", async () => {
  const { discover } = await import("../server/providers");
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const ctrl = new AbortController();
  let modelCalls = 0;
  const work = discover(
    { ...lens, sources: ["hn"] },
    { AI_BASE_URL: "https://model.example/v1", AI_MODEL: "test" },
    async (input) => {
      if (String(input).includes("model.example")) {
        modelCalls++;
        return Response.json({
          choices: [{ message: { content: '{"assessments":[]}' } }],
        });
      }
      await gate;
      return Response.json({
        hits: String(input).includes("tags=story")
          ? [
              {
                objectID: "1",
                title: "Graphics technique",
                url: "https://example.org/rare",
              },
            ]
          : [],
      });
    },
    [],
    ctrl.signal,
  );
  ctrl.abort();
  release();
  await expect(work).rejects.toThrow();
  expect(modelCalls).toBe(0);
});
