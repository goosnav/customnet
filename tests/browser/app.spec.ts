import { test, expect } from "@playwright/test";
const fixture = {
  valueStatus: {
    state: "off",
    count: 0,
    message: "Deterministic ranking; novelty is not assessed.",
  },
  items: [
    {
      url: "https://example.org/graphics",
      title: "A better way to understand computer graphics",
      description:
        "A thoughtful exploration of the geometry behind the images we make.",
      kind: "article",
      provider: "hn",
      publishedAt: "2025-04-02T00:00:00Z",
      evidence: [
        {
          url: "https://news.ycombinator.com/item?id=123",
          label: "HN submission",
          threadId: "123",
          points: 120,
          year: 2025,
        },
      ],
      score: 78,
      mentions: 1,
      reasons: [
        "Matches computer, graphics",
        "1 independent HN discussion (mentions, not verified endorsements)",
      ],
      components: { relevance: 50, evidence: 28, freshness: 0, preference: 0 },
    },
  ],
  sources: [{ id: "hn", state: "ok", count: 1, message: "Search completed." }],
  fetchedAt: "2026-11-02T12:00:00Z",
  candidateCount: 1,
  coverage: "Bounded search of selected sources.",
};
test.beforeEach(async ({ page }) => {
  await page.route("**/api/discover", (route) =>
    route.fulfill({ json: fixture }),
  );
});
test("runs a lens, inspects evidence, saves across reload and filters", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Run this lens", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: fixture.items[0].title }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run this lens", exact: true }),
  ).toBeEnabled();
  await page.getByText("Why this find", { exact: true }).click();
  await expect(
    page.getByRole("link", { name: "HN submission · 2025" }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: `Save ${fixture.items[0].title}`,
      exact: true,
    })
    .click();
  await page.reload();
  await page.getByRole("button", { name: /Saved finds/ }).click();
  await expect(
    page.getByRole("heading", { name: fixture.items[0].title }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Filter these finds" })
    .fill("does not match");
  await expect(
    page.getByRole("heading", { name: fixture.items[0].title }),
  ).toHaveCount(0);
});
test("creates an editable lens, adds a video and loads playback only on click", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a lens", exact: true })
    .click();
  await page.getByLabel("Give it a name").fill("Animation studio");
  await page
    .getByLabel("What are you looking for?")
    .fill("animation, filmmaking; avoid gossip");
  await page.getByRole("button", { name: "Create lens", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Animation studio/ }),
  ).toBeVisible();
  await expect(page.getByLabel("Leave out", { exact: false })).toHaveValue(
    "gossip",
  );
  await page.getByRole("button", { name: "Add a link" }).click();
  await page
    .getByLabel("URL", { exact: true })
    .fill("https://youtu.be/abcdefghijk");
  await page.getByLabel("Title", { exact: true }).fill("Animation lecture");
  await page.getByRole("button", { name: "Save link" }).click();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Watch Animation lecture", exact: true })
    .click();
  await expect(page.locator("iframe")).toHaveAttribute(
    "src",
    "https://www.youtube-nocookie.com/embed/abcdefghijk",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator("iframe")).toHaveCount(0);
});
test("switching lenses discards stale searches", async ({ page }) => {
  await page.unroute("**/api/discover");
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/discover", async (route) => {
    await gate;
    await route.fulfill({ json: fixture }).catch(() => {});
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Run this lens", exact: true })
    .click();
  await expect(page.getByText("Following your curiosity.")).toBeVisible();
  await page.getByRole("button", { name: /Worth watching/ }).click();
  release();
  await expect(
    page.getByRole("heading", { name: fixture.items[0].title }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Run this lens", exact: true }),
  ).toBeEnabled();
});
test("mobile controls and import/export work without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle algorithm controls" }).click();
  await expect(
    page.getByRole("heading", { name: "Your algorithm" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Connections & data" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  expect((await download).suggestedFilename()).toMatch(/customnet-.*\.json/);
  await page.getByLabel("Import Customnet backup").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":999}'),
  });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("alert")).toContainText("Nothing was changed");
});

test("discovery and results meet automated WCAG AA checks", async ({
  page,
}) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  await page.goto("/");
  await page
    .getByRole("button", { name: "Run this lens", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: fixture.items[0].title }),
  ).toBeVisible();
  const report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    report.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
});

test("pending AI interpretation cannot overwrite a newer manual rule", async ({
  page,
}) => {
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: { sources: [], ai: { enabled: true, model: "test" } },
    }),
  );
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/interpret", async (route) => {
    await gate;
    await route
      .fulfill({
        json: {
          queries: ["graphics"],
          exclude: [],
          mode: "ai",
          notice: "AI suggested terms.",
        },
      })
      .catch(() => {});
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Interpret with AI" }).click();
  await page.getByLabel("Leave out", { exact: false }).fill("newly forbidden");
  release();
  await expect(
    page.getByRole("button", { name: "Interpret with AI" }),
  ).toBeEnabled();
  await expect(page.getByLabel("Leave out", { exact: false })).toHaveValue(
    "newly forbidden",
  );
});

test("restores a valid backup and keeps dismissals and blocks across reloads", async ({
  page,
}) => {
  const { initialState } = await import("../../src/state");
  const state = initialState();
  state.lenses[0].name = "Restored curiosity";
  await page.goto("/");
  await page.getByLabel("Import Customnet backup").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(state)),
  });
  await expect(
    page.getByRole("button", { name: /Restored curiosity/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Run this lens", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: `Dismiss ${fixture.items[0].title}`,
      exact: true,
    })
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: "Run this lens", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: fixture.items[0].title }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Connections & data" }).click();
  await page.getByRole("button", { name: "Restore 1 dismissed finds" }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("heading", { name: fixture.items[0].title }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Block example.org", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: "Run this lens", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: fixture.items[0].title }),
  ).toHaveCount(0);
});

test("explicit useful and already-known feedback serves the user instead of engagement", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Run this lens", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: `Useful: ${fixture.items[0].title}`,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: /Saved finds/ }).click();
  await expect(
    page.getByRole("heading", { name: fixture.items[0].title }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Discover ↗" }).click();
  await page
    .getByRole("button", {
      name: `Already know: ${fixture.items[0].title}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: fixture.items[0].title }),
  ).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("button", { name: "Run this lens", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: fixture.items[0].title }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Saved finds/ }).click();
  await expect(
    page.getByRole("heading", { name: fixture.items[0].title }),
  ).toBeVisible();
});
