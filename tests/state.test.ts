import { it, expect } from "vitest";
import {
  initialState,
  parseBackup,
  persistState,
  loadState,
} from "../src/state";
it("round trips saved lenses and rejects malicious backups atomically", () => {
  const state = initialState();
  expect(parseBackup(JSON.stringify(state))).toEqual(state);
  expect(() =>
    parseBackup(
      JSON.stringify({
        ...state,
        saved: [
          {
            url: "javascript:alert(1)",
            title: "bad",
            kind: "article",
            provider: "import",
          },
        ],
      }),
    ),
  ).toThrow();
  expect(() =>
    parseBackup(JSON.stringify({ ...state, version: 99 })),
  ).toThrow();
});
it("recovers corrupt storage and surfaces unavailable persistence", () => {
  const bad = {
    getItem: () => "{bad json",
    setItem: () => {
      throw Error("quota");
    },
  };
  expect(loadState(bad).error).toBeTruthy();
  expect(loadState(bad).state.lenses.length).toBeGreaterThan(0);
  expect(persistState(initialState(), bad)).toContain("could not");
});

it("exports exactly the validated representation and rejects over-budget transitions", async () => {
  const { serializeBackup, transitionState } = await import("../src/state");
  const state = initialState();
  state.saved = Array.from({ length: 1510 }, (_, i) => ({
    url: `https://example.com/${i}`,
    title: "Saved article",
    description: "x".repeat(3000),
    kind: "article" as const,
    provider: "import" as const,
    evidence: [],
  }));
  expect(parseBackup(serializeBackup(state))).toEqual(state);
  const huge = {
    ...state,
    saved: [...state.saved, ...state.saved.slice(0, 300)],
  };
  expect(transitionState(state, () => huge).state).toBe(state);
  expect(transitionState(state, () => huge).error).toContain("5 MB");
});
it("allows blocking every accepted URL host without corrupting persistence", () => {
  for (const url of [
    "http://127.0.0.1:8080/page",
    "https://localhost/page",
    "https://[::1]/page",
  ]) {
    const state = {
      ...initialState(),
      blockedDomains: [new URL(url).hostname],
    };
    expect(parseBackup(JSON.stringify(state))).toEqual(state);
  }
});
