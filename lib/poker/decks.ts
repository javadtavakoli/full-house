export const SP_DECK = [1, 2, 3, 5, 8, 13, 21] as const;
export const DURATION_DECK = [1, 2, 4, 8, 16, 24] as const;

export type EstimateKind = "sp" | "duration";

export function deckFor(kind: EstimateKind): readonly number[] {
  return kind === "sp" ? SP_DECK : DURATION_DECK;
}

export function isValidCard(value: number, kind: EstimateKind): boolean {
  return deckFor(kind).includes(value as never);
}
