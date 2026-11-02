# Customnet: an internet shaped by intent

## Intent

Build a standalone personal discovery web app, not an extension. Users specify what deserves their attention; the software retrieves candidates, applies explicit preferences, explains the ranking, and preserves useful finds. Inspired by Karpathy's HN-backed video discovery and signulll's personalized boutique. User requested implementation and a push to goosnav/customnet; implementation choices below are builder decisions within that authorization.

## Product

Saved lenses contain a natural-language brief, editable search topics, excluded phrases, preferred/blocked domains, enabled providers, minimum independent HN discussion count, freshness/evidence weights and a finite result limit. Discover, Watch, Read, Shop and Social are views of a shared result model. Saved items survive new searches. Dismissed URLs and blocked domains affect future results. Export/import includes lenses, preferences and saved items. No login required; personal state stays in the browser. No hidden behavioral profiling.

A warm paper/forest-green editorial interface uses a persistent lens sidebar, prominent brief editor, result cards and a source/rules panel. Responsive, keyboard accessible, meaningful empty/loading/error states. Evidence details expose links, counts, date span, provider and score components. YouTube playback loads a privacy-enhanced iframe only after a click, with an external link fallback. No autoplay or infinite scroll.

## Retrieval and honesty

Live HN Algolia story and comment search works without credentials. Search is bounded, not a full historical corpus analysis. Group canonical URLs and YouTube IDs; count distinct HN threads, retain linked mentions and year span. Mentions are not necessarily endorsements. Other videos remain external links.

Optional Brave Search provides web, product-discovery and indexed public social links. Optional YouTube Data API provides video search. Shopping results are discovery links, never verified offers/prices; no checkout. Social search is the public search index, not an authenticated home timeline. Connections disclose unavailable providers and partial failures. No fabricated sample results, counts, summaries, prices or endorsements.

Optional OpenAI-compatible chat completions converts a brief into validated editable search topics and exclusions. No arbitrary tools/code execution and no automatic spend unless the user clicks interpret. Without AI, a conservative keyword extraction helper supplies an editable starting point; it explicitly does not understand arbitrary instructions. Hard rules run deterministically after retrieval and cannot be relaxed by AI. Model host/key/model are server environment configuration; never browser secrets.

## Architecture and boundaries

React + TypeScript + Vite frontend; Node >=22.12 + Express TypeScript API; shared Zod schemas and pure ranking module. Browser localStorage with validated imports and versioned export. Server adapters with bounded requests, timeouts and small TTL cache. Server binds localhost by default; production deployment requires an authenticated reverse proxy if exposed, particularly with paid providers. Origin checks, body limits, API rate limits, safe outbound links and fixed provider hosts. No server fetch of user-submitted arbitrary URLs.

## Acceptance

Run a live no-key lens, edit rules and rerun, see real evidence, save and dismiss, reload persistence, export and restore. Verify ranking hard filters, canonicalization, deduplication, independent mentions, import rejection, provider failures/timeouts, API validation and browser flow. Build and typecheck pass. README documents setup, provider limits, privacy, deployment, and future full-corpus indexing, richer feeds/catalogs and scheduled discovery.

## User clarification: optimize for gems, not retention

The user clarified that the fitness function is user value: unusually useful information that is not already common knowledge to them. Engagement, clicks, watch time and session length must never become ranking rewards.

Add a per-lens prior-knowledge profile, explicit “Useful” and “Already know” feedback, and optional AI value assessment. Already-known URLs are excluded from discovery; Useful is an explicit endorsement that saves the find, not a passive behavioral signal. Default community and recency weights are reduced so popularity does not dominate. A configured model can assess bounded candidates against the discovery brief and prior knowledge, returning usefulness, novelty, confidence and grounded rationale. These are labeled model estimates based on retrieved titles/snippets, never claims to have read full articles or watched videos. Hard filters run before and after assessment, and AI failure preserves deterministic results with a visible warning. Without AI, no novelty score is invented.
