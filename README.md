# customnet

**Your internet, on purpose. Value over attention.** A standalone personal discovery app where you write the brief, choose the sources, and inspect why each result appeared. No extension, account, hidden behavioral profile, or infinite scroll.

Inspired by [Karpathy’s community-backed video discovery](https://x.com/karpathy/status/2116957135661945283) and [signulll’s personal storefront idea](https://x.com/signulll/status/2116957956961124576).

## Run it

Requires Node.js 22.12+ (Node 24 recommended).

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4311**. Select a lens, review its rules, and click **Run this lens**. No keys needed for Hacker News discovery, including links to videos.

For development, `npm run dev` serves Vite on http://127.0.0.1:5173 and proxies the API to port 4311. Keep the API at its default port when using this development proxy.

## What it does

- **Find gems, not engagement:** describe what you already know, mark finds Useful or Already know, and optionally ask your model to estimate usefulness and novelty. Known URLs stay out of future discovery; useful finds are saved. Clicks, watch time and session length are never ranking rewards.
- **Reusable lenses:** brief, up to three search phrases, exact-phrase exclusions, preferred/blocked domains, evidence and freshness weights, independent-discussion minimum, source diversity and result count.
- **One discovery surface:** Everything, Watch, Read, Shop and Social. These tabs change the lens type and run a new search. Shop discovers product-related links; Social discovers publicly indexed social posts.
- **Inspect the algorithm:** every find has score components, readable reasons, and links to available HN discussions/comments. The minimum discussion filter applies to every source: it excludes results without enough HN evidence, including direct YouTube/web results.
- **Your own library:** save, dismiss, block domains globally, restore dismissals, add links from any site, and export/import the entire browser workspace.
- **Intentional video playback:** no remote thumbnails or third-party embeds load on discovery. Click a YouTube card to load a privacy-enhanced embed, or open the original. Other video platforms open at source.
- **Optional AI:** translate your brief into editable search phrases and exclusions using your own OpenAI-compatible model. Brief interpretation runs only on its explicit button. An independent per-lens opt-in enables value assessment when you run that lens. Retrieval and deterministic ranking do not require AI.

The brief itself is **not an executable arbitrary instruction**. Without AI, “Extract keywords” is a conservative text helper. With AI, suggestions still need review. Only the visible structured rules are enforced. This release does not promise to classify subjective requests such as “no ragebait,” check every factual claim, or understand video contents.

## Connections

Copy `.env.example` to `.env`, configure the connections you want, then restart. Keys stay on the server.

| Setting                                          | Enables                                               | Limits                                                                   |
| ------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| None                                             | HN Algolia story/comment discovery                    | Bounded search, no full historical index                                 |
| `BRAVE_API_KEY`                                  | General web, shopping discovery, indexed social links | Provider subscription/quota; no private feeds or verified product offers |
| `YOUTUBE_API_KEY`                                | Direct YouTube search                                 | Provider quota; playback may be unavailable                              |
| `AI_BASE_URL`, `AI_MODEL`, optional `AI_API_KEY` | OpenAI-compatible brief interpreter                   | Endpoint must support chat completions and JSON output                   |
| `APP_ORIGIN`                                     | Custom origin behind your reverse proxy               | Exact origin, such as `https://customnet.example.com`                    |

`AI_BASE_URL` is the trusted operator-configured API base (for example `http://127.0.0.1:11434/v1`). The server appends `/chat/completions`. It does not allow browser requests to choose an arbitrary fetch destination. Hosted AI services may charge per interpretation and per value-assessment run. Search providers may charge per run; each search uses at most three queries per enabled provider. HN makes a story and comment request per query. Source status is displayed when a provider is missing, unavailable or partially failed.

Provider docs: [HN search](https://hn.algolia.com/api), [Brave Search](https://api-dashboard.search.brave.com/app/documentation/web-search/get-started), [YouTube search](https://developers.google.com/youtube/v3/docs/search/list).

## What “quality” means here

This release makes preferences and evidence inspectable; it does not pretend to certify quality. Candidates come from up to 60 HN stories and 60 comments per phrase, 20 Brave results per phrase, and 25 YouTube results per phrase. Duplicate URLs and YouTube URL variants merge. HN recurrence counts **distinct root discussions**, not comment count; source links preserve the evidence. A mention is not necessarily an endorsement. Counts describe this retrieval, not all historical HN activity.

By default, community weight is 25 and freshness weight is 5, so popularity is supporting evidence rather than the primary objective. Ranking adds keyword relevance (up to 50), community evidence (weighted, logarithmically capped), exponential freshness (one-year decay), and preferred-domain boost (25). Hard filters run first. Optional diversity reranks with a 35% incremental same-host penalty. Scores are ranking utilities, not calibrated quality percentages. HN timestamps are source submission dates, not verified original publication dates. Comments without a known publication date receive no freshness boost. Search results are cached in process for up to five minutes; restart clears the cache.

With **Estimate usefulness & novelty with AI** enabled, at most 36 candidates passing hard rules are shortlisted with reduced popularity/freshness influence. The model receives the brief, prior knowledge, and candidate titles/snippets. It returns bounded usefulness/novelty estimates and confidence; validated estimates add up to 60 usefulness points and 40 novelty points, each multiplied by confidence. User source preferences and hard filters remain in force. No score is invented for unassessed candidates, and an unavailable/invalid model falls back to deterministic ranking with a visible notice. These are uncalibrated model estimates, not a proven optimum or verified evaluation of full articles/videos.

“Useful” is an explicit rating that saves a find; it does not automatically generalize into inferred interests or boost that entire domain. “Already know” suppresses the exact canonical URL, not every treatment of the topic. The prior-knowledge text influences optional AI assessment; it has no hidden effect on deterministic ranking. A future benchmark of genuinely useful, new discoveries should measure this objective rather than engagement.

Shopping uses product-oriented web search, not a merchant catalog. Prices, stock, specifications, authenticity and seller quality are not verified. Social is search of publicly indexed content, not a replacement for an authenticated X timeline. There are no fabricated demo results or fallback recommendations.

## Privacy, persistence and deployment

Lenses, saved items, dismissals and blocked domains live in this browser’s localStorage. Export a backup before clearing site data or switching browsers. The workspace and its compact export share a 5 MB UTF-8 limit, so every exported backup can be imported. Changes beyond that limit are rejected without modifying existing data. Import validates the complete file before replacing the workspace. Storage failures leave current in-memory work available and show an export warning. There is no account sync or database.

Running discovery sends your query terms to selected providers through this server. The server briefly caches results; it does not write query logs or store personal state. Clicking AI interpretation sends the brief to the configured model. Opting into value assessment sends the brief, prior-knowledge profile and shortlisted snippets on discovery runs. Clicking a result leaves the app; clicking playback contacts YouTube. No remote fonts, analytics or images are fetched by the app itself.

The server binds **127.0.0.1 by default**. It has origin checks, request/body bounds, provider timeouts, bounded cache/concurrency, API rate limiting, security headers and safe-link validation. It has **no built-in authentication**. Do not expose a key-enabled instance publicly without authentication at a reverse proxy and appropriate provider budget limits. Configure `APP_ORIGIN` for that deployment. The application does not trust forwarded client-IP headers by default, so a proxy deployment shares one rate-limit bucket unless you explicitly implement a known-proxy policy.

```sh
# Optional container; bind its published port to loopback.
docker build -t customnet .
docker run --rm -p 127.0.0.1:4311:4311 --env-file .env customnet
```

When using Docker, omit `HOST=127.0.0.1` from the environment file (or pass `-e HOST=0.0.0.0`) so the app binds inside the container. Keep the host-side port mapping on loopback.

## Verification and structure

```sh
npm test                 # ranking, validation, persistence and API/provider contracts
npm run build            # strict TypeScript + client/server production build
npx playwright install chromium
npm run test:e2e          # deterministic browser workflow tests
```

Browser tests use explicit synthetic fixtures rather than external network availability. Live HN discovery is checked separately. Optional paid providers and AI have contract tests; live integration requires your credentials. CI runs unit/API tests, build and Chromium workflows.

- `shared/`: validated data contracts, deterministic ranking, keyword helper
- `server/`: bounded provider adapters, discovery/interpretation API, static serving
- `src/`: responsive React interface and browser state
- `tests/`: unit, contract and browser tests
- `docs/superpowers/`: product decisions and implementation record

## Next steps

A durable full-corpus recommendation index, semantic relevance/reranking, configurable RSS/ActivityPub sources, richer merchant catalogs with timestamped verified offers, scheduled refresh, and private cross-device sync would extend this foundation. Those capabilities are not implemented in this release.
