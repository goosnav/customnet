import { z } from "zod";
import { lensSchema, itemSchema, safeUrl } from "../shared/schema";
export const storageKey = "customnet:v1";
export const stateSchema = z
  .object({
    version: z.literal(1),
    lenses: z.array(lensSchema).min(1).max(30),
    activeId: z.string(),
    saved: z.array(itemSchema).max(2000),
    hidden: z.array(safeUrl).max(2000),
    known: z.array(safeUrl).max(2000).default([]),
    useful: z.array(safeUrl).max(2000).default([]),
    blockedDomains: lensSchema.shape.blockedDomains,
  })
  .refine(
    (s) =>
      s.lenses.some((l) => l.id === s.activeId) &&
      new Set(s.lenses.map((l) => l.id)).size === s.lenses.length,
    "Invalid or duplicate lens IDs",
  );
export type PersonalState = z.infer<typeof stateSchema>;
export function initialState(): PersonalState {
  return {
    version: 1,
    activeId: "curiosity",
    lenses: [
      lensSchema.parse({
        id: "curiosity",
        name: "Deep curiosity",
        brief:
          "Find thoughtful explorations of computer graphics, creative tools, and how things work. Avoid crypto and politics.",
        queries: ["computer graphics", "creative tools"],
        exclude: ["crypto", "politics"],
      }),
      lensSchema.parse({
        id: "watch",
        name: "Worth watching",
        brief:
          "Find physics lectures and explanations that people have shared on Hacker News.",
        queries: ["physics lecture", "visual explanation"],
        kind: "video",
        evidenceWeight: 25,
        recencyWeight: 5,
      }),
      lensSchema.parse({
        id: "shop",
        name: "Buy fewer, better things",
        brief: "Find well-made, repairable everyday tools.",
        queries: ["repairable everyday tools"],
        sources: ["brave"],
        kind: "product",
        preferredDomains: [],
      }),
    ],
    saved: [],
    hidden: [],
    known: [],
    useful: [],
    blockedDomains: [],
  };
}
export const MAX_BACKUP_BYTES = 5_000_000;
export function serializeBackup(state: PersonalState): string {
  const json = JSON.stringify(stateSchema.parse(state));
  if (new TextEncoder().encode(json).byteLength > MAX_BACKUP_BYTES)
    throw Error(
      "Workspace exceeds 5 MB. Remove some saved finds before adding more.",
    );
  return json;
}
export function transitionState(
  previous: PersonalState,
  update: PersonalState | ((s: PersonalState) => PersonalState),
): { state: PersonalState; error?: string } {
  try {
    const next = typeof update === "function" ? update(previous) : update;
    serializeBackup(next);
    return { state: next };
  } catch (error) {
    return {
      state: previous,
      error:
        error instanceof Error
          ? error.message
          : "This change could not be applied.",
    };
  }
}
export function parseBackup(json: string): PersonalState {
  if (new TextEncoder().encode(json).byteLength > MAX_BACKUP_BYTES)
    throw Error("Backup is too large (5 MB maximum).");
  const state = stateSchema.parse(JSON.parse(json));
  serializeBackup(state);
  return state;
}
export function loadState(storage: Pick<Storage, "getItem">): {
  state: PersonalState;
  error?: string;
} {
  try {
    const data = storage.getItem(storageKey);
    return { state: data ? parseBackup(data) : initialState() };
  } catch {
    return {
      state: initialState(),
      error:
        "Your browser data could not be read. A temporary default workspace is open; export anything you want to keep.",
    };
  }
}
export function persistState(
  state: PersonalState,
  storage: Pick<Storage, "setItem">,
): string | undefined {
  try {
    storage.setItem(storageKey, serializeBackup(state));
  } catch {
    return "Changes could not be saved in this browser. They remain open here; export a backup before closing.";
  }
}
