"use client";
import { useEffect, useState } from "react";
import { getPusherClient } from "@/lib/pusher/client";

type Event = { type: string; payload: unknown };

export function useSessionRoom(sessionId: string, onEvent: (e: Event) => void) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const pusher = getPusherClient();
    const ch = pusher.subscribe(`private-session-${sessionId}`);
    const types = [
      "issue-changed", "phase-changed", "vote-cast", "votes-revealed",
      "final-submitted", "phase-skipped", "session-ended", "members-updated",
    ];
    const bound: Array<[string, (data: unknown) => void]> = [];
    for (const t of types) {
      const fn = (data: unknown) => onEvent({ type: t, payload: data });
      ch.bind(t, fn);
      bound.push([t, fn]);
    }
    ch.bind("pusher:subscription_succeeded", () => setConnected(true));
    return () => {
      for (const [t, fn] of bound) ch.unbind(t, fn);
      pusher.unsubscribe(`private-session-${sessionId}`);
    };
  }, [sessionId, onEvent]);

  return { connected };
}
