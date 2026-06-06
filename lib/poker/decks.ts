export const SP_DECK = [1, 2, 3, 5, 8, 13, 21] as const;
export const DURATION_DECK = [1, 2, 4, 8, 16, 24] as const;

export type EstimateKind = "sp" | "duration";

export function deckFor(kind: EstimateKind): readonly number[] {
  return kind === "sp" ? SP_DECK : DURATION_DECK;
}

export function isValidCard(value: number, kind: EstimateKind): boolean {
  if (kind === "sp") return deckFor(kind).includes(value as never);
  // duration: free-form hours, 0 to 999, finite
  return Number.isFinite(value) && value >= 0 && value <= 999;
}
