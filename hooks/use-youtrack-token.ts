"use client";
import { useCallback, useEffect, useState } from "react";

const KEY = "yt-token";

export function setStoredToken(t: string | null) {
  if (typeof window === "undefined") return;
  if (t === null) sessionStorage.removeItem(KEY);
  else sessionStorage.setItem(KEY, t);
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(KEY);
}

export function useYoutrackToken() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    setToken(getStoredToken());
  }, []);
  const set = useCallback((t: string | null) => {
    setStoredToken(t);
    setToken(t);
  }, []);
  return { token, set };
}
