import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

type Member = { userId: string; displayName: string; avatarUrl: string | null; role: string };

export function VoterList({
  members, votedUserIds, moderatorId,
}: { members: Member[]; votedUserIds: Set<string>; moderatorId: string | null }) {
  return (
    <div className="flex flex-wrap gap-3 justify-center">
      {members.map((m) => {
        const initials = m.displayName.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
        const voted = votedUserIds.has(m.userId);
        return (
          <div key={m.userId} className="flex flex-col items-center gap-1">
            <div className={`relative rounded-full ${voted ? "ring-2 ring-emerald-500" : "ring-1 ring-muted"}`}>
              <Avatar>
                {m.avatarUrl && <AvatarImage src={m.avatarUrl} />}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              {voted && (
                <span className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">✓</span>
              )}
            </div>
            <span className="text-xs">{m.displayName}</span>
            {m.userId === moderatorId && <Badge variant="secondary" className="text-[10px]">mod</Badge>}
          </div>
        );
      })}
    </div>
  );
}
