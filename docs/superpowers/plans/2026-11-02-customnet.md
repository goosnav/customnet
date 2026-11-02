# Customnet Implementation Plan

**Goal:** Ship an operational personal discovery app and push it to the requested repository.
**Architecture:** Shared validated schemas and deterministic ranking; bounded server retrieval adapters; browser-owned personal state.
**Tech Stack:** React, TypeScript, Vite, Express, Zod, Vitest, Playwright.
**Spec:** docs/superpowers/specs/2026-11-02-customnet-design.md

## Constraints

No extension, no fabricated results, no credentials in browser state, no arbitrary URL fetching, explicit partial source coverage, finite results, optional AI.

## Review focus

Malformed/imported URLs; distinct comments in one thread mistaken for independent evidence; provider errors wiping partial results; stale requests overwriting new lenses; localStorage corruption or quota failure.

## Tasks

1. Shared core: `shared/schema.ts`, `shared/ranking.ts`, `shared/intent.ts`. Write failing tests in `tests/core.test.ts` for URL normalization, hard filters, evidence merging, diversity and bounded input. Implement and run unit tests.
2. Retrieval API: `server/providers.ts`, `server/app.ts`, `server/index.ts`. Implement `discover(lens)` returning ranked items plus provider status and coverage. Test provider normalization, partial outages, unsafe links, request validation and origin checks before implementation. Fixed upstream destinations, timeout/body/rate limits, server-only secrets. Verify with mocked contract tests and a real HN query.
3. Personal application: `src/App.tsx`, `src/components/*`, `src/state.ts`, `src/styles.css`. Lens editor, discovery views, evidence disclosure, click-to-load player, saved/dismissed/block state, connections and import/export. Unit-test persistence validation and add browser tests for run/save/reload/filter/lens flows. Render desktop and mobile and inspect both.
4. Delivery: README, environment example, Dockerfile, CI. Run unit/API/browser tests, production build and dependency audit. Fresh reviewer inspects implementation; address substantive findings. Commit and push main as explicitly requested, verify remote SHA.

## Progress

- Repository cloned; both source tweets read through public FxTwitter responses after X blocked direct retrieval.
- Implementation authorized by user's action request. Product choices stated in chat; user subsequently clarified that usefulness and novelty, rather than retention, are the objective.

## Delivery record

- Shared core, retrieval API, personal UI, backup support and delivery configuration implemented.
- Builder review identified no blocking ambiguity. Kept independent HN-thread counts, hard-rule precedence and coverage limits explicit.
- Independent code review found three substantive issues: non-DNS host blocks invalidating state, oversized export/import mismatch, and delayed AI overwriting manual restrictions. Each was reproduced in a failing test and fixed.
- Live HN inspection caught entity-encoded comment URLs; full entity decoding now precedes canonicalization, with a regression fixture.
- Validation includes automated contrast/accessibility checks, mobile overflow, successful import, dismiss/block persistence, stale request cancellation, AI validation/failure, source partial failure, response size bounds and DNS-rebinding host protection.
- Decisions: standalone React/Express app; browser-owned personal data; localhost default; optional Brave/YouTube/model credentials; no authentication, scheduler or full-corpus index in this release. Provider contract tests are automated; only no-key HN is verified against the live service.

- Implemented clarified objective: prior-knowledge profiles, explicit useful/known feedback, lower default popularity influence, and optional bounded usefulness/novelty assessment. Model estimates are labeled as snippet-based and uncertain. No passive engagement optimization.
- Additional independent review caught model work continuing after client cancellation. Request cancellation now propagates to upstream requests and prevents the later model stage; direct and HTTP-disconnect regressions pass.
