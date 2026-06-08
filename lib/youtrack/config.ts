import { env } from "@/lib/env";

export type YoutrackConfig = {
  /**
   * Legacy deployment-wide fallback. Undefined in workspace-agnostic deployments.
   * Prefer per-user `oauth_accounts.workspace_base_url` and per-session
   * `sessions.workspace_base_url` everywhere; only use this as a last-resort fallback.
   */
  baseUrl: string | undefined;
  spField: string | undefined;
  durationField: string | undefined;
  doneStateNames: string[];
};

export function youtrackConfig(): YoutrackConfig {
  return {
    baseUrl: env.YT_BASE_URL,
    spField: env.YT_SP_FIELD,
    durationField: env.YT_DURATION_FIELD,
    doneStateNames: env.YT_DONE_STATE_NAMES,
  };
}
