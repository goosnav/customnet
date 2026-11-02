// Deliberately conservative: prose is a brief, these visible terms are executable.
export function interpretLocally(brief: string) {
  const [positive, ...negative] = brief.split(/\b(?:avoid|exclude|without)\b/i);
  const exclude = negative
    .join(",")
    .split(/[,;\n]/)
    .map((s) => s.trim().replace(/[.!]$/, ""))
    .filter(Boolean)
    .slice(0, 20)
    .map((s) => s.slice(0, 120));
  const cleaned = positive
    .replace(
      /\b(?:please|find|show|me|i|want|discover|the|best|about|videos?|articles?|on|for|and|with)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  const queries = cleaned
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((s) => s.split(" ").slice(0, 6).join(" ").slice(0, 120));
  return {
    queries: queries.length ? queries : ["interesting ideas"],
    exclude,
    mode: "local" as const,
    notice:
      "Keyword helper only. Review the search terms and exclusions below; other instructions in your brief are not enforced.",
  };
}
