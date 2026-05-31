"use client";
import { useEffect } from "react";

export function usePresencePing(sessionId: string, intervalMs = 30_000) {
  useEffect(() => {
    const tick = () => { void fetch(`/api/sessions/${sessionId}/ping`, { method: "POST" }); };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [sessionId, intervalMs]);
}
