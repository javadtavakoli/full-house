import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

type Member = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  lastSeenAt: string;
};

// Presence ping is every 30s, so 75s gives a 2.5x margin before we flag stale.
const ONLINE_WINDOW_MS = 75_000;

export function VoterList({
  members, votedUserIds, moderatorId,
}: { members: Member[]; votedUserIds: Set<string>; moderatorId: string | null }) {
  return (
    <div className="flex flex-wrap gap-3 justify-center">
      {members.map((m) => {
        const initials = m.displayName.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
        const voted = votedUserIds.has(m.userId);
        const online = Date.now() - new Date(m.lastSeenAt).getTime() < ONLINE_WINDOW_MS;
        const ringClass = voted
          ? "ring-2 ring-emerald-500"
          : online
            ? "ring-1 ring-muted"
            : "ring-1 ring-muted opacity-40";
        return (
          <div key={m.userId} className="flex flex-col items-center gap-1">
            <div className={`relative rounded-full ${ringClass}`}>
              <Avatar>
                {m.avatarUrl && <AvatarImage src={m.avatarUrl} />}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              {voted && (
                <span className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">✓</span>
              )}
              {!online && !voted && (
                <span
                  className="absolute -bottom-1 -right-1 bg-muted-foreground text-background rounded-full w-3 h-3"
                  title="offline"
                />
              )}
            </div>
            <span className={`text-xs ${online ? "" : "text-muted-foreground italic"}`}>{m.displayName}</span>
            {m.userId === moderatorId && <Badge variant="secondary" className="text-[10px]">mod</Badge>}
          </div>
        );
      })}
    </div>
  );
}
