import {
  ArrowUpRight,
  Bookmark,
  Check,
  EyeOff,
  Play,
  ShieldX,
  ChevronDown,
  Link2,
  ThumbsUp,
  Brain,
} from "lucide-react";
import { useState } from "react";
import type { Item, RankedItem } from "../../shared/schema";
import { Modal } from "./Modal";
const labels = {
  article: "READ",
  video: "WATCH",
  product: "CONSIDER",
  social: "CONVERSATION",
};
export function ResultCard({
  item,
  index,
  saved,
  onSave,
  onHide,
  onBlock,
  useful,
  onUseful,
  onKnown,
}: {
  item: Item | RankedItem;
  index: number;
  saved: boolean;
  onSave: () => void;
  onHide: () => void;
  onBlock: () => void;
  useful: boolean;
  onUseful: () => void;
  onKnown: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const host = new URL(item.url).hostname.replace(/^www\./, "");
  const ranked = "score" in item;
  return (
    <article className={`result-card kind-${item.kind}`}>
      <div className="card-top">
        <span className="eyebrow">{labels[item.kind]}</span>
        <span className="card-number">
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>
      {item.kind === "video" && (
        <button
          className="video-cover"
          onClick={() =>
            item.youtubeId
              ? setPlaying(true)
              : window.open(item.url, "_blank", "noopener,noreferrer")
          }
          aria-label={`Watch ${item.title}`}
        >
          <span className="video-orbit" />
          <span className="play-circle">
            <Play size={24} fill="currentColor" />
          </span>
          <span className="video-label">
            {item.youtubeId
              ? "YouTube · click to load"
              : "Open video at source"}
          </span>
        </button>
      )}
      <div className="card-body">
        <div className="source-line">
          <span className="source-dot" />
          {item.author || host}
          {item.publishedAt && (
            <>
              <span>·</span>
              <time title="Date of the source record">
                {new Date(item.publishedAt).getUTCFullYear()}
              </time>
            </>
          )}
        </div>
        <h3>
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            {item.title}
            <ArrowUpRight size={17} />
          </a>
        </h3>
        <p className="card-description">
          {item.description || "Open the original source to explore this find."}
        </p>
        {item.kind === "product" && (
          <p className="fine-print">
            Discovery link · check price, availability and claims at the source.
          </p>
        )}
        {ranked && (
          <div className="reason-preview">
            <Link2 size={13} />
            <span>
              {item.mentions
                ? `${item.mentions} HN discussion${item.mentions === 1 ? "" : "s"}`
                : item.provider === "brave"
                  ? "Found through web search"
                  : item.provider === "youtube"
                    ? "Found through YouTube"
                    : "Matches your lens"}
            </span>
          </div>
        )}
        <details className="evidence">
          <summary>
            Why this find <ChevronDown size={14} />
          </summary>
          <div>
            {ranked && item.assessment && (
              <div className="assessment">
                <strong>AI estimate · title/snippet only</strong>
                <p>
                  Usefulness {item.assessment.usefulness}/5 · New to you{" "}
                  {item.assessment.novelty}/5 · Confidence{" "}
                  {Math.round(item.assessment.confidence * 100)}%
                </p>
                <p>{item.assessment.rationale}</p>
              </div>
            )}
            {ranked ? (
              <>
                <ul>
                  {item.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <div className="score-grid">
                  {Object.entries(item.components).map(([key, value]) => (
                    <span key={key}>
                      {key}
                      <strong>{Math.round(value)}</strong>
                    </span>
                  ))}
                </div>
                <p className="fine-print">
                  Ranking score {item.score}, not a quality rating. Diversity
                  may reorder results.
                </p>
              </>
            ) : (
              <p>
                Saved from {item.provider}. Your library preserves the source
                evidence.
              </p>
            )}
            {item.evidence.length > 0 ? (
              <ul className="evidence-links">
                {item.evidence.map((e) => (
                  <li key={e.url}>
                    <a href={e.url} target="_blank" rel="noopener noreferrer">
                      {e.label}
                      {e.year ? ` · ${e.year}` : ""} <ArrowUpRight size={12} />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="fine-print">
                No community evidence was retrieved for this link.
              </p>
            )}
          </div>
        </details>
      </div>
      <footer className="card-actions">
        <button
          onClick={onSave}
          className={saved ? "saved" : ""}
          aria-label={`${saved ? "Unsave" : "Save"} ${item.title}`}
        >
          {saved ? <Check size={16} /> : <Bookmark size={16} />}{" "}
          {saved ? "Saved" : "Save"}
        </button>
        <div>
          <button
            className="icon-button"
            title="Dismiss this find"
            aria-label={`Dismiss ${item.title}`}
            onClick={onHide}
          >
            <EyeOff size={16} />
          </button>
          <button
            className="icon-button"
            title={`Block ${host}`}
            aria-label={`Block ${host}`}
            onClick={onBlock}
          >
            <ShieldX size={16} />
          </button>
        </div>
      </footer>
      <div className="value-feedback">
        <button
          className={useful ? "is-useful" : ""}
          aria-label={`${useful ? "Undo useful" : "Useful"}: ${item.title}`}
          onClick={onUseful}
        >
          <ThumbsUp size={13} />
          {useful ? "Useful ✓" : "Useful"}
        </button>
        <button aria-label={`Already know: ${item.title}`} onClick={onKnown}>
          <Brain size={13} /> Already know
        </button>
      </div>
      {playing && (
        <Modal wide title={item.title} onClose={() => setPlaying(false)}>
          <iframe
            className="player"
            title={item.title}
            src={`https://www.youtube-nocookie.com/embed/${item.youtubeId}`}
            allow="encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
          <p className="muted">
            Playback contacts YouTube. If embedding is unavailable,{" "}
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              watch at the source ↗
            </a>
            .
          </p>
        </Modal>
      )}
    </article>
  );
}
