import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Aperture,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Compass,
  Download,
  Globe2,
  Layers3,
  LoaderCircle,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X,
  Play,
  BookOpen,
  ShoppingBag,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import {
  itemSchema,
  lensSchema,
  type Item,
  type Lens,
  type Discovery,
  type SourceStatus,
} from "../shared/schema";
import { canonicalUrl, matchesDomain, youtubeId } from "../shared/ranking";
import { interpretLocally } from "../shared/intent";
import {
  initialState,
  loadState,
  parseBackup,
  persistState,
  serializeBackup,
  transitionState,
  type PersonalState,
} from "./state";
import { ResultCard } from "./components/ResultCard";
import { RulesPanel } from "./components/RulesPanel";
import { Modal } from "./components/Modal";
type Config = {
  sources: SourceStatus[];
  ai: { enabled: boolean; model: string | null };
};
const names = { hn: "Hacker News", brave: "Brave Search", youtube: "YouTube" };
const tabs = [
  { id: "all", name: "Everything", icon: Compass },
  { id: "video", name: "Watch", icon: Play },
  { id: "article", name: "Read", icon: BookOpen },
  { id: "product", name: "Shop", icon: ShoppingBag },
  { id: "social", name: "Social", icon: MessageCircle },
] as const;
async function api<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const r = await fetch(`/api/${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Request failed.");
  return data;
}
export default function App() {
  const [loaded] = useState(() => {
    try {
      return loadState(localStorage);
    } catch {
      return {
        state: initialState(),
        error:
          "Browser storage is unavailable. Export your work before closing.",
      };
    }
  });
  const [store, setStore] = useState<{ state: PersonalState; error?: string }>({
    state: loaded.state,
  });
  const state = store.state;
  function setState(
    update: PersonalState | ((s: PersonalState) => PersonalState),
  ) {
    setStore((previous) => transitionState(previous.state, update));
  }
  const lastStored = useRef(JSON.stringify(loaded.state));
  const [storageError, setStorageError] = useState(loaded.error || "");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [config, setConfig] = useState<Config>({
    sources: [],
    ai: { enabled: false, model: null },
  });
  const [view, setView] = useState<"discover" | "saved">("discover");
  const [modal, setModal] = useState<"connections" | "new" | "link" | null>(
    null,
  );
  const [rulesOpen, setRulesOpen] = useState(false);
  const [result, setResult] = useState<Discovery | null>(null);
  const [runLens, setRunLens] = useState<Lens | null>(null);
  const [busy, setBusy] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [filter, setFilter] = useState("");
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const interpretationController = useRef<AbortController | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const lens = state.lenses.find((l) => l.id === state.activeId)!;
  useEffect(() => {
    api<Config>("config")
      .then(setConfig)
      .catch(() =>
        setError(
          "Cannot connect to the discovery server. Start it, then reload this page.",
        ),
      );
    return () => {
      controller.current?.abort();
      interpretationController.current?.abort();
    };
  }, []);
  useEffect(() => {
    const json = JSON.stringify(state);
    if (json === lastStored.current) return;
    let message;
    try {
      message = persistState(state, localStorage);
    } catch {
      message =
        "Changes could not be saved in this browser. Export a backup before closing.";
    }
    setStorageError(message || "");
    if (!message) lastStored.current = json;
  }, [state]);
  useEffect(() => {
    if (store.error) setError(store.error);
  }, [store.error]);
  function updateLens(next: Lens) {
    interpretationController.current?.abort();
    setInterpreting(false);
    setState((s) => ({
      ...s,
      lenses: s.lenses.map((l) => (l.id === next.id ? next : l)),
    }));
  }
  function selectLens(id: string) {
    requestId.current++;
    controller.current?.abort();
    interpretationController.current?.abort();
    setInterpreting(false);
    setBusy(false);
    setResult(null);
    setRunLens(null);
    setError("");
    setFilter("");
    setView("discover");
    setState((s) =>
      s.lenses.some((l) => l.id === id) ? { ...s, activeId: id } : s,
    );
  }
  async function run(next = lens) {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const id = ++requestId.current;
    setBusy(true);
    setError("");
    setView("discover");
    setResult(null);
    setRunLens(next);
    try {
      const response = await api<Discovery>(
        "discover",
        {
          lens: next,
          blockedDomains: state.blockedDomains,
          hidden: state.hidden,
          known: state.known,
        },
        ctrl.signal,
      );
      if (id === requestId.current) setResult(response);
    } catch (e) {
      if (!ctrl.signal.aborted) setError((e as Error).message);
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }
  async function interpret(useAI: boolean) {
    interpretationController.current?.abort();
    const ctrl = new AbortController();
    interpretationController.current = ctrl;
    const brief = lens.brief;
    const lensId = lens.id;
    setInterpreting(true);
    setError("");
    try {
      const data = await api<ReturnType<typeof interpretLocally>>(
        "interpret",
        { brief, useAI },
        ctrl.signal,
      );
      if (!ctrl.signal.aborted) {
        setState((s) => ({
          ...s,
          lenses: s.lenses.map((l) =>
            l.id === lensId && l.brief === brief
              ? { ...l, queries: data.queries, exclude: data.exclude }
              : l,
          ),
        }));
        setNotice(data.notice);
      }
    } catch (e) {
      if (!ctrl.signal.aborted) setError((e as Error).message);
    } finally {
      if (!ctrl.signal.aborted) setInterpreting(false);
    }
  }
  function toggleSave(item: Item) {
    setState((s) => {
      const exists = s.saved.some(
        (i) => canonicalUrl(i.url) === canonicalUrl(item.url),
      );
      if (!exists && s.saved.length >= 2000) {
        setNotice(
          "Your library is full. Export a backup and remove a few finds.",
        );
        return s;
      }
      return {
        ...s,
        saved: exists
          ? s.saved.filter(
              (i) => canonicalUrl(i.url) !== canonicalUrl(item.url),
            )
          : [itemSchema.parse(item), ...s.saved],
      };
    });
  }
  function useful(item: Item) {
    const url = canonicalUrl(item.url)!;
    const rated = state.useful.includes(url);
    if (
      !rated &&
      (state.useful.length >= 2000 ||
        (!state.saved.some((i) => canonicalUrl(i.url) === url) &&
          state.saved.length >= 2000))
    ) {
      setNotice("Your library is full. Export or remove a few finds first.");
      return;
    }
    setState((s) => ({
      ...s,
      useful: rated ? s.useful.filter((u) => u !== url) : [...s.useful, url],
      saved: s.saved.some((i) => canonicalUrl(i.url) === url)
        ? s.saved
        : [itemSchema.parse(item), ...s.saved],
    }));
    setNotice(
      rated
        ? "Usefulness rating removed. The find stays saved."
        : "Marked useful and saved. This is explicit feedback, not inferred from your clicks.",
    );
  }
  function alreadyKnow(item: Item) {
    if (state.known.length >= 2000) {
      setNotice("Known-item history is full. Reset it in Connections & data.");
      return;
    }
    setState((s) => ({
      ...s,
      known: [...new Set([...s.known, canonicalUrl(item.url)!])],
    }));
    setNotice(
      "Marked already known. Future discoveries skip this URL; saved copies remain in your library.",
    );
  }
  function hide(item: Item) {
    if (state.hidden.length >= 2000) {
      setNotice("Dismissal history is full. Clear it in Connections & data.");
      return;
    }
    setState((s) => ({
      ...s,
      hidden: [...new Set([...s.hidden, canonicalUrl(item.url)!])],
    }));
    setNotice(
      "Find dismissed. You can restore dismissed finds in Connections & data.",
    );
  }
  function block(item: Item) {
    const domain = new URL(item.url).hostname;
    if (state.blockedDomains.length >= 100) {
      setNotice("Your block list is full. Manage it in Connections & data.");
      return;
    }
    setState((s) => ({
      ...s,
      blockedDomains: [...new Set([...s.blockedDomains, domain])],
    }));
    setNotice(
      `${domain} is blocked across your lenses. Manage this in Connections & data.`,
    );
  }
  function exportBackup() {
    const url = URL.createObjectURL(
      new Blob([serializeBackup(state)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `customnet-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 5_000_000)
        throw Error("Backup is too large (5 MB maximum).");
      const next = parseBackup(await file.text());
      controller.current?.abort();
      interpretationController.current?.abort();
      requestId.current++;
      setBusy(false);
      setInterpreting(false);
      setState(next);
      setResult(null);
      setRunLens(null);
      setView("discover");
      setNotice("Backup restored. Run a lens to refresh its finds.");
      setModal(null);
    } catch {
      setError(
        "This file is not a valid Customnet backup (maximum 5 MB). Nothing was changed.",
      );
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }
  const dirty = runLens && JSON.stringify(runLens) !== JSON.stringify(lens);
  const items = (view === "saved" ? state.saved : result?.items || [])
    .filter(
      (i) =>
        !state.hidden.includes(canonicalUrl(i.url)!) &&
        (view === "saved" || !state.known.includes(canonicalUrl(i.url)!)) &&
        !state.blockedDomains.some((d) =>
          matchesDomain(new URL(i.url).hostname, d),
        ),
    )
    .filter((i) =>
      `${i.title} ${i.description} ${i.url}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
    );
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to discoveries
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("discover");
          }}
        >
          <Aperture size={30} strokeWidth={1.6} />
          <span>
            customnet<span className="brand-period">.</span>
          </span>
        </a>
        <p className="brand-caption">THE INTERNET, ON PURPOSE.</p>
        <nav aria-label="Main navigation">
          <button
            className={view === "discover" ? "nav-item active" : "nav-item"}
            onClick={() => setView("discover")}
          >
            <Compass size={18} /> Discover <span>↗</span>
          </button>
          <button
            className={view === "saved" ? "nav-item active" : "nav-item"}
            onClick={() => setView("saved")}
          >
            <Bookmark size={18} /> Saved finds{" "}
            <span className="nav-count">{state.saved.length}</span>
          </button>
        </nav>
        <div className="lens-heading">
          <span>YOUR LENSES</span>
          <button
            className="icon-button"
            aria-label="New lens"
            onClick={() => setModal("new")}
          >
            <Plus size={17} />
          </button>
        </div>
        <nav aria-label="Saved lenses" className="lens-list">
          {state.lenses.map((l, i) => (
            <button
              key={l.id}
              onClick={() => selectLens(l.id)}
              className={l.id === lens.id ? "lens-item selected" : "lens-item"}
            >
              <span className={`lens-dot color-${i % 3}`} />
              {l.name}
              {l.id === lens.id && <span className="selected-mark">●</span>}
            </button>
          ))}
        </nav>
        <button className="new-lens" onClick={() => setModal("new")}>
          <Plus size={15} /> Create a lens
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Globe2 size={26} strokeWidth={1} />
            <p>
              A little less noise.
              <br />A lot more <em>you.</em>
            </p>
          </div>
          <button className="nav-item" onClick={() => setModal("connections")}>
            <Settings2 size={17} /> Connections & data
          </button>
          <div className="local-status">
            <span /> Personal · stored on this browser
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Your internet <span>/</span>{" "}
            <strong>{view === "saved" ? "Saved finds" : lens.name}</strong>
          </div>
          <div className="topbar-actions">
            <span className="private-pill">
              <span /> No hidden profile
            </span>
            <button
              className="icon-button mobile-rules"
              aria-label="Toggle algorithm controls"
              onClick={() => setRulesOpen(!rulesOpen)}
            >
              <SlidersHorizontal size={20} />
            </button>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow green">
                {view === "saved"
                  ? "YOUR PERSONAL COLLECTION"
                  : "VALUE OVER ATTENTION"}
              </div>
              <h1>
                {view === "saved" ? (
                  "Keep what stays with you."
                ) : (
                  <>
                    The good part of
                    <br className="headline-break" /> the internet.
                  </>
                )}
              </h1>
              <p>
                {view === "saved"
                  ? "Useful ideas, good rabbit holes, and things worth returning to."
                  : "Useful, unfamiliar, worth your attention. Find the gems, then get on with life."}
              </p>
            </div>
            <div className="hero-mark" aria-hidden="true">
              <span />
              <span />
              <span />
              <Aperture size={45} strokeWidth={1} />
            </div>
          </div>
          {storageError && (
            <div className="alert error" role="alert">
              {storageError}
              <button onClick={exportBackup}>Export now</button>
            </div>
          )}
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert notice" role="status">
              {notice}
              <button
                className="icon-button"
                aria-label="Dismiss notice"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div
            className={
              view === "discover" ? "discovery-layout" : "library-layout"
            }
          >
            <section className="feed-column">
              {view === "discover" && (
                <section className="brief-box">
                  <div className="brief-heading">
                    <span>
                      <Sparkles size={16} /> YOUR DISCOVERY BRIEF
                    </span>
                    <span className="tiny-badge">YOU SET THE DIRECTION</span>
                  </div>
                  <label className="sr-only" htmlFor="brief">
                    Discovery brief
                  </label>
                  <textarea
                    id="brief"
                    value={lens.brief}
                    maxLength={2000}
                    onChange={(e) =>
                      updateLens({ ...lens, brief: e.target.value })
                    }
                    placeholder="What would you like your corner of the internet to look like?"
                  />
                  <div className="brief-footer">
                    <div>
                      <button
                        className="text-button"
                        disabled={interpreting || lens.brief.trim().length < 3}
                        onClick={() => interpret(false)}
                      >
                        {interpreting ? (
                          <LoaderCircle size={14} className="spin" />
                        ) : (
                          <SlidersHorizontal size={14} />
                        )}{" "}
                        Extract keywords
                      </button>
                      {config.ai.enabled && (
                        <button
                          className="text-button"
                          disabled={
                            interpreting || lens.brief.trim().length < 3
                          }
                          onClick={() => interpret(true)}
                        >
                          <Sparkles size={14} /> Interpret with AI
                        </button>
                      )}
                    </div>
                    <button
                      className="primary"
                      onClick={() => run()}
                      disabled={busy}
                    >
                      {busy ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <ArrowRight size={17} />
                      )}{" "}
                      {busy ? "Finding the good stuff…" : "Run this lens"}
                    </button>
                  </div>
                  <p className="brief-caveat">
                    Your brief is a starting point. The visible search terms and
                    rules control each run.
                  </p>
                </section>
              )}
              <div className="feed-toolbar">
                {view === "discover" ? (
                  <div
                    className="tabs"
                    role="group"
                    aria-label="Discovery type"
                  >
                    {tabs.map((t) => (
                      <button
                        key={t.id}
                        className={lens.kind === t.id ? "tab active" : "tab"}
                        onClick={() => {
                          const next = { ...lens, kind: t.id };
                          updateLens(next);
                          run(next);
                        }}
                      >
                        <t.icon size={15} />
                        {t.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <h2>
                    {items.length} saved find{items.length === 1 ? "" : "s"}
                  </h2>
                )}
                <button
                  className="text-button"
                  onClick={() => setModal("link")}
                >
                  <Plus size={14} /> Add a link
                </button>
              </div>
              {view === "discover" && dirty && (
                <div className="changes-note">
                  Your rules have changed.{" "}
                  <button onClick={() => run()}>
                    Run the lens to apply them <ArrowRight size={13} />
                  </button>
                </div>
              )}
              <div className="results-meta">
                <span>
                  {busy
                    ? "Searching your selected sources"
                    : view === "saved"
                      ? "Your library, not a reading assignment."
                      : result
                        ? `${items.length} finds from ${result.candidateCount} candidates`
                        : "Make room for something worthwhile."}
                </span>
                <label className="filter">
                  <Search size={14} />
                  <input
                    aria-label="Filter these finds"
                    placeholder="Filter these finds"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </label>
              </div>
              {result && view === "discover" && (
                <div className="source-statuses">
                  {result.sources.map((s) => (
                    <span
                      className={`source-chip ${s.state}`}
                      key={s.id}
                      title={s.message}
                    >
                      <span />
                      {names[s.id]} ·{" "}
                      {s.state === "ok"
                        ? s.count
                        : s.state === "unconfigured"
                          ? "needs setup"
                          : s.state}
                    </span>
                  ))}
                </div>
              )}
              {result &&
                view === "discover" &&
                result.sources.some(
                  (s) =>
                    s.state === "error" ||
                    s.state === "unconfigured" ||
                    s.message.includes("incomplete"),
                ) && (
                  <div className="coverage-alert">
                    {result.sources
                      .filter(
                        (s) =>
                          s.state === "error" ||
                          s.state === "unconfigured" ||
                          s.message.includes("incomplete"),
                      )
                      .map((s) => (
                        <p key={s.id}>
                          <strong>{names[s.id]}:</strong> {s.message}
                        </p>
                      ))}
                    <button
                      className="text-button"
                      onClick={() => setModal("connections")}
                    >
                      View connections <ArrowUpRight size={13} />
                    </button>
                  </div>
                )}
              {result?.valueStatus && view === "discover" && (
                <div className="value-status">
                  <Sparkles size={14} />
                  <p>{result.valueStatus.message}</p>
                </div>
              )}
              {busy ? (
                <div className="loading-state" role="status">
                  <div className="loading-orbit">
                    <Aperture size={40} className="spin" strokeWidth={1} />
                  </div>
                  <h2>Following your curiosity.</h2>
                  <p>
                    Searching sources, gathering evidence, applying your rules.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => {
                      controller.current?.abort();
                      requestId.current++;
                      setBusy(false);
                      setNotice("Search cancelled.");
                    }}
                  >
                    Cancel search
                  </button>
                </div>
              ) : items.length ? (
                <div className="result-grid">
                  {items.map((item, index) => (
                    <ResultCard
                      key={item.url}
                      item={item}
                      index={index}
                      saved={state.saved.some(
                        (i) => canonicalUrl(i.url) === canonicalUrl(item.url),
                      )}
                      onSave={() => toggleSave(item)}
                      useful={state.useful.includes(canonicalUrl(item.url)!)}
                      onUseful={() => useful(item)}
                      onKnown={() => alreadyKnow(item)}
                      onHide={() => hide(item)}
                      onBlock={() => block(item)}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">
                    {view === "saved" ? (
                      <Bookmark size={30} strokeWidth={1.3} />
                    ) : (
                      <Layers3 size={34} strokeWidth={1.2} />
                    )}
                  </div>
                  <div className="eyebrow">
                    {result || filter
                      ? "A LITTLE TOO QUIET"
                      : "CURATED BY YOUR INTENT"}
                  </div>
                  <h2>
                    {view === "saved"
                      ? "A place for the keepers."
                      : result || filter
                        ? "Nothing fits just yet."
                        : "What will you make room for?"}
                  </h2>
                  <p>
                    {view === "saved"
                      ? "Save finds as you explore, or add a link you already love."
                      : result || filter
                        ? "Try broader search terms, fewer exclusions, or another connected source. Your rules stay in your hands."
                        : "Start with this lens, or describe your own. We’ll search real sources and show you what earned a place."}
                  </p>
                  {view === "discover" && !result && !filter && (
                    <button className="primary" onClick={() => run()}>
                      Explore {lens.name.toLowerCase()} <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              )}
              {result && view === "discover" && !busy && (
                <footer className="end-note">
                  <Aperture size={21} strokeWidth={1.2} />
                  <strong>You’ve reached the end. That’s intentional.</strong>
                  <span>{result.coverage}</span>
                  <small>
                    Retrieved {new Date(result.fetchedAt).toLocaleString()} ·
                    results cached for up to 5 minutes
                  </small>
                </footer>
              )}
            </section>
            {view === "discover" && (
              <div
                className={rulesOpen ? "rules-wrapper open" : "rules-wrapper"}
              >
                <RulesPanel
                  key={lens.id}
                  lens={lens}
                  onChange={updateLens}
                  sources={config.sources}
                  onConnections={() => setModal("connections")}
                  onEditing={() => {
                    interpretationController.current?.abort();
                    setInterpreting(false);
                  }}
                />
              </div>
            )}
          </div>
        </main>
        <footer className="page-footer">
          <span>
            customnet<span className="green">.</span>
          </span>
          <span>Good finds. Clear reasons. Your rules.</span>
          <a
            href="https://github.com/goosnav/customnet"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open source <ArrowUpRight size={12} />
          </a>
        </footer>
      </div>
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="Import Customnet backup"
        onChange={(e) => importBackup(e.target.files?.[0])}
      />
      {modal === "connections" && (
        <Modal title="Connections & your data" onClose={() => setModal(null)}>
          <p className="muted">
            Hacker News works out of the box. Connect more sources in the
            server’s .env file and restart. Keys never enter your browser.
          </p>
          <div className="connection-list">
            {config.sources.map((s) => (
              <section key={s.id}>
                <div>
                  <h3>{names[s.id]}</h3>
                  <span className={`status-label ${s.state}`}>
                    {s.state === "ready" ? "Connected" : "Optional connection"}
                  </span>
                </div>
                <p>{s.message}</p>
                {s.id !== "hn" && (
                  <code>
                    {s.id === "brave" ? "BRAVE_API_KEY" : "YOUTUBE_API_KEY"}
                  </code>
                )}
              </section>
            ))}
            <section>
              <div>
                <h3>AI brief interpreter</h3>
                <span className="status-label">
                  {config.ai.enabled ? "Connected" : "Optional"}
                </span>
              </div>
              <p>
                {config.ai.enabled
                  ? `Model: ${config.ai.model}. Runs only when you click Interpret with AI.`
                  : "Works with an OpenAI-compatible hosted or local model. Set AI_BASE_URL and AI_MODEL; add AI_API_KEY if required."}
              </p>
              <small>
                Interpreting sends your brief to your configured model. Opt-in
                value assessment also sends your prior knowledge and candidate
                snippets. Search sends terms to selected providers. Ranking and
                saved finds stay here.
              </small>
            </section>
          </div>
          <div className="data-section">
            <h3>Your data belongs to you</h3>
            <p>
              Export lenses, saved finds, dismissals and blocks. Importing a
              backup replaces this browser’s workspace.
            </p>
            <div className="button-row">
              <button className="secondary" onClick={exportBackup}>
                <Download size={16} /> Export backup
              </button>
              <button
                className="secondary"
                onClick={() => importRef.current?.click()}
              >
                <Upload size={16} /> Import backup
              </button>
            </div>
            <button
              className="text-button"
              onClick={() => {
                setState((s) => ({ ...s, hidden: [] }));
                setNotice(
                  "Dismissed finds restored. Rerun your lens to retrieve them again.",
                );
              }}
            >
              <RefreshCw size={14} /> Restore {state.hidden.length} dismissed
              finds
            </button>
            <button
              className="text-button"
              onClick={() => {
                setState((s) => ({ ...s, known: [] }));
                setNotice(
                  "Known-item history reset. Rerun a lens to rediscover those links.",
                );
              }}
            >
              <RefreshCw size={14} /> Reset {state.known.length} already-known
              links
            </button>
            <p className="fine-print">
              {state.useful.length} finds explicitly marked useful. No clicks,
              watch time or session duration are tracked or used as ranking
              rewards.
            </p>
            {state.blockedDomains.length > 0 && (
              <div className="blocked-list">
                <h4>Blocked across all lenses</h4>
                {state.blockedDomains.map((d) => (
                  <button
                    key={d}
                    onClick={() =>
                      setState((s) => ({
                        ...s,
                        blockedDomains: s.blockedDomains.filter((x) => x !== d),
                      }))
                    }
                  >
                    {d}
                    <X size={12} />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="data-section">
            <h3>Current lens</h3>
            <label className="field">
              Lens name
              <input
                value={lens.name}
                maxLength={80}
                onChange={(e) => {
                  if (e.target.value.trim())
                    updateLens({ ...lens, name: e.target.value });
                }}
              />
            </label>
            <button
              className="text-button danger"
              disabled={state.lenses.length === 1}
              onClick={() => {
                const remaining = state.lenses.filter((l) => l.id !== lens.id);
                selectLens(remaining[0].id);
                setState((s) => ({
                  ...s,
                  lenses: remaining,
                  activeId: remaining[0].id,
                }));
                setModal(null);
              }}
            >
              Delete this lens
            </button>
          </div>
        </Modal>
      )}
      {modal === "new" && (
        <NewLens
          onClose={() => setModal(null)}
          onCreate={(next) => {
            if (state.lenses.length >= 30) {
              setError(
                "You can keep up to 30 lenses. Export or remove one first.",
              );
              return;
            }
            selectLens(next.id);
            setState((s) => ({
              ...s,
              lenses: [...s.lenses, next],
              activeId: next.id,
            }));
            setModal(null);
            setNotice("Lens created. Review its rules, then run it.");
          }}
        />
      )}
      {modal === "link" && (
        <AddLink
          onClose={() => setModal(null)}
          onAdd={(item) => {
            if (state.saved.length >= 2000) {
              setError(
                "Your library is full. Remove a find before adding another.",
              );
              return;
            }
            setState((s) => ({
              ...s,
              saved: [
                item,
                ...s.saved.filter(
                  (i) => canonicalUrl(i.url) !== canonicalUrl(item.url),
                ),
              ],
            }));
            setModal(null);
            setView("saved");
            setNotice("Link added to your library.");
          }}
        />
      )}
    </div>
  );
}
function NewLens({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (l: Lens) => void;
}) {
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  return (
    <Modal title="Make the internet a little more you." onClose={onClose}>
      <p className="muted">
        A lens is a reusable brief with rules you control. Start with something
        you’re curious about.
      </p>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          const terms = interpretLocally(brief);
          onCreate(
            lensSchema.parse({
              id: crypto.randomUUID(),
              name,
              brief,
              queries: terms.queries,
              exclude: terms.exclude,
            }),
          );
        }}
      >
        <label className="field">
          Give it a name
          <input
            required
            autoFocus
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Quietly brilliant ideas"
          />
        </label>
        <label className="field">
          What are you looking for?
          <textarea
            required
            minLength={3}
            maxLength={2000}
            rows={4}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Find independent animation and practical filmmaking. Avoid celebrity news."
          />
        </label>
        <p className="fine-print">
          We’ll extract editable keywords. No AI or paid connection needed.
        </p>
        <button
          className="primary"
          disabled={!name.trim() || brief.trim().length < 3}
        >
          Create lens <ArrowRight size={16} />
        </button>
      </form>
    </Modal>
  );
}
function AddLink({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (i: Item) => void;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Item["kind"]>("article");
  const [error, setError] = useState("");
  return (
    <Modal title="Keep a good find." onClose={onClose}>
      <p className="muted">
        Save a link from any video site, shop, publication or social network.
        Customnet won’t fetch it or invent metadata.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const canonical = canonicalUrl(url);
          const id = canonical ? youtubeId(canonical) : undefined;
          const parsed = itemSchema.safeParse({
            url: canonical,
            title,
            kind: id ? "video" : kind,
            provider: "import",
            youtubeId: id,
          });
          if (!parsed.success) {
            setError("Enter a valid http or https URL and a title.");
            return;
          }
          onAdd(parsed.data);
        }}
      >
        <label className="field">
          URL
          <input
            autoFocus
            required
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>
        <label className="field">
          Title
          <input
            required
            maxLength={500}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Item["kind"])}
          >
            {tabs
              .filter((t) => t.id !== "all")
              .map((t) => (
                <option value={t.id} key={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <button className="primary">
          Save link <Bookmark size={16} />
        </button>
      </form>
    </Modal>
  );
}
