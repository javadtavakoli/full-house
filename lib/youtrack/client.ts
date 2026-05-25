import { youtrackConfig } from "./config";

export class YoutrackError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
    this.name = "YoutrackError";
  }
}

type Opts = {
  token: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | undefined>;
};

export async function youtrackFetch<T = unknown>(path: string, opts: Opts): Promise<T> {
  const cfg = youtrackConfig();
  const url = new URL(path, cfg.baseUrl);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) if (v !== undefined) url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      Accept: "application/json",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }

  if (!res.ok) {
    throw new YoutrackError(res.status, parsed, `youtrack ${opts.method ?? "GET"} ${path} → ${res.status}`);
  }
  return parsed as T;
}
