import { useState } from "react";
import { SlidersHorizontal, ArrowRight } from "lucide-react";
import { lensSchema, type Lens, type SourceStatus } from "../../shared/schema";
const sourceNames = {
  hn: "Hacker News",
  brave: "The wider web",
  youtube: "YouTube",
};
function Lines({
  label,
  values,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  hint?: string;
}) {
  const [text, setText] = useState(values.join(", "));
  return (
    <label className="field">
      {label}
      <textarea
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() =>
          onChange(
            text
              .split(/[,\n]/)
              .map((x) => x.trim())
              .filter(Boolean),
          )
        }
        placeholder={placeholder}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function RulesPanel({
  lens,
  onChange,
  sources,
  onConnections,
  onEditing,
}: {
  lens: Lens;
  onChange: (lens: Lens) => void;
  sources: SourceStatus[];
  onConnections: () => void;
  onEditing: () => void;
}) {
  const [error, setError] = useState("");
  function update(patch: Partial<Lens>) {
    const result = lensSchema.safeParse({ ...lens, ...patch });
    if (result.success) {
      setError("");
      onChange(result.data);
    } else setError(result.error.issues[0].message);
  }
  return (
    <aside className="rules-panel" onChange={onEditing}>
      <div className="section-label">
        <SlidersHorizontal size={16} />
        <h2>Your algorithm</h2>
        <span className="tiny-badge">EDITABLE</span>
      </div>
      <p className="muted small">
        Optimize for value to you, not time spent here.
      </p>
      <Lines
        key={`${lens.id}-queries-${lens.queries.join("|")}`}
        label="Look for"
        values={lens.queries}
        onChange={(queries) => update({ queries })}
        placeholder="computer graphics, creative tools"
        hint="Up to 3 search phrases, separated by commas."
      />
      <Lines
        key={`${lens.id}-exclude-${lens.exclude.join("|")}`}
        label="Leave out"
        values={lens.exclude}
        onChange={(exclude) => update({ exclude })}
        placeholder="crypto, celebrity news"
        hint="Exact phrases are excluded from titles, snippets and URLs."
      />
      <label className="field">
        What you already know
        <textarea
          rows={3}
          maxLength={2000}
          value={lens.knowledge}
          onChange={(e) => update({ knowledge: e.target.value })}
          placeholder="I know the basics of 3D graphics. I want techniques I can actually use."
        />
        <small>
          Used by the optional AI assessment to distinguish new insight from
          familiar material.
        </small>
      </label>
      <label className="check-field value-toggle">
        <input
          type="checkbox"
          checked={lens.assessValue}
          onChange={(e) => update({ assessValue: e.target.checked })}
        />{" "}
        Estimate usefulness & novelty with AI
      </label>
      <p className="fine-print">
        Opt-in: sends your brief, knowledge and up to 36 candidate snippets to
        your configured model. No full-page or video analysis.
      </p>
      <div className="rule-divider" />
      <fieldset className="sources">
        <legend>Look in</legend>
        {(["hn", "brave", "youtube"] as const).map((id) => (
          <label key={id}>
            <input
              type="checkbox"
              checked={lens.sources.includes(id)}
              onChange={(e) =>
                update({
                  sources: e.target.checked
                    ? [...lens.sources, id]
                    : lens.sources.filter((x) => x !== id),
                })
              }
            />
            <span>{sourceNames[id]}</span>
            {sources.find((s) => s.id === id)?.state === "unconfigured" ? (
              <span className="connect-label">SETUP</span>
            ) : (
              <span className="ready-dot" />
            )}
          </label>
        ))}
      </fieldset>
      <button className="text-button" onClick={onConnections}>
        Manage connections <ArrowRight size={13} />
      </button>
      <div className="rule-divider" />
      <label className="slider-field">
        Community evidence <output>{lens.evidenceWeight}%</output>
        <input
          aria-label="Community evidence"
          type="range"
          min="0"
          max="100"
          value={lens.evidenceWeight}
          onChange={(e) => update({ evidenceWeight: Number(e.target.value) })}
        />
      </label>
      <label className="slider-field">
        Freshness <output>{lens.recencyWeight}%</output>
        <input
          aria-label="Freshness"
          type="range"
          min="0"
          max="100"
          value={lens.recencyWeight}
          onChange={(e) => update({ recencyWeight: Number(e.target.value) })}
        />
      </label>
      <label className="check-field">
        <input
          type="checkbox"
          checked={lens.diversity}
          onChange={(e) => update({ diversity: e.target.checked })}
        />{" "}
        Mix up the sources
      </label>
      <details className="advanced">
        <summary>Fine-tune this lens</summary>
        <div>
          <Lines
            key={`${lens.id}-preferred`}
            label="Prefer these domains"
            values={lens.preferredDomains}
            onChange={(preferredDomains) => update({ preferredDomains })}
            placeholder="mit.edu, lowtechmagazine.com"
          />
          <Lines
            key={`${lens.id}-blocked`}
            label="Block these domains"
            values={lens.blockedDomains}
            onChange={(blockedDomains) => update({ blockedDomains })}
            placeholder="example.com"
          />
          <label className="field">
            Minimum HN discussions
            <select
              value={lens.minMentions}
              onChange={(e) => update({ minMentions: Number(e.target.value) })}
            >
              {[0, 1, 2, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "No minimum" : `${n} independent discussions`}
                </option>
              ))}
            </select>
            <small>
              A minimum also removes web/YouTube finds without HN evidence.
            </small>
          </label>
          <label className="field">
            Finds per run
            <select
              value={lens.limit}
              onChange={(e) => update({ limit: Number(e.target.value) })}
            >
              {[12, 24, 48].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
      </details>
      {error && (
        <p className="inline-error" role="alert">
          Rule not applied: {error}
        </p>
      )}
      <div className="rules-note">
        <span>↳</span>
        <p>
          Curiosity, with boundaries.
          <br />
          No infinite scroll. No hidden profile.
        </p>
      </div>
    </aside>
  );
}
