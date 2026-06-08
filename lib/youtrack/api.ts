import { createApi } from "trackpilot";
import { youtrackConfig } from "./config";

export function youtrackApi(token: string, baseUrl?: string) {
  const cfg = youtrackConfig();
  const resolved = baseUrl ?? cfg.baseUrl;
  if (!resolved) {
    throw new Error("youtrackApi: no workspace URL — pass an explicit baseUrl");
  }
  return createApi({
    baseUrl: resolved.replace(/\/$/, ""),
    token,
  });
}

export type YoutrackApi = ReturnType<typeof youtrackApi>;
