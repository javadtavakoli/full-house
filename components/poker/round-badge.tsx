import { Badge } from "@/components/ui/badge";
export function RoundBadge({ round }: { round: number }) {
  if (round <= 1) return null;
  return <Badge variant="outline">Round {round}</Badge>;
}
