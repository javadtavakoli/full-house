"use client";
import { getStoredToken } from "@/hooks/use-youtrack-token";

/**
 * fetch wrapper that auto-attaches the YouTrack PAT (when present in
 * sessionStorage) via the `x-youtrack-token` header. The server's
 * `getYoutrackContext` helper uses this header for client-encryption-mode
 * users (whose ciphertext blob the server can't decrypt). Server-mode users
 * have the token decrypted from the DB; the header is benign there.
 */
export async function ytFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getStoredToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("x-youtrack-token", token);
  return fetch(input, { ...init, headers });
}
