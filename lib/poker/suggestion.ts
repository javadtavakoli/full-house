import { SP_DECK, DURATION_DECK } from "./decks";

export function suggestSp(votes: number[]): number | null {
  if (votes.length === 0) return null;
  const counts = new Map<number, number>();
  for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1);
  const maxCount = Math.max(...counts.values());
  const modes = [...counts.entries()].filter(([, c]) => c === maxCount).map(([v]) => v);
  if (modes.length === 1) return modes[0]!;
  // Tied mode → highest of tied values
  if (maxCount > 1) return Math.max(...modes);
  // All unique → median, rounded up to nearest deck card
  const sorted = [...votes].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const median =
    sorted.length % 2 === 1 ? sorted[Math.floor(mid)]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return snapUp(median, SP_DECK);
}

export function suggestDuration(votes: number[]): number | null {
  if (votes.length === 0) return null;
  const avg = votes.reduce((a, b) => a + b, 0) / votes.length;
  return snapToNearestRoundingUp(avg, DURATION_DECK);
}

function snapUp(value: number, deck: readonly number[]): number {
  for (const c of deck) if (c >= value) return c;
  return deck[deck.length - 1]!;
}

function snapToNearestRoundingUp(value: number, deck: readonly number[]): number {
  let best = deck[0]!;
  let bestDist = Math.abs(value - best);
  for (const c of deck.slice(1)) {
    const d = Math.abs(value - c);
    if (d < bestDist || (d === bestDist && c > best)) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}
