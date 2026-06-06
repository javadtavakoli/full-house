"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export type Candidate = {
  youtrackId: string;
  login: string;
  name: string;
  fullName: string;
};

export function VoterPicker({
  sessionId,
  sessionName,
  candidates,
  claimedYoutrackIds,
}: {
  sessionId: string;
  sessionName: string;
  candidates: Candidate[];
  claimedYoutrackIds: string[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const claimed = useMemo(
    () => new Set(claimedYoutrackIds),
    [claimedYoutrackIds],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return candidates;
    return candidates.filter(
      (c) =>
        (c.fullName || c.name || "").toLowerCase().includes(needle) ||
        c.login.toLowerCase().includes(needle),
    );
  }, [q, candidates]);

  async function pick(c: Candidate) {
    if (claimed.has(c.youtrackId)) return;
    setError(null);
    setPending(c.youtrackId);
    const res = await signIn("voter", {
      sessionId,
      youtrackId: c.youtrackId,
      redirect: false,
    });
    setPending(null);
    if (res?.error) {
      setError("Could not join. Try again or contact the moderator.");
      return;
    }
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12 flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Join {sessionName}</h1>
        <p className="text-sm text-muted-foreground">
          Pick your name to join the room.
        </p>
      </header>
      <Input
        placeholder="Search by name or login…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      <ul className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto">
        {filtered.length === 0 && (
          <li className="text-sm text-muted-foreground py-6 text-center">
            No match.
          </li>
        )}
        {filtered.map((c) => {
          const isClaimed = claimed.has(c.youtrackId);
          const isPending = pending === c.youtrackId;
          const displayName = c.fullName || c.name || c.login;
          const initials = displayName
            .split(/\s+/)
            .map((p) => p[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          return (
            <li key={c.youtrackId}>
              <button
                type="button"
                disabled={isClaimed || isPending || pending !== null}
                onClick={() => pick(c)}
                className={`w-full flex items-center gap-3 border rounded px-3 py-2 text-left ${
                  isClaimed
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-accent"
                }`}
              >
                <Avatar>
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="text-sm font-medium">{displayName}</div>
                  <div className="text-xs text-muted-foreground">{c.login}</div>
                </div>
                {isClaimed && (
                  <span className="text-xs text-muted-foreground">
                    already joined
                  </span>
                )}
                {isPending && (
                  <span className="text-xs text-muted-foreground">joining…</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Don&apos;t see yourself? Make sure you have a YouTrack account in the
        same workspace as the moderator.
      </p>
    </main>
  );
}
