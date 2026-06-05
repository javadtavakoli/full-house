import { createApi } from "trackpilot";
import { youtrackConfig } from "./config";

export function youtrackApi(token: string) {
  const cfg = youtrackConfig();
  return createApi({
    baseUrl: cfg.baseUrl.replace(/\/$/, ""),
    token,
  });
}

export type YoutrackApi = ReturnType<typeof youtrackApi>;
